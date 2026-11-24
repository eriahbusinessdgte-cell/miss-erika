import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayInTz,
  weekdayOf,
  isWorkingDate,
  addDays,
  nextDueDate,
  bucketOf,
  isValidTimezone,
} from "../src/lib/core.ts";

test("today uses the chosen time zone, not the server's", () => {
  // 2026-11-24 20:00 UTC is already Wednesday 25 Nov in Manila (UTC+8)
  const now = new Date("2026-11-24T20:00:00Z");
  assert.equal(todayInTz("Asia/Manila", now), "2026-11-25");
  assert.equal(todayInTz("America/Los_Angeles", now), "2026-11-24");
});

test("working days are Monday to Friday", () => {
  assert.equal(weekdayOf("2026-11-23"), 1); // Monday
  assert.equal(isWorkingDate("2026-11-23"), true);
  assert.equal(isWorkingDate("2026-11-27"), true); // Friday
  assert.equal(isWorkingDate("2026-11-28"), false); // Saturday
  assert.equal(isWorkingDate("2026-11-29"), false); // Sunday
});

test("recurring tasks roll forward correctly", () => {
  assert.equal(nextDueDate("2026-11-27", "Weekdays"), "2026-11-30"); // Fri -> Mon
  assert.equal(nextDueDate("2026-11-24", "Daily"), "2026-11-25");
  assert.equal(nextDueDate("2026-11-24", "Weekly"), "2026-12-01");
  assert.equal(nextDueDate("2026-01-31", "Monthly"), "2026-02-28");
  assert.equal(nextDueDate("2026-11-24", "None"), null);
});

test("buckets", () => {
  const today = "2026-11-24";
  assert.equal(bucketOf({ status: "To do", due_date: "2026-11-23" }, today), "overdue");
  assert.equal(bucketOf({ status: "To do", due_date: today }, today), "today");
  assert.equal(bucketOf({ status: "To do", due_date: "2026-11-25" }, today), "upcoming");
  assert.equal(bucketOf({ status: "Done", due_date: "2026-11-01" }, today), "done");
  assert.equal(bucketOf({ status: "To do", due_date: null }, today), "undated");
});

test("addDays crosses month ends", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
});

test("timezone validation", () => {
  assert.equal(isValidTimezone("Asia/Manila"), true);
  assert.equal(isValidTimezone("Mars/Base"), false);
});
