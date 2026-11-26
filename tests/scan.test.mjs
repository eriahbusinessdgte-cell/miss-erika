import test from "node:test";
import assert from "node:assert/strict";
import { scanState, nextCheckAt } from "../src/lib/scan.ts";

test("nothing requested -> idle", () => {
  assert.equal(scanState(null, null).kind, "idle");
  assert.equal(scanState(null, new Date("2026-11-26T20:00:00Z")).kind, "idle");
});
test("requested and not finished -> pending", () => {
  assert.equal(scanState(new Date("2026-11-26T20:00:00Z"), null).kind, "pending");
  assert.equal(scanState(new Date("2026-11-26T20:00:00Z"), new Date("2026-11-26T14:00:00Z")).kind, "pending");
});
test("scan finished after the request -> idle, no repeat", () => {
  assert.equal(scanState(new Date("2026-11-26T20:00:00Z"), new Date("2026-11-26T20:35:00Z")).kind, "idle");
});
test("next check is the next :29", () => {
  assert.equal(nextCheckAt(new Date("2026-11-26T20:10:00Z")).toISOString(), "2026-11-26T20:29:00.000Z");
  assert.equal(nextCheckAt(new Date("2026-11-26T20:29:00Z")).toISOString(), "2026-11-26T21:29:00.000Z");
  assert.equal(nextCheckAt(new Date("2026-11-26T20:45:00Z")).toISOString(), "2026-11-26T21:29:00.000Z");
});
