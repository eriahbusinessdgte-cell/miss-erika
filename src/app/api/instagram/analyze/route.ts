import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatJson } from "@/lib/ai";
import { formatDateTime } from "@/lib/core";
import { extractJson } from "@/lib/erika";
import { buildEditorPrompt, IG_EDITOR_SYSTEM, IG_SYSTEM, buildIgPrompt, checkMichaelReply, detectHandover, placeholdersIn, type LearnedEdit, parseIgAnalysis, pickSections, type IgAnalysis, type IgPromptMsg, type Source } from "@/lib/ig";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Msg = { history_only?: boolean; id: string; direction: "incoming" | "outgoing"; body: string; sent_at: string; created_at: string };

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let leadId = "";
  let messageId = "";
  try { const body = await req.json(); leadId = String(body.clientId || ""); messageId = String(body.messageId || ""); } catch { /* handled below */ }
  if (!leadId) return NextResponse.json({ ok: false, error: "Missing lead." }, { status: 400 });

  const [{ data: lead }, { data: raw }, { data: settings }, { data: kn }, { data: res }] = await Promise.all([
    supabase.from("ig_leads").select("*").eq("id", leadId).maybeSingle(),
    supabase.from("ig_messages").select("id,direction,body,sent_at,created_at,history_only").eq("lead_id", leadId).order("sent_at", { ascending: true }),
    supabase.from("settings").select("timezone").maybeSingle(),
    supabase.from("knowledge").select("key,title,body"),
    supabase.from("resources").select("name,url,purpose,active").eq("active", true),
  ]);
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  const tz = settings?.timezone || "Asia/Manila";
  const msgs = (raw || []) as Msg[];

  // Saved-to-history messages never count as new. They are only answered when Erika asks for it (messageId).
  const lastOut = msgs.filter((m) => m.direction === "outgoing" && !m.history_only).reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  const fresh = messageId
    ? msgs.filter((m) => m.id === messageId && m.direction === "incoming")
    : msgs.filter((m) => m.direction === "incoming" && !m.history_only && new Date(m.created_at).getTime() > lastOut);
  if (fresh.length === 0) return NextResponse.json({ ok: false, error: messageId ? "That message couldn't be found." : "There are no new unanswered messages from this lead." });
  const ids = fresh.map((m) => m.id);
  const freshText = fresh.map((m) => m.body).join("\n");

  const fail = async (error: string) => {
    await supabase.from("ig_messages").update({ analysis_error: error }).in("id", ids);
    return NextResponse.json({ ok: false, error });
  };
  const handOver = async (reason: string) => {
    await supabase.from("ig_messages").update({ analyzed: true, analysis_error: null }).in("id", ids);
    await supabase.from("ig_drafts").update({ status: "superseded" }).eq("lead_id", leadId).in("status", ["draft", "copied"]);
    await supabase.from("ig_leads").update({ needs_michael: true, michael_reason: reason, needs_reply: true }).eq("id", leadId);
    return NextResponse.json({ ok: true, handedOver: true, reason });
  };

  // Bible rule 7 and "hand over to Michael": decided by code, not by the AI.
  const rule = detectHandover(freshText);
  if (rule) return handOver(rule);
  if (lead.michael_sent_link) return handOver("Michael may already have sent this person a link. Check with him before replying.");
  if (lead.may_know_michael) return handOver("This person may know Michael. Ask him before replying.");

  const resources = (res || []).filter((r: { url: string }) => r.url);
  const allowedUrls = resources.map((r: { url: string }) => r.url);
  const toPrompt = (m: Msg): IgPromptMsg => ({ direction: m.direction, body: m.body, when: formatDateTime(m.sent_at, tz) });
  const context = msgs.filter((m) => !ids.includes(m.id)).slice(-14).map(toPrompt);
  const theirCount = msgs.filter((m) => m.direction === "incoming").length;
  const ourCount = msgs.filter((m) => m.direction === "outgoing").length;
  // Learn from Erika: recent drafts she rewrote before sending.
  const { data: edited } = await supabase.from("ig_drafts").select("body,original_body").eq("kind", "reply").eq("edited", true).not("original_body", "is", null).in("status", ["draft", "copied", "sent"]).order("created_at", { ascending: false }).limit(6);
  const edits: LearnedEdit[] = ((edited || []) as { body: string; original_body: string }[]).filter((e) => e.body.trim() !== e.original_body.trim()).slice(0, 4).map((e) => ({ ai: e.original_body, final: e.body }));
  const sent = msgs.filter((m) => m.direction === "outgoing").slice(-5).map((m) => m.body);
  const wanted = pickSections(lead.stage, freshText);
  const sections = (kn || []).filter((k: { key: string }) => wanted.includes(k.key)).map((k: { title: string; body: string }) => ({ title: k.title, body: k.body }));
  if (sections.length === 0) return fail("The Sales Bible is missing from the database. Open Instagram → Sales Bible to check.");

  let analysis: IgAnalysis | null = null;
  let retryNote: string | undefined;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const ai = await chatJson(IG_SYSTEM, buildIgPrompt({ name: lead.name, source: lead.source as Source, stage: lead.stage, sections, resources, context, fresh: fresh.map(toPrompt), retryNote, sent, theirCount, ourCount, edits }));
    if (!ai.ok) return fail(ai.error);
    const parsed = parseIgAnalysis(extractJson(ai.text), lead.stage);
    if (!parsed) { retryNote = "the answer was not valid JSON with all required keys"; continue; }
    analysis = parsed;
    problems = parsed.needs_michael ? [] : checkMichaelReply(parsed.reply, { stage: parsed.stage, allowedUrls, previous: sent });
    if (problems.length === 0) break;
    retryNote = problems.join(", ");
  }
  if (!analysis) return fail("The AI's answer couldn't be read. Press Retry.");
  // If it still breaks the Bible's rules, don't guess: leave it for Michael.
  // A draft that only overlaps earlier wording after several tries is still usable: Erika can tweak it.
  if (problems.length > 0 && !problems.every((p) => p.startsWith("repeats wording"))) {
    analysis = { ...analysis, reply: "", needs_michael: true, michael_reason: `Couldn't write a safe reply (${problems.join(", ")}). Needs you.` };
  }

  // Second pass: an editor makes the draft warm, personal and flowing. If its version breaks a rule, keep the first one.
  if (analysis.reply && !analysis.needs_michael) {
    const ed = await chatJson(IG_EDITOR_SYSTEM, buildEditorPrompt({ name: lead.name, draft: analysis.reply, latest: fresh.map((m) => m.body), sent, edits }));
    if (ed.ok) {
      const edited = (extractJson(ed.text) as { reply?: unknown } | null)?.reply;
      if (typeof edited === "string" && edited.trim().length > 20) {
        const clean = edited.trim();
        const keepsLinks = (analysis.reply.match(/https?:\/\/[^\s)]+/g) || []).every((u) => clean.includes(u));
        const keepsHoles = placeholdersIn(analysis.reply).every((h) => clean.includes(h));
        if (keepsLinks && keepsHoles && checkMichaelReply(clean, { stage: analysis.stage, allowedUrls, previous: sent }).length === 0) analysis = { ...analysis, reply: clean };
      }
    }
  }

  await supabase.from("ig_drafts").update({ status: "superseded" }).eq("lead_id", leadId).in("status", ["draft", "copied"]);
  if (analysis.reply) {
    const { error } = await supabase.from("ig_drafts").insert({
      lead_id: leadId, kind: "reply", body: analysis.reply, original_body: analysis.reply, status: "draft",
      contains_link: allowedUrls.some((u: string) => analysis!.reply.includes(u)),
    });
    if (error) return fail(`Couldn't save the draft: ${error.message}`);
  }
  await supabase.from("ig_messages").update({ analyzed: true, analysis_error: null }).in("id", ids);
  const patch: Record<string, unknown> = { summary: analysis.summary, needs_reply: true, stage: analysis.stage };
  if (analysis.door) patch.door = analysis.door;
  if (analysis.needs_michael) { patch.needs_michael = true; patch.michael_reason = analysis.michael_reason; }
  await supabase.from("ig_leads").update(patch).eq("id", leadId);
  return NextResponse.json({ ok: true, handedOver: analysis.needs_michael });
}
