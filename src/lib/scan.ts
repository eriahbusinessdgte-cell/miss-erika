// Telegram scan state. No imports, so it can be unit-tested directly.
// A scan runs only when Erika asks for it: pressing the button sets scan_requested_at, the watcher on her Mac
// picks it up at its next check (29 minutes past the hour), scans once, and records scan_last_at.

export type ScanState =
  | { kind: "pending"; requestedAt: Date } // asked for, not finished yet
  | { kind: "idle"; lastAt: Date | null }; // nothing waiting

export function scanState(requestedAt: Date | null, lastAt: Date | null): ScanState {
  if (requestedAt && (!lastAt || lastAt.getTime() < requestedAt.getTime())) return { kind: "pending", requestedAt };
  return { kind: "idle", lastAt };
}

/** The next check at 29 minutes past the hour (UTC) strictly after the given moment. */
export function nextCheckAt(from: Date): Date {
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  if (d.getUTCMinutes() >= 29) d.setUTCHours(d.getUTCHours() + 1);
  d.setUTCMinutes(29, 0, 0);
  return d;
}
