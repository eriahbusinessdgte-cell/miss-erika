import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, validateBackup, toCsv, TABLES } from "../src/lib/backup.ts";

test("backup removes the owner id, keeps everything else, and validates", () => {
  const b = buildBackup({ user_id: "u", timezone: "Asia/Manila" }, { clients: [{ id: "1", user_id: "u", name: "Ana" }], tasks: [] }, "2026-11-25T00:00:00Z");
  assert.equal(b.settings.user_id, undefined);
  assert.deepEqual(b.tables.clients, [{ id: "1", name: "Ana" }]);
  for (const t of TABLES) assert.ok(Array.isArray(b.tables[t]));
  const v = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(v.ok, true); assert.equal(v.counts.clients, 1); assert.equal(v.total, 1);
});

test("bad files are rejected with a plain message", () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: "other" }).ok, false);
  assert.equal(validateBackup({ app: "miss-erika", version: 99, tables: {} }).ok, false);
  assert.equal(validateBackup({ app: "miss-erika", version: 1, tables: { clients: "x" } }).ok, false);
  assert.equal(validateBackup({ app: "miss-erika", version: 1, tables: { clients: [{ name: "no id" }] } }).ok, false);
});

test("CSV escapes commas, quotes and new lines", () => {
  assert.equal(toCsv([{ a: 'x,"y"', b: "line\nbreak", c: null, d: ["t1", "t2"] }], ["a", "b", "c", "d"]), 'a,b,c,d\n"x,""y""","line\nbreak",,"[""t1"",""t2""]"');
});
