// Morning Telegram scan state. No imports, so it can be unit-tested directly.

/** The next 07:00 in Manila (UTC+8, no daylight saving) strictly after the given moment. */
export function watchUntil(requestedAt: Date): Date {
  const MANILA = 8 * 3600_000;
  const local = new Date(requestedAt.getTime() + MANILA); // Manila wall clock stored as UTC fields
  const seven = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 7, 0, 0);
  const target = local.getTime() < seven ? seven : seven + 86400_000;
  return new Date(target - MANILA);
}

export type ScanState =
  | { kind: "needed" } // no scan today: show the button
  | { kind: "waiting"; until: Date } // started, first scan not done yet
  | { kind: "running"; until: Date; lastAt: Date } // started, updating every 3 hours
  | { kind: "done" }; // scanned today and the watch has ended

/**
 * requestedAt: when Erika pressed the button. lastAt: when the last scan finished.
 * todayOf: gives the calendar day (YYYY-MM-DD) of a moment in her chosen time zone.
 */
export function scanState(now: Date, requestedAt: Date | null, lastAt: Date | null, todayOf: (d: Date) => string): ScanState {
  if (requestedAt) {
    const until = watchUntil(requestedAt);
    if (now.getTime() < until.getTime()) {
      if (!lastAt || lastAt.getTime() < requestedAt.getTime()) return { kind: "waiting", until };
      return { kind: "running", until, lastAt };
    }
  }
  if (lastAt && todayOf(lastAt) === todayOf(now)) return { kind: "done" };
  return { kind: "needed" };
}

/**
 * When the hourly check (at 29 minutes past each hour) will next start a scan after the last one finished.
 * A scan is only due once 2 hours 50 minutes have passed.
 */
export function nextScanAt(lastAt: Date): Date {
  const due = lastAt.getTime() + (2 * 60 + 50) * 60_000;
  const d = new Date(due);
  d.setUTCSeconds(0, 0);
  if (d.getUTCMinutes() > 29 || (d.getUTCMinutes() === 29 && due > d.getTime())) d.setUTCHours(d.getUTCHours() + 1);
  d.setUTCMinutes(29, 0, 0);
  return d;
}
