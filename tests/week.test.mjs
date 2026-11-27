import test from "node:test";
import assert from "node:assert/strict";
import { nextMonday, weekAhead } from "../src/lib/week.ts";

test("next Monday from any day", () => {
  assert.equal(nextMonday("2026-11-27"), "2026-11-30"); // Friday
  assert.equal(nextMonday("2026-11-23"), "2026-11-30"); // Monday
  assert.equal(nextMonday("2026-11-28"), "2026-11-30"); // Saturday
  assert.equal(nextMonday("2026-11-29"), "2026-11-30"); // Sunday
});
test("five working days with routine jobs and open tasks due that day", () => {
  const w = weekAhead("2026-11-27", [
    { title: "Call the printer", due_date: "2026-12-02", status: "To do", kind: "manual", priority: "High" },
    { title: "Done already", due_date: "2026-12-02", status: "Done", kind: "manual" },
  ]);
  assert.deepEqual(w.map((d) => d.weekday), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  assert.ok(w[0].items.some((i) => /Telegram client/.test(i.text)));
  assert.ok(w[1].items.some((i) => /quiet clients/.test(i.text)));
  assert.ok(w[2].items.some((i) => /Hot Seat report/.test(i.text)));
  assert.ok(w[4].items.some((i) => /KPI/.test(i.text)));
  assert.equal(w[2].items.filter((i) => i.kind === "task").length, 1);
  assert.ok(w.every((d) => d.items[0].kind === "daily"));
});
