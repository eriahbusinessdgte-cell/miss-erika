import { test } from "node:test";
import assert from "node:assert/strict";
import { igKpi, callsKpi, checkinKpi, quietKpi, deadlineFor, buildKpiReport } from "../src/lib/kpi.ts";

const DAY = 86400000;
// Simple UTC calendar: day 0 = Mon 2026-11-23
const base = Date.UTC(2026, 10, 23);
const dn = (n) => new Date(base + n * DAY).toISOString().slice(0, 10);
const ctx = {
  dayOf: (ms) => new Date(ms).toISOString().slice(0, 10),
  isWorking: (d) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; },
  nextDay: (d) => new Date(new Date(d + "T00:00:00Z").getTime() + DAY).toISOString().slice(0, 10),
  endOfDay: (d) => new Date(d + "T00:00:00Z").getTime() + DAY - 1,
};
const H = 3600000;
const weekStart = base, weekEnd = base + 7 * DAY, fridayEnd = base + 5 * DAY - 1;

test("deadline is end of the same working day; weekend rolls to Monday", () => {
  assert.equal(deadlineFor(base + 10 * H, ctx), base + DAY - 1);
  assert.equal(deadlineFor(base + 5 * DAY + 3 * H, ctx), base + 7 * DAY + DAY - 1); // Saturday -> next Monday
});

test("KPI 1 counts only replies actually sent, same working day", () => {
  const leads = [
    { id: "a", name: "A", handle: "a", source: "comment", created_at: base + 9 * H, engaged_at: null },
    { id: "b", name: "B", handle: "b", source: "comment", created_at: base + 9 * H, engaged_at: null },
    { id: "c", name: "C", handle: "c", source: "new_follow", created_at: base + 9 * H, engaged_at: null },
    { id: "d", name: "D", handle: "d", source: "story_reply", created_at: base + 2 * DAY + 9 * H, engaged_at: null },
  ];
  const messages = [
    { lead_id: "a", direction: "outgoing", sent_at: base + 10 * H }, // on time
    { lead_id: "b", direction: "outgoing", sent_at: base + DAY + H }, // next day = late
    { lead_id: "a", direction: "incoming", sent_at: base + 11 * H }, // DM, never answered afterwards
  ];
  const k = igKpi({ leads, messages, weekStart, weekEnd, now: base + 3 * DAY, ctx });
  assert.equal(k.total, 4); // a-comment, b-comment, a-DM, d-story reply (new follower c is not counted)
  assert.equal(k.onTime, 1);
  assert.equal(k.late, 1);
  assert.equal(k.overdue, 2); // a's DM and d's story reply (Wed deadline passed)
  assert.equal(k.status, "NOT MET");
  const k2 = igKpi({ leads: [leads[0]], messages: [messages[0]], weekStart, weekEnd, now: base + 20 * H, ctx });
  assert.equal(k2.status, "MET"); assert.equal(k2.pct, 100);
  const k3 = igKpi({ leads: [{ ...leads[3], created_at: base + 3 * DAY + H }], messages: [], weekStart, weekEnd, now: base + 3 * DAY + 2 * H, ctx });
  assert.equal(k3.status, "IN PROGRESS"); assert.equal(k3.pending, 1);
});

test("KPI 2 counts only calls confirmed Attended", () => {
  const call = (s, id) => ({ id, name: id, handle: id, source: "comment", booked_on: null, call_at: base + 2 * DAY, status: s });
  const calls = [call("Attended", "1"), call("Attended", "2"), call("Pending", "3"), call("Did Not Attend", "4"), call("Cancelled", "5")];
  const k = callsKpi({ calls, weekStart, weekEnd, fridayEnd, now: fridayEnd + H });
  assert.equal(k.attendedCount, 2); assert.equal(k.pendingCount, 1); assert.equal(k.status, "NOT MET");
  assert.equal(callsKpi({ calls: [1, 2, 3, 4].map((i) => call("Attended", "x" + i)), weekStart, weekEnd, fridayEnd, now: fridayEnd + H }).status, "MET");
  assert.equal(callsKpi({ calls, weekStart, weekEnd, fridayEnd, now: base + 2 * DAY }).status, "IN PROGRESS");
  // a call outside the week doesn't count
  assert.equal(callsKpi({ calls: [{ ...call("Attended", "z"), call_at: base - DAY }], weekStart, weekEnd, fridayEnd, now: fridayEnd }).attendedCount, 0);
});

