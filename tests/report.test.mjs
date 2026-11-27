import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportChanged } from "../src/lib/report.ts";

const an = (o) => ({ summary: "s", tags: ["CLIENT UPDATE", "PERSONAL UPDATE"], urgency: "NOT URGENT", internal_report: "Anita shared good news you'll like.", needs_michael: false, michael_reason: "", ...o });
const need = (o) => an({ urgency: "URGENT", tags: ["CLIENT CONCERN", "NEEDS GUIDANCE"], needs_michael: true, michael_reason: "Back pain returned", internal_report: "Ben says his back pain has returned.", ...o });
const clients = [
  { id: "a", name: "Anita Gossow", needs_michael: false, michael_reason: "" },
  { id: "b", name: "Ben Cole", needs_michael: false, michael_reason: "" },
  { id: "c", name: "Cara Moon", needs_michael: false, michael_reason: "" },
];
const inc = (id, sent_at, analysis) => ({ client_id: id, direction: "incoming", created_at: 9000, sent_at, analysis });
const out = (id, sent_at, sender = "erika") => ({ client_id: id, direction: "outgoing", sender, created_at: 9000, sent_at, analysis: null });
const run = (messages, extra = {}) => buildReport({ prettyDate: "Wed 25 Nov", periodStart: 0, periodEnd: 1, clients, messages, unreadIds: ["a", "b", "c"], ...extra });

test("only clients who need Michael personally are listed", () => {
  const r = run([inc("a", 10, an({})), inc("b", 20, need({}))]);
  assert.match(r.body, /1 client needs your personal response\./);
  assert.match(r.body, /BEN COLE – CLIENT CONCERN – NEEDS GUIDANCE – URGENT/);
  assert.match(r.body, /Waiting for you: Back pain returned\./);
  assert.doesNotMatch(r.body, /ANITA GOSSOW/);
  assert.deepEqual(r.counts, { clients: 1, sent: 0, pending: 1, michael: 1, unanalysed: 0 });
});
test("says whether Erika has replied", () => {
  const replied = run([inc("b", 20, need({})), out("b", 30)]);
  assert.match(replied.body, /I've replied to Ben\. They're waiting for you to reach out personally\./);
  assert.deepEqual(replied.counts, { clients: 1, sent: 1, pending: 0, michael: 1, unanalysed: 0 });
  const not = run([inc("b", 20, need({}))]);
  assert.match(not.body, /I haven't replied to Ben yet\./);
});
test("left out once Michael himself has written back", () => {
  const r = run([inc("b", 20, need({})), out("b", 30, "michael")]);
  assert.match(r.body, /No one needs your personal response today\./);
  assert.equal(r.counts.michael, 0);
});
test("a message from Michael does not count as Erika's reply", () => {
  const r = run([inc("b", 20, need({})), out("b", 10, "michael")]); // Michael wrote before the client's message
  assert.match(r.body, /I haven't replied to Ben yet\./);
});
test("the client's flag keeps them listed even if this message looks routine", () => {
  const flagged = [{ ...clients[0], needs_michael: true, michael_reason: "Wants a call" }, clients[1], clients[2]];
  const r = buildReport({ prettyDate: "d", periodStart: 0, periodEnd: 1, clients: flagged, messages: [inc("a", 10, an({}))], unreadIds: ["a"] });
  assert.match(r.body, /ANITA GOSSOW/);
  assert.match(r.body, /Waiting for you: Wants a call\./);
});
test("urgent first", () => {
  const r = run([inc("a", 10, need({ urgency: "NOT URGENT", internal_report: "Anita wants a call." })), inc("b", 20, need({}))]);
  assert.ok(r.body.indexOf("BEN COLE") < r.body.indexOf("ANITA GOSSOW"));
});
test("not-yet-analysed chats are counted but not written into the report", () => {
  const r = run([inc("b", 20, null)]);
  assert.equal(r.counts.unanalysed, 1);
  assert.doesNotMatch(r.body, /BEN COLE/);
});
test("nobody needs Michael", () => {
  const r = run([inc("a", 10, an({}))]);
  assert.match(r.body, /No one needs your personal response today\./);
});
test("Monday/Tuesday report lists quiet clients; none listed when there are none", () => {
  const q = run([inc("b", 20, need({}))], { quiet: { since: "Tue 17 Nov", clients: [{ name: "Cara Moon", lastHeard: "Mon 9 Nov" }] } });
  assert.match(q.body, /Quiet clients \(active clients we haven't heard from since Tue 17 Nov\):\n- Cara Moon \(last message Mon 9 Nov\)/);
  const none = run([inc("b", 20, need({}))], { quiet: { since: "x", clients: [] } });
  assert.doesNotMatch(none.body, /Quiet clients/);
});
test("sent report is flagged as changed only when something changed", () => {
  const r = run([inc("b", 20, need({}))]);
  const saved = { client_count: 1, replies_sent: 0, replies_pending: 1, michael_count: 1, sent_at: new Date(3000).toISOString() };
  assert.equal(reportChanged(saved, r.counts, 1500), false);
  assert.equal(reportChanged(saved, { ...r.counts, sent: 1, pending: 0 }, 1500), true);
});

test("a note that talks to Erika or about Michael is replaced by the summary", () => {
  const r = run([inc("b", 20, need({ summary: "Ben's back pain has returned.", internal_report: "You need to let Michael know Ben's back hurts." }))]);
  assert.match(r.body, /Ben's back pain has returned\./);
  assert.doesNotMatch(r.body, /let Michael know/);
});
test("clients who wrote but need no response get one line, spoken to Michael", () => {
  const r = run([inc("a", 10, an({ internal_report: "Anita thanks you for your support." })), inc("b", 20, need({}))]);
  assert.match(r.body, /Also messaged, no response needed from you:\n- Anita Gossow: Anita thanks you for your support\./);
  assert.match(r.body, /1 client needs your personal response\./);
});
test("a stored line that names Michael is turned into 'you'", () => {
  const r = run([inc("a", 10, an({ internal_report: "", summary: "Anita thanks Michael for his support." }))]);
  assert.match(r.body, /Anita thanks you for your support\./);
});
