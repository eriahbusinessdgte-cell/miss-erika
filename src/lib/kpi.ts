// Weekly KPI calculations. Every number is computed from saved records; nothing is estimated or typed in by hand.
// Pure functions only (no imports) so they can be unit-tested. Time-zone handling is passed in through `Ctx`.

export const TARGET_CALLS = 4;
export const DAY = 86400000;

export type Ctx = {
  dayOf: (ms: number) => string; // "YYYY-MM-DD" in the chosen time zone
  isWorking: (day: string) => boolean; // Monday to Friday
  nextDay: (day: string) => string;
  endOfDay: (day: string) => number; // last millisecond of that day, as an instant
};

export type Status = "MET" | "IN PROGRESS" | "NOT MET" | "COMPLETED LATE" | "NO ACTIVITY";

// ---------- KPI 1: Instagram messages answered the same working day ----------

export type KLead = { id: string; name: string; handle: string; source: "comment" | "story_reply" | "new_follow"; created_at: number; engaged_at: number | null };
export type KMsg = { lead_id: string; direction: "incoming" | "outgoing"; sent_at: number };

export type IgItem = {
  leadId: string;
  name: string;
  handle: string;
  kind: "comment" | "story reply" | "DM";
  receivedMs: number;
  deadlineMs: number;
  answeredMs: number | null;
  state: "on time" | "late" | "pending" | "overdue";
};

export function deadlineFor(receivedMs: number, ctx: Ctx): number {
  let day = ctx.dayOf(receivedMs);
  let guard = 0;
  while (!ctx.isWorking(day) && guard++ < 7) day = ctx.nextDay(day);
  return ctx.endOfDay(day);
}

export function igKpi(a: { leads: KLead[]; messages: KMsg[]; weekStart: number; weekEnd: number; now: number; ctx: Ctx }) {
  const items: IgItem[] = [];
  const outs = (id: string) => a.messages.filter((m) => m.lead_id === id && m.direction === "outgoing").map((m) => m.sent_at).sort((x, y) => x - y);
  const push = (l: KLead, kind: IgItem["kind"], receivedMs: number) => {
    if (receivedMs < a.weekStart || receivedMs >= a.weekEnd) return;
    const answeredMs = outs(l.id).find((t) => t >= receivedMs) ?? null;
    const deadlineMs = deadlineFor(receivedMs, a.ctx);
    const state: IgItem["state"] = answeredMs !== null ? (answeredMs <= deadlineMs ? "on time" : "late") : a.now > deadlineMs ? "overdue" : "pending";
    items.push({ leadId: l.id, name: l.name, handle: l.handle, kind, receivedMs, deadlineMs, answeredMs, state });
  };
  for (const l of a.leads) {
    // A comment or story reply needs an answer too. New followers only get a single welcome message, so they are not counted here.
    if (l.source === "comment") push(l, "comment", l.engaged_at ?? l.created_at);
    if (l.source === "story_reply") push(l, "story reply", l.engaged_at ?? l.created_at);
    for (const m of a.messages) if (m.lead_id === l.id && m.direction === "incoming") push(l, "DM", m.sent_at);
  }
  items.sort((x, y) => x.receivedMs - y.receivedMs);
  const c = { total: items.length, onTime: 0, late: 0, pending: 0, overdue: 0 };
  for (const i of items) {
    if (i.state === "on time") c.onTime++;
    else if (i.state === "late") c.late++;
    else if (i.state === "pending") c.pending++;
    else c.overdue++;
  }
  const pct = c.total ? Math.round((c.onTime / c.total) * 100) : null;
  const status: Status = c.total === 0 ? "NO ACTIVITY" : c.late + c.overdue > 0 ? "NOT MET" : c.pending > 0 ? "IN PROGRESS" : "MET";
  return { items, ...c, pct, status };
}

// ---------- KPI 2: discovery calls actually attended ----------

export type KCall = { id: string; name: string; handle: string; source: string; booked_on: string | null; call_at: number | null; status: "Pending" | "Attended" | "Did Not Attend" | "Cancelled" };

export function callsKpi(a: { calls: KCall[]; weekStart: number; weekEnd: number; fridayEnd: number; now: number }) {
  const inWeek = a.calls.filter((c) => c.call_at !== null && c.call_at >= a.weekStart && c.call_at < a.weekEnd);
  const attended = inWeek.filter((c) => c.status === "Attended");
  const pending = inWeek.filter((c) => c.status === "Pending");
  const status: Status = attended.length >= TARGET_CALLS ? "MET" : a.now <= a.fridayEnd ? "IN PROGRESS" : "NOT MET";
  return {
    attended,
    attendedCount: attended.length,
    pendingCount: pending.length,
    didNotAttend: inWeek.filter((c) => c.status === "Did Not Attend").length,
    cancelled: inWeek.filter((c) => c.status === "Cancelled").length,
    booked: inWeek.length,
    target: TARGET_CALLS,
    status,
  };
}