test("KPI 3 counts only sent check-ins; acknowledgement counts once a reply is sent", () => {
  const clients = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id, status: "Active", created_at: 0, last_message_at: null, last_response_at: null }));
  clients.push({ id: "p", name: "p", status: "Paused", created_at: 0, last_message_at: null, last_response_at: null });
  const checkins = [
    { client_id: "a", mode: "checkin", created_at: base + H, draft_id: null },
    { client_id: "b", mode: "checkin", created_at: base + H, draft_id: null },
    { client_id: "c", mode: "acknowledgement", created_at: base + H, draft_id: null },
    { client_id: "d", mode: "checkin", created_at: base + H, draft_id: null },
  ];
  const drafts = [
    { id: "1", client_id: "a", kind: "checkin", status: "sent", sent_at: base + 2 * H },
    { id: "2", client_id: "b", kind: "checkin", status: "copied", sent_at: null },
    { id: "3", client_id: "d", kind: "checkin", status: "sent", sent_at: base + DAY + H },
  ];
  const outgoing = [{ client_id: "c", created_at: base + 3 * H }];
  const k = checkinKpi({ clients, checkins, drafts, outgoing, mondayDay: dn(0), mondayEnd: base + DAY - 1, now: base + 2 * DAY, ctx });
  assert.equal(k.total, 5); // paused excluded
  assert.equal(k.onMonday, 2); assert.equal(k.late, 1); assert.equal(k.notStarted, 1);
  assert.equal(k.rows.find((r) => r.clientId === "b").state, "copied");
  assert.equal(k.status, "NOT MET");
});

test("KPI 4: active clients not heard from since Tuesday of the previous week", () => {
  const weekStart = base; // Monday
  const mondayEnd = base + DAY - 1, tuesdayEnd = base + 2 * DAY - 1;
  const prevTue = base - 6 * DAY;
  const mk = (id, heard, status = "Active", created = 0) => ({ id, name: id, status, created_at: created, last_message_at: heard, last_response_at: null, last_heard_by_monday: heard, last_heard_any: heard });
  const clients = [
    mk("quiet1", prevTue - H),       // last message just before the window: quiet
    mk("ok", prevTue + H),           // messaged inside the window: not quiet
    mk("monday", base + 2 * H),      // messaged this Monday: not quiet
    mk("paused", prevTue - DAY, "Paused"), // not active: never listed
    mk("never", null, "Active", prevTue - 5 * DAY), // added before the window, never messaged: quiet
    mk("newbie", null, "Active", prevTue + DAY),    // added inside the window: not quiet
  ];
  const run = (flags, now) => quietKpi({ clients, flags, weekStart, lookbackDays: 6, mondayEnd, tuesdayEnd, now });
  const k = run([], base + DAY);
  assert.deepEqual(k.rows.map((r) => r.clientId).sort(), ["never", "quiet1"]);
  assert.equal(k.status, "IN PROGRESS");
  assert.equal(run([], base + 3 * DAY).status, "NOT MET");
  const f = (id, status, at) => ({ client_id: id, status, note: "", flagged_at: at, resolved_at: null });
  assert.equal(run([f("quiet1", "flagged", base + H), f("never", "dismissed", base + 3 * DAY)], base + 4 * DAY).status, "MET");
  assert.equal(run([f("quiet1", "flagged", base + 3 * DAY), f("never", "flagged", base + H)], base + 4 * DAY).status, "COMPLETED LATE");
  // a client who has messaged since Monday and wasn't decided yet is no longer quiet
  const re = [{ ...mk("late", null, "Active", prevTue - 5 * DAY), last_heard_any: base + DAY + H }];
  const kr = quietKpi({ clients: re, flags: [], weekStart, lookbackDays: 6, mondayEnd, tuesdayEnd, now: base + 3 * DAY });
  assert.equal(kr.identified, 0); assert.equal(kr.reengaged.length, 1);
  // the lookback is configurable
  assert.equal(quietKpi({ clients, flags: [], weekStart, lookbackDays: 30, mondayEnd, tuesdayEnd, now: base }).identified, 0);
});

test("Friday report uses verified records only", () => {
  const ig = igKpi({ leads: [], messages: [], weekStart, weekEnd, now: base, ctx });
  const calls = callsKpi({ calls: [{ id: "1", name: "Sam", handle: "sam", source: "comment", booked_on: null, call_at: base + DAY, status: "Attended" }, { id: "2", name: "Pat", handle: "pat", source: "story reply", booked_on: null, call_at: base + DAY, status: "Pending" }], weekStart, weekEnd, fridayEnd, now: fridayEnd + H });
  const checkins = checkinKpi({ clients: [], checkins: [], drafts: [], outgoing: [], mondayDay: dn(0), mondayEnd: base + DAY - 1, now: base, ctx });
  const quiet = quietKpi({ clients: [], flags: [], weekStart, lookbackDays: 6, mondayEnd: base + DAY - 1, tuesdayEnd: base + 2 * DAY, now: base });
  const body = buildKpiReport({ weekLabel: "23 to 27 November", ig, calls, checkins, quiet, fmt: { date: () => "d", dateTime: () => "dt", day: () => "x" } });
  assert.match(body, /1 of 4 calls attended/);
  assert.match(body, /- Sam \(@sam\), comment/);
  assert.doesNotMatch(body, /Pat \(@pat\), story reply, d/); // pending call not listed as attended
  assert.match(body, /1 booked call is still waiting for attendance to be confirmed/);
  assert.match(body, /No Instagram messages or comments were logged this week\./);
});
