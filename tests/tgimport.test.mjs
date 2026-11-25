import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExport, applySingleChatMe, lastN } from "../src/lib/tgImport.ts";

const m = (id, from, fid, t, text, extra = {}) => ({ id, type: "message", date: "x", date_unixtime: String(t), from, from_id: fid, text, ...extra });
const full = {
  personal_information: { user_id: 111 },
  chats: { list: [
    { name: "Anita", type: "personal_chat", id: 1, messages: [
      m(1, "Anita", "user222", 1700000000, "Hi Erika"),
      m(2, "Erika", "user111", 1700000100, [{ type: "bold", text: "Hello " }, "Anita"]),
      { id: 3, type: "service", date_unixtime: "1700000200", text: "" },
      m(4, "Anita", "user222", 1700000300, "", { media_type: "voice_message" }),
    ] },
    { name: "Group", type: "private_group", id: 2, messages: [m(1, "x", "user3", 1, "hi")] },
  ] },
};

test("full export: personal chats only, sides worked out, text flattened, media labelled", () => {
  const p = parseExport(full);
  assert.equal(p.ok, true); assert.equal(p.chats.length, 1);
  const c = p.chats[0];
  assert.deepEqual(c.messages.map((x) => [x.fromMe, x.text]), [[false, "Hi Erika"], [true, "Hello Anita"], [false, "[voice message]"]]);
  assert.equal(c.messages[0].at, 1700000000 * 1000);
});

test("single chat export: client name decides who is me", () => {
  const single = { name: "Anita", type: "personal_chat", id: 1, messages: [m(1, "Anita", "user222", 100, "Hi"), m(2, "Me", "user111", 200, "Hello")] };
  const p = parseExport(single); assert.equal(p.ok, true);
  const c = applySingleChatMe(single, p.chats[0]);
  assert.deepEqual(c.messages.map((x) => x.fromMe), [false, true]);
});

test("bad files and last-N", () => {
  assert.equal(parseExport({ hello: 1 }).ok, false);
  assert.equal(parseExport({ name: "G", type: "private_group", messages: [m(1, "a", "user1", 1, "x")] }).ok, false);
  const p = parseExport(full); assert.equal(lastN(p.chats[0], 2).length, 2);
});
