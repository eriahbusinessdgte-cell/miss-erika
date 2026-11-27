// "Next week" preview for the dashboard. No imports, so it can be unit-tested directly.

export type WeekItem = { text: string; kind: "daily" | "weekly" | "task"; href?: string; priority?: string };
export type WeekDay = { date: string; weekday: string; items: WeekItem[] };
export type WeekTask = { title: string; due_date: string | null; status: string; kind: string; priority?: string };

const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dow = (d: string) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x)).getUTCDay(); };
const plus = (d: string, n: number) => { const [y, m, x] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };

/** Monday of the next working week: the Monday after this week's Friday (Saturday and Sunday look ahead to the coming Monday). */
export function nextMonday(today: string): string {
  const w = dow(today);
  if (w === 0) return plus(today, 1);
  if (w === 6) return plus(today, 2);
  return plus(today, 8 - w);
}

/** What the next working week holds: the routine jobs of each weekday plus any open tasks already due that day. */
export function weekAhead(today: string, tasks: WeekTask[]): WeekDay[] {
  const start = nextMonday(today);
  const days: WeekDay[] = [];
  for (let i = 0; i < 5; i++) {
    const date = plus(start, i);
    const w = dow(date);
    const items: WeekItem[] = [{ text: "Review and send the daily client report to Michael", kind: "daily", href: "/reports" }];
    if (w === 1) items.push({ text: "Check in with every active Telegram client", kind: "weekly", href: "/kpis/checkins" }, { text: "Look for this week's Hot Seat participants", kind: "weekly" });
    if (w === 2) items.push({ text: "Review quiet clients and flag them to Michael", kind: "weekly", href: "/kpis/quiet" });
    if (w === 3) items.push({ text: "Send Michael the Hot Seat report for Thursday", kind: "weekly" });
    if (w === 4) items.push({ text: "Hot Seat day", kind: "weekly" });
    if (w === 5) items.push({ text: "Copy and send the weekly KPI report to Michael", kind: "weekly", href: "/kpis" });
    for (const t of tasks) {
      if (t.status !== "Done" && t.due_date === date && t.kind === "manual") items.push({ text: t.title, kind: "task", href: "/tasks", priority: t.priority });
    }
    days.push({ date, weekday: NAMES[w], items });
  }
  return days;
}
