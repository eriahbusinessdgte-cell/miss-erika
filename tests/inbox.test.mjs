import test from "node:test";
import assert from "node:assert/strict";
import { previewLine } from "../src/lib/inbox.ts";

test("client message shows as written", () => {
  assert.equal(previewLine({ direction: "incoming", sender: "erika", body: "Thank you, Michael" }), "Thank you, Michael");
});
test("outgoing is prefixed", () => {
  assert.equal(previewLine({ direction: "outgoing", sender: "erika", body: "See you tomorrow" }), "You: See you tomorrow");
  assert.equal(previewLine({ direction: "outgoing", sender: "michael", body: "Hi" }), "Michael: Hi");
});
test("whitespace is flattened and long text is cut", () => {
  assert.equal(previewLine({ direction: "incoming", sender: "erika", body: "a\n\n b" }), "a b");
  const out = previewLine({ direction: "incoming", sender: "erika", body: "x".repeat(200) }, 20);
  assert.equal(out.length, 20);
  assert.ok(out.endsWith("…"));
});
test("empty body", () => {
  assert.equal(previewLine({ direction: "incoming", sender: "erika", body: "  " }), "[no text]");
});
