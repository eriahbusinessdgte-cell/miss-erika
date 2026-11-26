import test from "node:test";
import assert from "node:assert/strict";
import { watchUntil, scanState } from "../src/lib/scan.ts";

const day = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
test("watch ends at the next 7:00 Manila time (23:00 UTC the day before)", () => {
  assert.equal(watchUntil(new Date("2026-11-25T20:00:00Z")).toISOString(), "2026-11-25T23:00:00.000Z"); // 04:00 Manila -> 07:00 same day
  assert.equal(watchUntil(new Date("2026-11-25T23:30:00Z")).toISOString(), "2026-11-26T23:00:00.000Z"); // 07:30 Manila -> next day
});
test("no request and no scan today -> button needed", () => {
  assert.equal(scanState(new Date("2026-11-25T20:00:00Z"), null, null, day).kind, "needed");
});
test("started but first scan not finished -> waiting", () => {
  const s = scanState(new Date("2026-11-25T20:10:00Z"), new Date("2026-11-25T20:00:00Z"), null, day);
  assert.equal(s.kind, "waiting");
});
test("scanned after start, before 7am Manila -> running", () => {
  const s = scanState(new Date("2026-11-25T21:30:00Z"), new Date("2026-11-25T20:00:00Z"), new Date("2026-11-25T20:20:00Z"), day);
  assert.equal(s.kind, "running");
});
test("after the watch ends, scanned today -> done; scanned yesterday -> needed", () => {
  assert.equal(scanState(new Date("2026-11-26T01:00:00Z"), new Date("2026-11-25T20:00:00Z"), new Date("2026-11-25T22:20:00Z"), day).kind, "done");
  assert.equal(scanState(new Date("2026-11-27T01:00:00Z"), new Date("2026-11-25T20:00:00Z"), new Date("2026-11-25T22:20:00Z"), day).kind, "needed");
});
