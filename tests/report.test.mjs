import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportChanged } from "../src/lib/report.ts";

const an = (o) => ({ summary: "s", tags: ["CLIENT UPDATE", "PERSONAL UPDATE"], urgency: "NOT URGENT", internal_report: "Anita shared good news you'll like.", needs_michael: false, michael_reason: "", ...o });
const clients = [
  { id: "a", name: "Anita Gossow", needs_michael: false, michael_reason: "" },
  { id: "b", name: "Ben Cole", needs_michael: true, michael_reason: "Back pain" },
  { id: "c", name: "Quiet Cara", needs_michael: false, michael_reason: "" },
];
const msgs = [
  { client_id: "a", direction: "incoming", created_at: 1000, sent_at: 10, analysis: an({}) },
  { client_id: "a", direction: "outgoing", created_at: 2000, sent_at: 2000, analysis: null },
  { client_id: "b", direction: "incoming", created_at: 1500, sent_at: 20, analysis: an({ urgency: "URGENT", tags: ["CLIENT CONCERN", "NEEDS GUIDANCE"], needs_michael: true, michael_reason: "Back pain returned", internal_report: "Ben says his back pain has returned." }) },
  { client_id: "c", direction: "incoming", created_at: 50, sent_at: 5, analysis: an({}) }, // outside the period
];
const r = buildReport({ prettyDate: "Tuesday 24 November", periodStart: 100, periodEnd: 5000, clients, messages: msgs });

test("counts and truthful opening", () => {
  assert.deepEqual(r.counts, { clients: 2, sent: 1, pending: 1, michael: 1, unanalysed: 0 });
  assert.match(r.body, /2 clients sent messages\./);
  assert.match(r.body, /I've replied to 1 of them\. 1 reply is still pending\./);
});
test("urgent first, heading format, addressed to Michael", () => {
  assert.ok(r.body.indexOf("BEN COLE – CLIENT CONCERN – NEEDS GUIDANCE – URGENT") < r.body.indexOf("ANITA GOSSOW – CLIENT UPDATE – PERSONAL UPDATE – NOT URGENT"));
  assert.match(r.body, /\(I haven't sent a reply to Ben yet\.\)/);
  assert.doesNotMatch(r.body, /Quiet Cara|QUIET CARA/);
});
test("Michael list", () => {
  assert.match(r.body, /Need your personal response:\n- Ben Cole: Back pain returned/);
});
test("unanalysed message is shown honestly", () => {
  const x = buildReport({ prettyDate: "d", periodStart: 0, periodEnd: 9999, clients: [clients[0]], messages: [{ ...msgs[0], analysis: null }] });
  assert.equal(x.counts.unanalysed, 1);
  assert.match(x.body, /NOT ANALYSED YET/);
});
test("empty period", () => {
  const x = buildReport({ prettyDate: "d", periodStart: 0, periodEnd: 9999, clients: [], messages: [] });
  assert.match(x.body, /No client messages came in/);
  assert.match(x.body, /None today\./);
});
test("sent report is flagged as changed only when something changed", () => {
  const saved = { client_count: 2, replies_sent: 1, replies_pending: 1, michael_count: 1, sent_at: new Date(3000).toISOString() };
  assert.equal(reportChanged(saved, r.counts, 1500), false);
  assert.equal(reportChanged(saved, { ...r.counts, sent: 2, pending: 0 }, 1500), true);
  assert.equal(reportChanged(saved, r.counts, 4000), true);
});
