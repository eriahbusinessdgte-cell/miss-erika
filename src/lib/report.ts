// Builds the daily report for Michael from what is actually saved. No AI call here, so the numbers can't be invented.
// Pure functions only (no imports) so they can be unit-tested.

export type RClient = { id: string; name: string; needs_michael: boolean; michael_reason: string };
export type RAnalysis = {
  summary: string;
  tags: string[];
  urgency: string;
  internal_report: string;
  needs_michael: boolean;
  michael_reason: string;
  reply_needed?: boolean;
};
export type RMessage = {
  client_id: string;
  direction: "incoming" | "outgoing";
  sender?: "erika" | "michael";
  created_at: number; // when it was pasted / saved (ms)
  sent_at: number; // when the client originally sent it (ms)
  analysis: RAnalysis | null;
};

export type ReportCounts = { clients: number; sent: number; pending: number; michael: number; unanalysed: number };
export type BuiltReport = { body: string; counts: ReportCounts };

const RANK: Record<string, number> = { URGENT: 0, "MEDIUM PRIORITY": 1, "NOT URGENT": 2 };

export function buildReport(args: {
  prettyDate: string;
  periodStart: number;
  periodEnd: number;
  clients: RClient[];
  messages: RMessage[];
  quiet?: { since: string; clients: { name: string; lastHeard: string }[] };
  /** When given, the report covers exactly these chats (the ones marked unread) instead of messages saved in the period. */
  unreadIds?: string[];
}): BuiltReport {
  // The report is only for clients who need Michael to respond personally. Erika may have replied to them too.
  const entries: { name: string; rank: number; text: string }[] = [];
  let sent = 0;
  let pending = 0;
  let unanalysed = 0;

  const byUnread = !!args.unreadIds;
  const unread = new Set(args.unreadIds || []);
  for (const c of args.clients) {
    if (byUnread && !unread.has(c.id)) continue;
    const mine = args.messages.filter((m) => m.client_id === c.id);
    const fresh = byUnread
      ? mine.filter((m) => m.direction === "incoming")
      : mine.filter((m) => m.direction === "incoming" && m.created_at >= args.periodStart && m.created_at < args.periodEnd);
    if (fresh.length === 0) continue;
    // By unread chat we compare real send times, because history imported together shares one saved time.
    const at = (m: RMessage) => (byUnread ? m.sent_at : m.created_at);
    const newest = Math.max(...fresh.map(at));
    const withAnalysis = [...fresh].filter((m) => m.analysis).sort((x, y) => at(y) - at(x))[0];
    const a = withAnalysis?.analysis || null;
    if (!a) {
      unanalysed++;
      continue;
    }
    const needs = a.needs_michael || c.needs_michael;
    if (!needs) continue;
    // Once Michael has personally written back after the client's message, there is nothing left for him to do.
    const michaelAnswered = mine.some((m) => m.direction === "outgoing" && m.sender === "michael" && at(m) > newest);
    if (michaelAnswered) continue;
    const replied = mine.some((m) => m.direction === "outgoing" && m.sender !== "michael" && at(m) > newest);
    if (replied) sent++;
    else pending++;
    const first = c.name.split(/\s+/)[0];
    const tags = a.tags.length ? a.tags.join(" – ") : "CLIENT UPDATE";
    const reason = a.michael_reason || c.michael_reason || "Needs your personal response";
    entries.push({
      name: c.name,
      rank: RANK[a.urgency] ?? 1,
      text:
        `${c.name.toUpperCase()} – ${tags} – ${a.urgency}\n${a.internal_report || a.summary}\n` +
        `Waiting for you: ${reason}.\n` +
        (replied ? `I've replied to ${first}. They're waiting for you to reach out personally.` : `I haven't replied to ${first} yet. They're waiting for you to reach out personally.`),
    });
  }

  entries.sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));
  const n = entries.length;

  const lines: string[] = [`Hi Michael, here's the update for ${args.prettyDate}.`];
  lines.push(n === 0 ? "No one needs your personal response today." : `${n} client${n === 1 ? " needs" : "s need"} your personal response.`);
  if (n > 0) lines.push("", entries.map((e) => e.text).join("\n\n"));
  if (args.quiet && args.quiet.clients.length > 0) {
    lines.push("", `Quiet clients (active clients we haven't heard from since ${args.quiet.since}):`);
    args.quiet.clients.forEach((q) => lines.push(`- ${q.name} (last message ${q.lastHeard})`));
  }

  return { body: lines.join("\n"), counts: { clients: n, sent, pending, michael: n, unanalysed } };
}

/** True if saved messages or replies have changed since a sent report was produced. */
export function reportChanged(saved: { client_count: number; replies_sent: number; replies_pending: number; michael_count: number; sent_at: string | null }, now: ReportCounts, newestPasteMs: number): boolean {
  if (saved.client_count !== now.clients || saved.replies_sent !== now.sent || saved.replies_pending !== now.pending || saved.michael_count !== now.michael) return true;
  return !!saved.sent_at && newestPasteMs > new Date(saved.sent_at).getTime();
}
