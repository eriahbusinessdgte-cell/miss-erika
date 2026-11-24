// Pure date and task rules. No imports, so these can be unit-tested directly.

export type Recurrence = "None" | "Daily" | "Weekdays" | "Weekly" | "Monthly";

export const DAILY_PASTE_TITLE = "Paste Telegram Messages from After Shift Hours";
export const DAILY_REPORT_TITLE = "Review & Send Daily Client Report to Michael";

/** Today's calendar date (YYYY-MM-DD) in the chosen time zone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA gives YYYY-MM-DD
}

/** Day of week (0 = Sunday ... 6 = Saturday) for a YYYY-MM-DD date. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday to Friday. */
export function isWorkingDate(dateStr: string): boolean {
  const w = weekdayOf(dateStr);
  return w >= 1 && w <= 5;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Due date of the next occurrence of a recurring task. */
export function nextDueDate(due: string, recurrence: Recurrence): string | null {
  switch (recurrence) {
    case "Daily":
      return addDays(due, 1);
    case "Weekdays": {
      let next = addDays(due, 1);
      while (!isWorkingDate(next)) next = addDays(next, 1);
      return next;
    }
    case "Weekly":
      return addDays(due, 7);
    case "Monthly":
      return addMonths(due, 1);
    default:
      return null;
  }
}

export type TaskBucket = "done" | "overdue" | "today" | "upcoming" | "undated";

export function bucketOf(
  task: { status: string; due_date: string | null },
  today: string
): TaskBucket {
  if (task.status === "Done") return "done";
  if (!task.due_date) return "undated";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  return "upcoming";
}

export function greetingFor(tz: string, now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)
  ) % 24;
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Sort: High priority first, then earliest due date. */
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
export function compareTasks(
  a: { priority: string; due_date: string | null; title: string },
  b: { priority: string; due_date: string | null; title: string }
): number {
  const da = a.due_date ?? "9999-12-31";
  const db = b.due_date ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  const pa = PRIORITY_RANK[a.priority] ?? 1;
  const pb = PRIORITY_RANK[b.priority] ?? 1;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffsetMs(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Turn a wall-clock time typed as "YYYY-MM-DDTHH:mm" in the chosen time zone into a real UTC instant. */
export function zonedToUtc(local: string, tz: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - tzOffsetMs(tz, new Date(guess));
  t = guess - tzOffsetMs(tz, new Date(t)); // second pass handles daylight-saving edges
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/** The same instant as "YYYY-MM-DDTHH:mm" wall-clock time in the chosen time zone. */
export function utcToZonedInput(iso: string, tz: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}
