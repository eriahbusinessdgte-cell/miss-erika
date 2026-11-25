import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatJson } from "@/lib/ai";
import { addDays, formatDateTime, todayInTz, weekdayOf } from "@/lib/core";
import { checkUrls, checkErikaReply, extractJson, ERIKA_SYSTEM_CHECKIN, buildCheckinPrompt, type PromptMessage } from "@/lib/erika";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Msg = { direction: "incoming" | "outgoing"; sender: "erika" | "michael"; body: string; sent_at: string; created_at: string };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Writes one personalised Monday check-in draft for one client, from that client's own conversation history.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  let clientId = "";
  try { clientId = String((await req.json()).clientId || ""); } catch { /* handled below */ }
  if (!clientId) return NextResponse.json({ ok: false, error: "Missing client." }, { status: 400 });

  const [{ data: client }, { data: raw }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
    supabase.from("client_messages").select("direction,sender,body,sent_at,created_at").eq("client_id", clientId).order("sent_at", { ascending: true }),
    supabase.from("settings").select("timezone").maybeSingle(),
  ]);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  const tz = settings?.timezone || "Asia/Manila";
  const msgs = (raw || []) as Msg[];

  // A client with an unanswered message gets an acknowledgement, never an unrelated check-in.
  const lastOut = msgs.filter((m) => m.direction === "outgoing").reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  if (msgs.some((m) => m.direction === "incoming" && new Date(m.created_at).getTime() > lastOut)) {
    return NextResponse.json({ ok: false, error: "This client has an unanswered message. Reply to that first instead of sending a general check-in." });
  }

  const today = todayInTz(tz);
  const weekStart = addDays(today, -((weekdayOf(today) + 6) % 7));
  const { data: others } = await supabase.from("reply_drafts").select("body,client_id").eq("kind", "checkin").gte("created_at", weekStart);
  const used = new Set((others || []).filter((d: { client_id: string }) => d.client_id !== clientId).map((d: { body: string }) => norm(d.body)));

  const history: PromptMessage[] = msgs.slice(-24).map((m) => ({ direction: m.direction, sender: m.sender, body: m.body, when: formatDateTime(m.sent_at, tz) }));
  let body = "";
  let note: string | undefined;
  for (let attempt = 0; attempt < 2 && !body; attempt++) {
    const ai = await chatJson(ERIKA_SYSTEM_CHECKIN, buildCheckinPrompt({ clientName: client.name, summary: client.summary, history, retryNote: note }));
    if (!ai.ok) return NextResponse.json({ ok: false, error: ai.error });
    const parsed = extractJson(ai.text) as { reply?: unknown } | null;
    const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    const problems = reply ? [...checkErikaReply(reply), ...checkUrls(reply, [])] : ["no reply written"];
    if (reply && !/check(ing)? in on you/i.test(reply)) problems.push("missing the 'Michael asked me to also check in on you' line");
    if (reply && used.has(norm(reply))) problems.push("identical to another client's check-in");
    if (problems.length) { note = problems.join(", "); continue; }
    body = reply;
  }
  if (!body) return NextResponse.json({ ok: false, error: `Couldn't write a check-in that follows Erika's rules (${note}). Press Retry.` });

  await supabase.from("reply_drafts").update({ status: "superseded" }).eq("client_id", clientId).in("status", ["draft", "copied"]);
  const { data: draft, error } = await supabase.from("reply_drafts").insert({ client_id: clientId, kind: "checkin", body, original_body: body, status: "draft" }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: `Couldn't save the draft: ${error.message}` });
  await supabase.from("checkins").update({ draft_id: draft?.id }).eq("client_id", clientId).eq("week_start", weekStart);
  return NextResponse.json({ ok: true, draftId: draft?.id });
}
