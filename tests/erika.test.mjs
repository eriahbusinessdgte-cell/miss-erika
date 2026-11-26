import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedToUtc, utcToZonedInput } from "../src/lib/core.ts";
import { inventedDetails, extractScores, detectCrisis, checkErikaReply, fallbackReply, parseAnalysis, extractJson } from "../src/lib/erika.ts";

test("pasted time is read in the chosen time zone, not the browser's", () => {
  assert.equal(zonedToUtc("2026-11-24T08:30", "Asia/Manila").toISOString(), "2026-11-24T00:30:00.000Z");
  assert.equal(zonedToUtc("2026-11-24T08:30", "Europe/London").toISOString(), "2026-11-24T08:30:00.000Z");
  assert.equal(utcToZonedInput("2026-11-24T00:30:00.000Z", "Asia/Manila"), "2026-11-24T08:30");
  assert.equal(zonedToUtc("garbage", "Asia/Manila"), null);
});

test("scores are recorded exactly as written and never invented", () => {
  assert.deepEqual(extractScores("Peace 7, Life 6, Body 5"), { peace: 7, life: 6, body: 5 });
  assert.deepEqual(extractScores("peace score: 8/10 and body is 4.5"), { peace: 8, body: 4.5 });
  assert.deepEqual(extractScores("I felt more peace after a few days. My body feels lighter."), {});
  assert.deepEqual(extractScores("Peace in 2 days I hope; life 3 weeks ago"), {});
  assert.deepEqual(extractScores("Thanks Erika!"), {});
});

test("crisis wording is detected", () => {
  assert.equal(detectCrisis("I'm having a panic attack right now"), true);
  assert.equal(detectCrisis("I can't breathe properly and have chest pain"), true);
  assert.equal(detectCrisis("Thank you, I had a lovely birthday"), false);
});

test("coaching, medical, spiritual and time-promise wording is blocked in Erika's replies", () => {
  const bad = [
    "Hi Anita, you should try some breathing and rest.",
    "Hi Lisa, please see a doctor about the pain.",
    "That is your body releasing old energy.",
    "Michael will reply within 24 hours.",
    "I'll make sure he gets back to you by tomorrow.",
    "Michael has already replied to you.",
    "It's completely normal to feel this way.",
    "I love that! I love that!",
    "Have you tried journaling?",
  ];
  for (const b of bad) assert.notEqual(checkErikaReply(b).length, 0, b);
});

test("good Erika replies pass", () => {
  const good = [
    "Hi Anita, thanks for sharing that with me. I'll make sure Michael sees this and gets back to you personally as soon as he can.",
    "Hi Denese, thanks so much for the update. I'll share it with Michael.",
    "Hi Ant, I've let Michael know and I'll check on the group session time for you.",
    fallbackReply("Anita Gossow", true),
    fallbackReply("Denese", false),
  ];
  for (const g of good) assert.deepEqual(checkErikaReply(g), [], g);
});

test("analysis from the model is validated and tags are limited to the approved list", () => {
  const a = parseAnalysis(
    { summary: "Ant shared a progress update.", tags: ["client update", "MADE UP", "speaking request", "personal update", "administrative"], urgency: "medium priority", needs_michael: false, michael_reason: "x", internal_report: "You...", reply: "Hi Ant, thanks." },
    "Thanks"
  );
  assert.deepEqual(a.tags, ["CLIENT UPDATE", "SPEAKING REQUEST", "PERSONAL UPDATE"]);
  assert.equal(a.urgency, "MEDIUM PRIORITY");
  assert.equal(a.michael_reason, "");
  assert.equal(parseAnalysis({ summary: "x" }, ""), null);
});

test("crisis wording forces urgent and Michael even if the model said otherwise", () => {
  const a = parseAnalysis({ summary: "s", tags: ["CLIENT UPDATE"], urgency: "NOT URGENT", needs_michael: false, reply: "Hi" }, "I think I'm having a panic attack");
  assert.equal(a.urgency, "URGENT");
  assert.equal(a.needs_michael, true);
  assert.ok(a.flags.includes("crisis_wording"));
});

test("JSON is pulled out of messy model output", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":2} done'), { a: 2 });
  assert.equal(extractJson("no json"), null);
});

import { checkUrls } from "../src/lib/erika.ts";
test("links in Erika drafts must be saved Resources", () => {
  assert.deepEqual(checkUrls("Here you go https://example.com/a.", ["https://example.com/a"]), []);
  assert.equal(checkUrls("See https://made-up.com/x", ["https://example.com/a"]).length, 1);
});

test("reply_needed false needs no reply text; default is true", () => {
  const a = parseAnalysis({ summary: "Client thanks Michael.", tags: ["CLIENT UPDATE"], urgency: "NOT URGENT", needs_michael: false, reply_needed: false, reply: "" }, "thank you");
  assert.equal(a.reply_needed, false);
  assert.equal(a.reply, "");
  const b = parseAnalysis({ summary: "s", tags: ["CLIENT UPDATE"], urgency: "NOT URGENT", needs_michael: false, reply: "Hi Anna, thanks." }, "hello");
  assert.equal(b.reply_needed, true);
  assert.equal(parseAnalysis({ summary: "s", reply_needed: true, reply: "" }, ""), null);
});

test("a time in the draft must appear in the conversation", () => {
  assert.deepEqual(inventedDetails("The group call is at 7 pm on Thursday.", "what time is the call?"), ["invented a time (7 pm)"]);
  assert.deepEqual(inventedDetails("See you at 7pm like Michael said", "Call is at 7 PM"), []);
  assert.deepEqual(inventedDetails("I'll check with Michael and come back.", ""), []);
});

import { badInternalReport } from "../src/lib/erika.ts";
test("report notes must brief Michael about the client", () => {
  assert.equal(badInternalReport("You need to let Michael know Deborah is wondering about sleep."), true);
  assert.equal(badInternalReport("Please pass this on so he can reply."), true);
  assert.equal(badInternalReport("Deborah is wondering whether drifting in and out of sleep during meditation is okay. She would like your guidance."), false);
});
