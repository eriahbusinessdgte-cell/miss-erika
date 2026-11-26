import test from "node:test";
import assert from "node:assert/strict";
import { weekStartOf, thursdayOf, parseNames, buildHotSeatReport } from "../src/lib/hotseat.ts";

test("week starts on Monday; weekend counts toward the next week", () => {
  assert.equal(weekStartOf("2026-11-23"), "2026-11-23"); // Monday
  assert.equal(weekStartOf("2026-11-25"), "2026-11-23"); // Wednesday
  assert.equal(weekStartOf("2026-11-27"), "2026-11-23"); // Friday
  assert.equal(weekStartOf("2026-11-28"), "2026-11-30"); // Saturday
  assert.equal(weekStartOf("2026-11-29"), "2026-11-30"); // Sunday
});
test("Thursday of the week", () => {
  assert.equal(thursdayOf("2026-11-23"), "2026-11-26");
  assert.equal(thursdayOf("2026-12-28"), "2026-12-31");
});
test("parseNames splits lines and commas, strips bullets, skips duplicates", () => {
  assert.deepEqual(parseNames("1. Ary Saaman\n- Mark  Chrisawn, lisa\n\nARY SAAMAN"), ["Ary Saaman", "Mark Chrisawn", "lisa"]);
  assert.deepEqual(parseNames("Ary, Bo", ["ary"]), ["Bo"]);
  assert.deepEqual(parseNames("  \n , "), []);
});
test("report lists names for Thursday", () => {
  const t = buildHotSeatReport(["Ary", "Bo"], "Thursday, 26 Nov", "Michael", "Erika");
  assert.equal(t, "Hi Michael, here is the Hot Seat lineup for tomorrow, Thursday, 26 Nov:\n\n1. Ary\n2. Bo\n\nErika");
});
test("report with no names says so", () => {
  assert.match(buildHotSeatReport([], "Thursday, 26 Nov", "Michael", "Erika"), /No one has been confirmed/);
});
