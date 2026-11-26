// "Start working" shift logic. No imports, so it can be unit-tested directly.
// A shift takes its date from Michael's calendar (Spain) at the moment Erika presses Start working.

export const SHIFT_TZ = "Europe/Madrid";
export const SHIFT_MAX_HOURS = 14;

/** Calendar day (YYYY-MM-DD) of a moment on Michael's calendar. */
export function madridDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHIFT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** True while a shift is open: started, not finished, and under the 14 hour limit. */
export function shiftActive(startedAt: string | null | undefined, endedAt: string | null | undefined, shiftDate: string | null | undefined, nowMs: number): boolean {
  if (!startedAt || !shiftDate) return false;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return false;
  if (endedAt) {
    const end = new Date(endedAt).getTime();
    if (!Number.isNaN(end) && end >= start) return false;
  }
  // A clock a few seconds behind the start time still counts as open (the page ticks once a minute).
  return nowMs - start < SHIFT_MAX_HOURS * 3600_000;
}

/** The day the app treats as "today": the open shift's date, otherwise today on Michael's calendar. */
export function workDay(startedAt: string | null | undefined, endedAt: string | null | undefined, shiftDate: string | null | undefined, nowMs: number): string {
  return shiftActive(startedAt, endedAt, shiftDate, nowMs) && shiftDate ? shiftDate : madridDay(new Date(nowMs));
}
