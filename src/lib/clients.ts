import type { Client } from "./types";

/** Quiet = an active client who hasn't messaged since the cutoff (Tuesday of the previous week by default). */
export function isQuiet(c: Client, cutoffMs: number): boolean {
  if (c.status !== "Active") return false;
  const heard = c.last_message_at ? new Date(c.last_message_at).getTime() : new Date(c.created_at).getTime();
  return heard < cutoffMs;
}
