import { test } from "node:test";
import assert from "node:assert/strict";
import { openerFor, followupText, followupState, detectHandover, checkMichaelReply, placeholdersIn, whatsappLine, pickSections, parseIgAnalysis } from "../src/lib/ig.ts";

const H = 3600_000;
const base = { source: "comment", stage: "Open", followups_sent: 0, followups_stopped: false, outreach_sent_at: new Date(0).toISOString(), last_inbound_at: null };

test("openers match the Bible and use the first name", () => {
  assert.match(openerFor("comment", "Sarah Jones"), /^Hi Sarah, I see you commented 'peace' on my video\./);
  assert.match(openerFor("story_reply", "Sarah"), /^Hi Sarah, I saw you replied 'peace' to my story\./);
  assert.match(openerFor("new_follow", "Sarah"), /^Hey Sarah 👋 Thanks for following me\./);
});

test("follow-ups come at 24 hours, 3 days and day 5, then stop at three", () => {
  assert.equal(followupState(base, 23 * H).state, "waiting");
  assert.deepEqual(followupState(base, 25 * H), { state: "due", number: 1, dueAt: 24 * H });
  assert.equal(followupState({ ...base, followups_sent: 1 }, 71 * H).state, "waiting");
  assert.equal(followupState({ ...base, followups_sent: 1 }, 73 * H).number, 2);
  assert.equal(followupState({ ...base, followups_sent: 2 }, 121 * H).number, 3);
  assert.equal(followupState({ ...base, followups_sent: 3 }, 999 * H).state, "finished");
  assert.equal(followupState({ ...base, followups_stopped: true }, 999 * H).state, "finished");
});

test("new followers never get follow-ups; replied or closed leads don't either", () => {
  assert.equal(followupState({ ...base, source: "new_follow" }, 999 * H).state, "none");
  assert.equal(followupState({ ...base, last_inbound_at: new Date(5 * H).toISOString() }, 999 * H).state, "none");
  assert.equal(followupState({ ...base, stage: "Booked" }, 999 * H).state, "none");
  assert.equal(followupState({ ...base, outreach_sent_at: null }, 999 * H).state, "none");
});

test("follow-up wording matches the Bible", () => {
  assert.equal(followupText(1, "Sam Lee"), "Hey Sam, are you still there? Did you get a chance to look at this?");
  assert.equal(followupText(2, "Sam"), "Hi Sam, just checking this reached you 🙏");
  assert.equal(followupText(3, "Sam"), "Sam, is everything okay? I'm here whenever you're ready.");
});

test("things only Michael answers are detected", () => {
  assert.ok(detectHandover("Is there a guarantee?"));
  assert.ok(detectHandover("Tell me about the VIP option"));
  assert.ok(detectHandover("I'd love to book Michael to speak at our event"));
  assert.equal(detectHandover("I've been feeling anxious lately"), null);
});

test("Michael-voice safety rules", () => {
  const ctx = { stage: "Fact Find", allowedUrls: ["https://youtu.be/O0gS7pvoFyU"] };
  assert.deepEqual(checkMichaelReply("Thank you for sharing that, Sam. Which part stands out most for you?", ctx), []);
  assert.ok(checkMichaelReply("I'll send you a voice note", ctx).length);
  assert.ok(checkMichaelReply("The Peaceful Path is $5,000", ctx).length);
  assert.deepEqual(checkMichaelReply("The Peaceful Path is $5,000", { ...ctx, stage: "Offer" }), []);
  assert.ok(checkMichaelReply("Watch https://made-up.com/x", ctx).length);
  assert.deepEqual(checkMichaelReply("Watch https://youtu.be/O0gS7pvoFyU. Let me know what you think?", ctx), []);
  assert.ok(checkMichaelReply("We can do a free call", ctx).length);
  assert.ok(checkMichaelReply("It's caused by stress", ctx).length);
});

test("placeholders and WhatsApp line", () => {
  assert.deepEqual(placeholdersIn("Are you free on [day] at [time]?"), ["[day]", "[time]"]);
  assert.deepEqual(placeholdersIn("All filled in"), []);
  assert.equal(whatsappLine("Sam Lee", "@samlee"), "Sent the call link to Sam Lee (@samlee).");
});

test("only the relevant Bible sections are sent", () => {
  assert.ok(pickSections("Qualify", "ok").includes("qualify"));
  assert.ok(pickSections("Fact Find", "how much is it?").includes("objections"));
  assert.ok(!pickSections("Open", "hello").includes("objections"));
});

test("AI stage moves one step at a time unless ready to buy", () => {
  const a = parseIgAnalysis({ summary: "s", stage: "Offer", reply: "Hi", door: "dream" }, "Open");
  assert.equal(a.stage, "Fact Find");
  const b = parseIgAnalysis({ summary: "s", stage: "Offer", ready_to_buy: true, reply: "Hi" }, "Open");
  assert.equal(b.stage, "Offer");
  const c = parseIgAnalysis({ summary: "s", stage: "Open", reply: "Hi" }, "Qualify");
  assert.equal(c.stage, "Qualify");
  const d = parseIgAnalysis({ summary: "s", needs_michael: true, michael_reason: "unsure", reply: "should be dropped" }, "Open");
  assert.equal(d.reply, ""); assert.equal(d.needs_michael, true);
  assert.equal(parseIgAnalysis({ summary: "s" }, "Open"), null);
});