// ---------- KPI 3: Monday client check-ins ----------

export type KClient = { id: string; name: string; status: string; created_at: number; last_message_at: number | null; last_response_at: number | null };
export type KCheckin = { client_id: string; mode: "checkin" | "acknowledgement"; created_at: number; draft_id: string | null };
export type KDraft = { id: string; client_id: string; kind: string; status: string; sent_at: number | null };
export type KOut = { client_id: string; created_at: number };

export type CheckinRow = { clientId: string; name: string; mode: "checkin" | "acknowledgement" | null; state: "not started" | "draft" | "copied" | "sent" | "sent late"; completedMs: number | null };

export function checkinKpi(a: { clients: KClient[]; checkins: KCheckin[]; drafts: KDraft[]; outgoing: KOut[]; mondayDay: string; mondayEnd: number; now: number; ctx: Ctx }) {
  const active = a.clients.filter((c) => c.status === "Active");
  const rows: CheckinRow[] = active.map((c) => {
    const row = a.checkins.find((k) => k.client_id === c.id);
    if (!row) return { clientId: c.id, name: c.name, mode: null, state: "not started", completedMs: null };
    let completed: number | null = null;
    let state: CheckinRow["state"] = "draft";
    if (row.mode === "checkin") {
      const d = a.drafts.filter((x) => x.client_id === c.id && x.kind === "checkin").sort((x, y) => (y.sent_at ?? 0) - (x.sent_at ?? 0));
      const sent = d.find((x) => x.status === "sent" && x.sent_at !== null);
      if (sent) completed = sent.sent_at;
      else if (d.some((x) => x.status === "copied")) state = "copied";
    } else {
      // A client with an unanswered message gets an acknowledgement instead; it counts once a reply has actually been sent.
      const t = a.outgoing.filter((o) => o.client_id === c.id && o.created_at >= row.created_at).map((o) => o.created_at).sort((x, y) => x - y)[0];
      if (t !== undefined) completed = t;
      else if (a.drafts.some((x) => x.client_id === c.id && x.status === "copied")) state = "copied";
    }
    if (completed !== null) state = a.ctx.dayOf(completed) === a.mondayDay ? "sent" : "sent late";
    return { clientId: c.id, name: c.name, mode: row.mode, state, completedMs: completed };
  });
  const total = rows.length;
  const onMonday = rows.filter((r) => r.state === "sent").length;
  const late = rows.filter((r) => r.state === "sent late").length;
  const status: Status =
    total === 0 ? "NO ACTIVITY" : onMonday === total ? "MET" : onMonday + late === total ? "COMPLETED LATE" : a.now <= a.mondayEnd ? "IN PROGRESS" : "NOT MET";
  return { rows, total, onMonday, late, completed: onMonday + late, notStarted: rows.filter((r) => r.state === "not started").length, status };
}

// ---------- KPI 4: quiet clients flagged to Michael by Tuesday ----------

export type KFlag = { client_id: string; status: "flagged" | "dismissed"; note: string; flagged_at: number; resolved_at: number | null };

export type QuietRow = {
  clientId: string;
  name: string;
  lastContactMs: number;
  lastMessageMs: number | null;
  lastResponseMs: number | null;
  daysSince: number;
  quietSinceMs: number;
  flag: KFlag | null;
  state: "needs review" | "flagged" | "flagged late" | "dismissed";
};

export function lastContact(c: KClient): number {
  return Math.max(c.last_message_at ?? 0, c.last_response_at ?? 0, c.created_at);
}

export function quietKpi(a: { clients: KClient[]; flags: KFlag[]; inactiveDays: number; tuesdayEnd: number; now: number }) {
  const rows: QuietRow[] = [];
  const later: QuietRow[] = [];
  for (const c of a.clients) {
    if (c.status !== "Active") continue;
    const last = lastContact(c);
    const quietSince = last + a.inactiveDays * DAY;
    const flag = a.flags.find((f) => f.client_id === c.id) ?? null;
    const isQuietNow = a.now >= quietSince;
    if (!isQuietNow && !flag) continue;
    const base = { clientId: c.id, name: c.name, lastContactMs: last, lastMessageMs: c.last_message_at, lastResponseMs: c.last_response_at, daysSince: Math.floor((a.now - last) / DAY), quietSinceMs: quietSince, flag };
    const state: QuietRow["state"] = !flag ? "needs review" : flag.status === "dismissed" ? "dismissed" : flag.flagged_at <= a.tuesdayEnd ? "flagged" : "flagged late";
    const row = { ...base, state };
    // Clients who only became quiet after Tuesday aren't expected to be flagged by Tuesday; they roll into next week.
    if (!flag && quietSince > a.tuesdayEnd) later.push(row);
    else rows.push(row);
  }
  const by = (s: QuietRow["state"]) => rows.filter((r) => r.state === s).length;
  const outstanding = by("needs review");
  const status: Status =
    rows.length === 0 ? "NO ACTIVITY" : outstanding > 0 ? (a.now <= a.tuesdayEnd ? "IN PROGRESS" : "NOT MET") : by("flagged late") > 0 ? "COMPLETED LATE" : "MET";
  return { rows, later, identified: rows.length, flagged: by("flagged"), flaggedLate: by("flagged late"), dismissed: by("dismissed"), outstanding, status };
}

