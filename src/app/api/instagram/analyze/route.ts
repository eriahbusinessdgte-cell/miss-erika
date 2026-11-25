import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatJson } from "@/lib/ai";
import { formatDateTime } from "@/lib/core";
import { extractJson } from "@/lib/erika";
import { IG_SYSTEM, buildIgPrompt, checkMichaelReply, detectHandover, parseIgAnalysis, pickSections, type IgAnalysis, type IgPromptMsg, type Source } from "@/lib/ig";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Msg = { id: string; direction: "incoming" | "outgoing"; body: string; sent_at: string; created_at: string };

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let leadId = "";
  try { leadId = String((await req.json()).clientId || ""); } catch { /* handled below */ }
  if (!leadId) return NextResponse.json({ ok: false, error: "Missing lead." }, { status: 400 });

  const [{ data: lead }, { data: raw }, { data: settings }, { data: kn }, { data: res }] = await Promise.all([
    supabase.from("ig_leads").select("*").eq("id", leadId).maybeSingle(),
    supabase.from("ig_messages").select("id,direction,body,sent_at,created_at").eq("lead_id", leadId).order("sent_at", { ascending: true }),
    supabase.from("settings").select("timezone").maybeSingle(),
    supabase.from("knowledge").select("key,title,body"),
    supabase.from("resources").select("name,url,purpose,active").eq("active", true),
  ]);
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  const tz = settings?.timezone || "Asia/Manila";
  const msgs = (raw || []) as Msg[];

  const lastOut = msgs.filter((m) => m.direction === "outgoing").reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  const fresh = msgs.filter((m) => m.direction === "incoming" && new Date(m.created_at).getTime() > lastOut);
  if (fresh.length === 0) return NextResponse.json({ ok: false, error: "There are no new unanswered messages from this lead." });
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
  const context = msgs.filter((m) => !ids.includes(m.id)).slice(-10).map(toPrompt);
  const wanted = pickSections(lead.stage, freshText);
  const sections = (kn || []).filter((k: { key: string }) => wanted.includes(k.key)).map((k: { title: string; body: string }) => ({ title: k.title, body: k.body }));
  if (sections.length === 0) return fail("The Sales Bible is missing from the database. Open Instagram → Sales Bible to check.");

  let analysis: IgAnalysis | null = null;
  let retryNote: string | undefined;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await chatJson(IG_SYSTEM, buildIgPrompt({ name: lead.name, source: lead.source as Source, stage: lead.stage, sections, resources, context, fresh: fresh.map(toPrompt), retryNote }));
    if (!ai.ok) return fail(ai.error);
    const parsed = parseIgAnalysis(extractJson(ai.text), lead.stage);
    if (!parsed) { retryNote = "the answer was not valid JSON with all required keys"; continue; }
    analysis = parsed;
    problems = parsed.needs_michael ? [] : checkMichaelReply(parsed.reply, { stage: parsed.stage, allowedUrls });
    if (problems.length === 0) break;
    retryNote = problems.join(", ");
  }
  if (!analysis) return fail("The AI's answer couldn't be read. Press Retry.");
  // If it still breaks the Bible's rules, don't guess: leave it for Michael.
  if (problems.length > 0) {
    analysis = { ...analysis, reply: "", needs_michael: true, michael_reason: `Couldn't write a safe reply (${problems.join(", ")}). Needs you.` };
  }

  await supabase.from("ig_drafts").update({ status: "superseded" }).eq("lead_id", leadId).in("status", ["draft", "copied"]);
  if (analysis.reply) {
    const { error } = await supabase.from("ig_drafts").insert({
      lead_id: leadId, kind: "reply", body: analysis.reply, status: "draft",
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
