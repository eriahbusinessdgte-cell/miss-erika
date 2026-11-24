import type { Client } from "./types";

export function isQuiet(c: Client, days: number): boolean {
  if (c.status !== "Active") return false;
  const last = Math.max(
    c.last_message_at ? new Date(c.last_message_at).getTime() : 0,
    c.last_response_at ? new Date(c.last_response_at).getTime() : 0,
    new Date(c.created_at).getTime()
  );
  return (Date.now() - last) / 86400000 > days;
}
