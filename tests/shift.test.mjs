import test from "node:test";
import assert from "node:assert/strict";
import { madridDay, shiftActive, workDay } from "../src/lib/shift.ts";

const T = (s) => new Date(s).getTime();
test("the day comes from Michael's calendar, not California's", () => {
  // Wed 25 Nov 7pm California = Thu 26 Nov 4am Spain
  assert.equal(madridDay(new Date("2026-11-26T03:00:00Z")), "2026-11-26");
  // 1am California on the 26th = 10am Spain, same date
  assert.equal(madridDay(new Date("2026-11-26T09:00:00Z")), "2026-11-26");
});
test("a shift is open from start until finished or 14 hours", () => {
  const start = "2026-11-26T09:00:00Z";
  assert.equal(shiftActive(start, null, "2026-11-26", T("2026-11-26T09:01:00Z")), true);
  assert.equal(shiftActive(start, null, "2026-11-26", T("2026-11-26T20:00:00Z")), true); // noon California
  assert.equal(shiftActive(start, null, "2026-11-26", T("2026-11-26T23:01:00Z")), false); // past 14h
  assert.equal(shiftActive(start, "2026-11-26T17:00:00Z", "2026-11-26", T("2026-11-26T18:00:00Z")), false);
});
test("a page clock slightly behind the start time still sees the shift as open", () => {
  assert.equal(shiftActive("2026-11-26T09:00:30Z", null, "2026-11-26", T("2026-11-26T09:00:00Z")), true);
});
test("restarting after finishing opens a new shift", () => {
  assert.equal(shiftActive("2026-11-26T18:00:00Z", "2026-11-26T17:00:00Z", "2026-11-26", T("2026-11-26T18:30:00Z")), true);
});
test("nothing started means no shift", () => {
  assert.equal(shiftActive(null, null, null, Date.now()), false);
  assert.equal(shiftActive("2026-11-26T09:00:00Z", null, null, T("2026-11-26T10:00:00Z")), false);
});
test("work day follows the shift while open, Michael's calendar otherwise", () => {
  // shift for the 26th still open when Spain has not rolled over yet
  assert.equal(workDay("2026-11-26T09:00:00Z", null, "2026-11-26", T("2026-11-26T20:00:00Z")), "2026-11-26");
  assert.equal(workDay(null, null, null, T("2026-11-26T03:00:00Z")), "2026-11-26");
  // closed shift: back to the live Spain date
  assert.equal(workDay("2026-11-26T09:00:00Z", "2026-11-26T17:00:00Z", "2026-11-26", T("2026-11-27T01:00:00Z")), "2026-11-27");
});
