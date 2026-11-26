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
  const entries: { name: string; rank: number; text: string; michael?: string }[] = [];
  let sent = 0;
  let pending = 0;
  let handled = 0;
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
    const replied = mine.some((m) => m.direction === "outgoing" && at(m) > newest);
    const withAnalysis = [...fresh].filter((m) => m.analysis).sort((a, b) => at(b) - at(a))[0];
    const a = withAnalysis?.analysis || null;
    // No reply from Erika is needed when Michael is already in the conversation or it is a plain closing thank-you.
    const noReply = a?.reply_needed === false && !replied;
    if (replied) sent++;
    else if (noReply) handled++;
    else pending++;
    const name = c.name.toUpperCase();
    let text: string;
    if (a) {
      const tags = a.tags.length ? a.tags.join(" – ") : "CLIENT UPDATE";
      text = `${name} – ${tags} – ${a.urgency}\n${a.internal_report || a.summary}`;
    } else {
      unanalysed++;
      text = `${name} – NOT ANALYSED YET\nThey sent a message that I haven't been able to summarise yet. I'll check it directly.`;
    }
    if (noReply) text += `\n(No reply needed from me: this continues your conversation with ${c.name.split(/\s+/)[0]}, or it was just a thank-you.)`;
    else if (!replied) text += `\n(I haven't sent a reply to ${c.name.split(/\s+/)[0]} yet.)`;
    const needs = a ? a.needs_michael || c.needs_michael : c.needs_michael;
    entries.push({
      name: c.name,
      rank: a ? (RANK[a.urgency] ?? 1) : 1,
      text,
      michael: needs ? a?.michael_reason || c.michael_reason || "Needs your personal response" : undefined,
    });
  }

  entries.sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));
  const n = entries.length;
  const michael = entries.filter((e) => e.michael);

  const lines: string[] = [`Hi Michael, here's the client update for ${args.prettyDate}.`];
  if (n === 0) {
    lines.push(byUnread ? "No unread client chats for this update." : "No client messages came in for this period.");
  } else {
    lines.push(`${n} client${n === 1 ? "" : "s"} sent messages.`);
    if (handled > 0) {
      const bits = [`${sent} replied`, `${pending} still pending`, `${handled} didn't need a reply from me`];
      lines.push(`Replies: ${bits.join(", ")}.`);
    } else if (pending === 0) lines.push(n === 1 ? "I've replied to them." : "I've replied to all of them.");
    else if (sent === 0) lines.push(n === 1 ? "I haven't replied yet." : "I haven't replied to any of them yet.");
    else lines.push(`I've replied to ${sent} of them. ${pending} ${pending === 1 ? "reply is" : "replies are"} still pending.`);
  }
  if (n > 0) lines.push("", entries.map((e) => e.text).join("\n\n"));
  if (args.quiet && args.quiet.clients.length > 0) {
    lines.push("", `Quiet clients (active clients we haven't heard from since ${args.quiet.since}):`);
    args.quiet.clients.forEach((q) => lines.push(`- ${q.name} (last message ${q.lastHeard})`));
  }
  lines.push("", "Need your personal response:");
  if (michael.length === 0) lines.push("None today.");
  else michael.forEach((e) => lines.push(`- ${e.name}: ${e.michael}`));

  return { body: lines.join("\n"), counts: { clients: n, sent, pending, michael: michael.length, unanalysed } };
}

/** True if saved messages or replies have changed since a sent report was produced. */
export function reportChanged(saved: { client_count: number; replies_sent: number; replies_pending: number; michael_count: number; sent_at: string | null }, now: ReportCounts, newestPasteMs: number): boolean {
  if (saved.client_count !== now.clients || saved.replies_sent !== now.sent || saved.replies_pending !== now.pending || saved.michael_count !== now.michael) return true;
  return !!saved.sent_at && newestPasteMs > new Date(saved.sent_at).getTime();
}
