// Hot Seat helpers. No imports, so they can be unit-tested directly.

function dow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function plus(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the working week a date belongs to. Saturday and Sunday count toward the coming week. */
export function weekStartOf(dateStr: string): string {
  const w = dow(dateStr);
  if (w === 0) return plus(dateStr, 1);
  if (w === 6) return plus(dateStr, 2);
  return plus(dateStr, 1 - w);
}

/** The Hot Seat is on Thursday of that week. */
export function thursdayOf(weekStart: string): string {
  return plus(weekStart, 3);
}

/** Turns pasted text (one name per line, or separated by commas) into clean names, without duplicates. */
export function parseNames(text: string, existing: string[] = []): string[] {
  const seen = new Set(existing.map((n) => n.trim().toLowerCase()));
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const name = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** The message Erika sends Michael on Wednesday. `thursdayLabel` is already formatted, e.g. "Thursday, 26 Nov". */
export function buildHotSeatReport(names: string[], thursdayLabel: string, manager: string, from: string): string {
  const head = `Hi ${manager}, here is the Hot Seat lineup for tomorrow, ${thursdayLabel}:`;
  if (names.length === 0) return `${head}\n\nNo one has been confirmed for the Hot Seat yet.\n\n${from}`;
  const list = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  return `${head}\n\n${list}\n\n${from}`;
}

export const HOT_SEAT_FIND_TITLE = "Look for this week's Hot Seat participants";
export const HOT_SEAT_REPORT_TITLE = "Send Michael the Hot Seat report for Thursday";

/**
 * Which weekly Hot Seat tasks should exist today. Monday's task appears from Monday to Wednesday (so it is still
 * there if the app is opened late), Wednesday's from Wednesday to Thursday. ref_date is the day the task belongs to.
 */
export function hotSeatTasksDue(today: string): { kind: "hot_seat_find" | "hot_seat_report"; ref_date: string }[] {
  const w = dow(today);
  const monday = weekStartOf(today);
  const out: { kind: "hot_seat_find" | "hot_seat_report"; ref_date: string }[] = [];
  if (w >= 1 && w <= 3) out.push({ kind: "hot_seat_find", ref_date: monday });
  if (w >= 3 && w <= 4) out.push({ kind: "hot_seat_report", ref_date: plus(monday, 2) });
  return out;
}
