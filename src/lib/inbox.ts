// Helpers for the "last message" preview shown in the Telegram and Instagram lists. No imports.

export type Preview = { direction: "incoming" | "outgoing"; sender: string; body: string; sent_at: string; unread: boolean };

/** One line for the list: "You: ..." for what Erika or Michael sent, the plain text for what the client sent. */
export function previewLine(p: Pick<Preview, "direction" | "sender" | "body">, max = 90): string {
  const flat = (p.body || "").replace(/\s+/g, " ").trim() || "[no text]";
  const text = flat.length > max ? flat.slice(0, max - 1).trimEnd() + "…" : flat;
  if (p.direction === "incoming") return text;
  return `${p.sender === "michael" ? "Michael" : "You"}: ${text}`;
}
