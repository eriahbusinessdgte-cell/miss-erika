import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatJson } from "@/lib/ai";
import { formatDateTime } from "@/lib/core";
import {
  checkUrls,
  ERIKA_SYSTEM,
  buildAnalysisPrompt,
  checkErikaReply,
  extractJson,
  fallbackReply,
  parseAnalysis,
  type Analysis,
  type PromptMessage,
} from "@/lib/erika";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Msg = { history_only?: boolean; id: string; direction: "incoming" | "outgoing"; sender: "erika" | "michael"; body: string; sent_at: string; created_at: string };

// Reads the client's conversation, writes Erika's analysis and reply draft, and saves everything.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let clientId = "";
  let messageId = "";
  try {
    const body = await req.json();
    clientId = String(body.clientId || "");
    messageId = String(body.messageId || "");
  } catch {
    /* handled below */
  }
  if (!clientId) return NextResponse.json({ ok: false, error: "Missing client." }, { status: 400 });

  const [{ data: client }, { data: msgsRaw }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
    supabase.from("client_messages").select("id,direction,sender,body,sent_at,created_at,history_only").eq("client_id", clientId).order("sent_at", { ascending: true }),
    supabase.from("settings").select("timezone").maybeSingle(),
  ]);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  const tz = settings?.timezone || "Asia/Manila";
  const msgs = (msgsRaw || []) as Msg[];

  // New = client messages pasted after the last reply that was marked as sent.
  // Saved-to-history messages never count as new. They are only answered when Erika asks for it (messageId).
  const lastOut = msgs.filter((m) => m.direction === "outgoing" && !m.history_only).reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  const fresh = messageId
    ? msgs.filter((m) => m.id === messageId && m.direction === "incoming")
    : msgs.filter((m) => m.direction === "incoming" && !m.history_only && new Date(m.created_at).getTime() > lastOut);
  if (fresh.length === 0) {
    return NextResponse.json({ ok: false, error: messageId ? "That message couldn't be found." : "There are no new unanswered messages from this client." });
  }
  const freshIds = new Set(fresh.map((m) => m.id));
  const toPrompt = (m: Msg): PromptMessage => ({ direction: m.direction, sender: m.sender, body: m.body, when: formatDateTime(m.sent_at, tz) });
  const context = msgs.filter((m) => !freshIds.has(m.id)).slice(-12).map(toPrompt);
  const freshPrompt = fresh.map(toPrompt);
  const freshText = fresh.map((m) => m.body).join("\n");

  const fail = async (error: string) => {
    await supabase.from("client_messages").update({ analysis_error: error }).in("id", [...freshIds]);
    return NextResponse.json({ ok: false, error });
  };

  const { data: res } = await supabase.from("resources").select("url").eq("active", true);
  const allowedUrls = (res || []).map((r: { url: string }) => r.url);

  // Ask the AI; if the reply breaks Erika's rules, ask once more, then fall back to a plain template.
  let analysis: Analysis | null = null;
  let retryNote: string | undefined;
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await chatJson(ERIKA_SYSTEM, buildAnalysisPrompt({ clientName: client.name, context, fresh: freshPrompt, retryNote }));
    if (!ai.ok) return fail(ai.error);
    const parsed = parseAnalysis(extractJson(ai.text), freshText);
    if (!parsed) {
      retryNote = "the answer was not valid JSON with all required keys";
      continue;
    }
    analysis = parsed;
    problems = [...checkErikaReply(parsed.reply), ...checkUrls(parsed.reply, allowedUrls)];
    if (problems.length === 0) break;
    retryNote = problems.join(", ");
  }
  if (!analysis) return fail("The AI's answer couldn't be read. Press Retry.");
  if (problems.length > 0) {
    analysis.reply = fallbackReply(client.name, analysis.needs_michael);
    analysis.flags.push("template_fallback");
  }

  // Save: older unsent drafts are kept but marked superseded; the new draft stays a draft until marked sent.
  const now = new Date().toISOString();
  await supabase.from("reply_drafts").update({ status: "superseded" }).eq("client_id", clientId).in("status", ["draft", "copied"]);
  const { data: draft, error: dErr } = await supabase
    .from("reply_drafts")
    .insert({
      client_id: clientId,
      kind: "reply",
      body: analysis.reply,
      original_body: analysis.reply,
      status: "draft",
      ai_flags: analysis.flags,
      source_message_ids: [...freshIds],
    })
    .select("id")
    .single();
  if (dErr) return fail(`Couldn't save the draft: ${dErr.message}`);

  const newest = fresh[fresh.length - 1];
  await supabase.from("client_messages").update({ analyzed: true, analysis_error: null }).in("id", [...freshIds]);
  await supabase.from("client_messages").update({ analysis }).eq("id", newest.id);

  const patch: Record<string, unknown> = {
    summary: analysis.summary,
    tags: analysis.tags,
    urgency: analysis.urgency,
    needs_reply: true,
  };
  if (analysis.needs_michael) {
    patch.needs_michael = true;
    patch.michael_reason = analysis.michael_reason;
    if (!client.needs_michael) {
      patch.michael_flagged_at = now;
      patch.michael_resolved_at = null;
    }
  }
  await supabase.from("clients").update(patch).eq("id", clientId);

  return NextResponse.json({ ok: true, draftId: draft?.id, usedTemplate: problems.length > 0 });
}
