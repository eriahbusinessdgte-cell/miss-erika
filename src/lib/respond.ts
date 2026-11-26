// Which chats are waiting for a reply, newest first. No imports, so it can be unit-tested directly.

export type RespondItem = {
  id: string;
  name: string;
  sent_at: string;
  body: string;
  sender: string;
  needs_michael: boolean;
};

type Row = { id: string; name: string; archived?: boolean; status?: string; needs_reply?: boolean; needs_michael?: boolean };
type Prev = { direction: "incoming" | "outgoing"; sender: string; body: string; sent_at: string; unread: boolean };

/**
 * A chat is waiting for a response when its newest message is from the client and either the app has
 * flagged it as needing a reply or it is still marked unread (a fresh scan that hasn't been opened yet).
 * Sorted by the newest message, most recent first, like a chat list.
 */
export function waitingForReply(rows: Row[], previews: Record<string, Prev | undefined>): RespondItem[] {
  const out: RespondItem[] = [];
  for (const r of rows) {
    if (r.archived || r.status === "Archived") continue;
    const p = previews[r.id];
    if (!p || p.direction !== "incoming") continue;
    if (!r.needs_reply && !p.unread) continue;
    out.push({ id: r.id, name: r.name, sent_at: p.sent_at, body: p.body, sender: p.sender, needs_michael: !!r.needs_michael });
  }
  return out.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
}