// ---------- Friday report ----------

export type Fmt = { date: (ms: number) => string; dateTime: (ms: number) => string; day: (ms: number) => string };

export function buildKpiReport(a: {
  weekLabel: string;
  ig: ReturnType<typeof igKpi>;
  calls: ReturnType<typeof callsKpi>;
  checkins: ReturnType<typeof checkinKpi>;
  quiet: ReturnType<typeof quietKpi>;
  fmt: Fmt;
}): string {
  const { ig, calls, checkins, quiet, fmt } = a;
  const L: string[] = [`Hi Michael, here's my weekly KPI report for ${a.weekLabel}.`, "Everything below comes from my saved records. I haven't counted anything I couldn't confirm.", ""];

  L.push(`1. INSTAGRAM MESSAGES ANSWERED THE SAME WORKING DAY – ${ig.status}`);
  if (ig.total === 0) L.push("No Instagram messages or comments were logged this week.");
  else {
    L.push(`${ig.onTime} of ${ig.total} answered the same working day (${ig.pct}%). Target: 100%.`);
    L.push(`Pending: ${ig.pending}. Overdue: ${ig.overdue}. Answered late: ${ig.late}.`);
    for (const i of ig.items.filter((x) => x.state === "overdue" || x.state === "late")) L.push(`- ${i.name}${i.handle ? ` (@${i.handle})` : ""}: ${i.state === "late" ? "answered late" : "still not answered"} (${i.kind} received ${fmt.dateTime(i.receivedMs)})`);
  }
  L.push("");

  L.push(`2. MONDAY CLIENT CHECK-INS – ${checkins.status}`);
  if (checkins.total === 0) L.push("There were no active clients to check in with.");
  else {
    L.push(`${checkins.completed} of ${checkins.total} active clients checked in (${checkins.onMonday} on Monday${checkins.late ? `, ${checkins.late} later in the week` : ""}). Target: all ${checkins.total}.`);
    const missing = checkins.rows.filter((r) => r.state === "not started" || r.state === "draft" || r.state === "copied");
    if (missing.length) L.push(`Not marked as sent: ${missing.map((r) => r.name).join(", ")}.`);
  }
  L.push("");

  L.push(`3. QUIET CLIENTS FLAGGED TO YOU BY TUESDAY – ${quiet.status}`);
  if (quiet.identified === 0) L.push("No quiet clients were identified.");
  else {
    L.push(`${quiet.identified} quiet client${quiet.identified === 1 ? "" : "s"} identified. Flagged to you by Tuesday: ${quiet.flagged}. Flagged after Tuesday: ${quiet.flaggedLate}. Reviewed and not flagged: ${quiet.dismissed}. Not yet reviewed: ${quiet.outstanding}.`);
    for (const r of quiet.rows) L.push(`- ${r.name}: ${r.daysSince} days since contact, ${r.state}${r.flag?.note ? ` (${r.flag.note})` : ""}`);
  }
  if (quiet.later.length) L.push(`Newly quiet after Tuesday (to review next week): ${quiet.later.map((r) => r.name).join(", ")}.`);
  L.push("");

  L.push(`4. DISCOVERY CALLS ATTENDED – ${calls.status}`);
  L.push(`${calls.attendedCount} of ${calls.target} calls attended. Target: at least ${calls.target}.`);
  for (const c of calls.attended) L.push(`- ${c.name}${c.handle ? ` (@${c.handle})` : ""}, ${c.source || "source not recorded"}, ${c.call_at ? fmt.date(c.call_at) : ""}`);
  if (calls.pendingCount) L.push(`${calls.pendingCount} booked call${calls.pendingCount === 1 ? " is" : "s are"} still waiting for attendance to be confirmed, so not counted.`);
  if (calls.didNotAttend || calls.cancelled) L.push(`Did not attend: ${calls.didNotAttend}. Cancelled: ${calls.cancelled}.`);
  return L.join("\n");
}
