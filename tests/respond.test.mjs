import test from "node:test";
import assert from "node:assert/strict";
import { waitingForReply } from "../src/lib/respond.ts";

const p = (direction, sent_at, unread = false) => ({ direction, sender: "erika", body: "hi", sent_at, unread });
test("lists chats whose newest message is the client's and that need a reply, newest first", () => {
  const rows = [
    { id: "a", name: "Anita", needs_reply: true },
    { id: "b", name: "Ben", needs_reply: false },
    { id: "c", name: "Cara", needs_reply: false },
    { id: "d", name: "Dan", needs_reply: true },
    { id: "e", name: "Eve", needs_reply: true, status: "Archived" },
  ];
  const previews = {
    a: p("incoming", "2026-11-26T10:00:00Z"),
    b: p("incoming", "2026-11-26T12:00:00Z", true), // fresh from the scan, not opened yet
    c: p("incoming", "2026-11-26T13:00:00Z"), // opened and analysed: no reply needed
    d: p("outgoing", "2026-11-26T14:00:00Z"), // already answered
    e: p("incoming", "2026-11-26T15:00:00Z"),
  };
  assert.deepEqual(waitingForReply(rows, previews).map((x) => x.id), ["b", "a"]);
});
test("chats without any message are skipped", () => {
  assert.deepEqual(waitingForReply([{ id: "a", name: "A", needs_reply: true }], {}), []);
});
