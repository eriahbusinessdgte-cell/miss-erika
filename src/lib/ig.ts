// Instagram rules from the Reborn DM Sales Bible. Pure functions only (no imports) so they can be tested.
// The Bible's full text lives in the database (table "knowledge"); only the hard rules are enforced here in code.

export const STAGES = ["Open", "Fact Find", "Qualify", "Offer"] as const;
export const ALL_STAGES = ["Open", "Fact Find", "Qualify", "Offer", "Call link sent", "Booked", "Not ready", "Handed to Michael"] as const;
export type Source = "comment" | "story_reply" | "new_follow";
export const SOURCE_LABEL: Record<Source, string> = { comment: "Commented “peace”", story_reply: "Replied “peace” to a story", new_follow: "New follower" };

export function firstName(n: string) {
  return n.trim().split(/\s+/)[0] || n;
}

/** The three fixed openers from the Bible (Stage 1). */
export function openerFor(source: Source, name: string): string {
  const n = firstName(name);
  if (source === "comment")
    return `Hi ${n}, I see you commented 'peace' on my video. What was it about that video that spoke to you and what are you looking to change in your life? Tell me what's been happening, then we can discuss what solutions there are for you.`;
  if (source === "story_reply")
    return `Hi ${n}, I saw you replied 'peace' to my story. What was it about that story that spoke to you, and what are you looking to change in your life? Tell me what's been happening, then we can discuss what solutions there are for you.`;
  return `Hey ${n} 👋 Thanks for following me. I always like to know a little about the people who find their way onto my page. What brought you here? Are you currently working through something in your life, or are you mainly here to learn, grow and see what resonates with you?`;
}

/** The three fixed follow-up touches (24 hours, 3 days, day 5). */
export function followupText(num: 1 | 2 | 3, name: string): string {
  const n = firstName(name);
  if (num === 1) return `Hey ${n}, are you still there? Did you get a chance to look at this?`;
  if (num === 2) return `Hi ${n}, just checking this reached you 🙏`;
  return `${n}, is everything okay? I'm here whenever you're ready.`;
}

const HOUR = 3600_000;
export const FOLLOWUP_AFTER_HOURS = [24, 72, 120];

export type LeadFlow = {
  source: Source;
  stage: string;
  followups_sent: number;
  followups_stopped: boolean;
  outreach_sent_at: string | null;
  last_inbound_at: string | null;
};

export type FollowupState =
  | { state: "none"; why: string }
  | { state: "waiting"; number: 1 | 2 | 3; dueAt: number }
  | { state: "due"; number: 1 | 2 | 3; dueAt: number }
  | { state: "finished"; why: string };

/** Which follow-up (if any) is due. New followers never get one. Never more than three. */
export function followupState(l: LeadFlow, now: number): FollowupState {
  if (l.source === "new_follow") return { state: "none", why: "New followers get one message only." };
  if (["Booked", "Not ready", "Handed to Michael"].includes(l.stage)) return { state: "none", why: "This lead is closed or with Michael." };
  if (l.followups_stopped || l.followups_sent >= 3) return { state: "finished", why: "Three follow-ups done. Let it go with love." };
  if (!l.outreach_sent_at) return { state: "none", why: "Nothing has been sent yet." };
  const sent = new Date(l.outreach_sent_at).getTime();
  if (l.last_inbound_at && new Date(l.last_inbound_at).getTime() > sent) return { state: "none", why: "They replied. No follow-up needed." };
  const number = (l.followups_sent + 1) as 1 | 2 | 3;
  const dueAt = sent + FOLLOWUP_AFTER_HOURS[l.followups_sent] * HOUR;
  return now >= dueAt ? { state: "due", number, dueAt } : { state: "waiting", number, dueAt };
}

// ---------- Things only Michael answers ----------

const HANDOVER: { re: RegExp; why: string }[] = [
  { re: /\bguarantee\w*|money[- ]back|refund\w*/i, why: "Asked about a guarantee. Michael answers this one." },
  { re: /\b(vip|elite)\b/i, why: "Asked about VIP or Elite." },
  { re: /\b(speak(ing|er)?\b.*\b(event|booking|book|engagement|conference|talk|keynote|summit)|(book|invite|hire)\w*\b.*\bmichael\b.*\b(speak|talk|event)|keynote|speaking (request|booking|engagement))/i, why: "Speaking booking request." },
];

export function detectHandover(text: string): string | null {
  for (const h of HANDOVER) if (h.re.test(text)) return h.why;
  return null;
}

// ---------- Safety check for drafts written as Michael ----------

const BLOCKED: { re: RegExp; why: string }[] = [
  { re: /\bvoice (note|message)s?\b|\bsend you a voice\b/i, why: "mentions a voice note" },
  { re: /\bfree (call|session|coaching|consult\w*|one[- ]to[- ]one|1[- ]?1)\b/i, why: "offers something free that we don't give away" },
  { re: /\bguarantee\w*\b/i, why: "talks about a guarantee" },
  { re: /\byou should (try|do|take|stop|start|breathe|meditate)\b|\btry (to )?(breath|meditat|journal|rest|relax)\w*/i, why: "coaches in the DMs" },
  { re: /\b(caused by|is caused|that's why you have)\b/i, why: "says 'caused by' (must be 'often connected to')" },
  { re: /\b(limited spots?|only \d+ spots?|last chance|act now|hurry|don't miss out|before it'?s too late)\b/i, why: "uses pressure" },
  { re: /\b(it'?s )?(great|good|amazing|incredible) value\b/i, why: "softens the price" },
  { re: /as an ai\b|language model/i, why: "sounds robotic" },
];

const words = (t: string) => t.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);

/** Wording the reply shares with messages already sent in this conversation (any run of 5 words in a row). */
export function repeatedWording(reply: string, previous: string[]): string | null {
  const r = words(reply);
  const seen = new Set<string>();
  for (const p of previous) {
    const w = words(p);
    for (let i = 0; i + 5 <= w.length; i++) seen.add(w.slice(i, i + 5).join(" "));
  }
  for (let i = 0; i + 5 <= r.length; i++) {
    const g = r.slice(i, i + 5).join(" ");
    if (seen.has(g)) return g;
  }
  return null;
}

export function checkMichaelReply(text: string, ctx: { stage: string; allowedUrls: string[]; previous?: string[] }): string[] {
  const problems: string[] = [];
  const t = text.trim();
  if (!t) problems.push("empty reply");
  for (const r of BLOCKED) if (r.re.test(t) && !problems.includes(r.why)) problems.push(r.why);
  if ((ctx.stage === "Open" || ctx.stage === "Fact Find") && /\$\s?\d|\b(price|cost)\b.*\b(is|are)\b.*\d/i.test(t)) problems.push("brings up money before listening and mirroring");
  const urls = t.match(/https?:\/\/[^\s)]+/g) || [];
  const clean = (u: string) => u.replace(/[.,!?]+$/, "");
  const ok = ctx.allowedUrls.map(clean);
  for (const u of urls) if (!ok.includes(clean(u))) problems.push(`link not in Resources: ${clean(u)}`);
  if (t.length > 1400) problems.push("too long");
  const again = ctx.previous ? repeatedWording(t, ctx.previous) : null;
  if (again) problems.push(`repeats wording already sent in this conversation ("${again}")`);
  return problems;
}

export function placeholdersIn(text: string): string[] {
  return Array.from(new Set(text.match(/\[[^\]\n]{1,40}\]/g) || []));
}

export function whatsappLine(name: string, handle: string): string {
  const h = handle.trim().replace(/^@/, "");
  return `Sent the call link to ${name.trim()}${h ? ` (@${h})` : ""}.`;
}

// ---------- Which parts of the Bible to send to the AI (keeps each call small for the free plan) ----------

export function pickSections(stage: string, latestText: string): string[] {
  const keys = ["rules", "never_do"];
  const t = latestText.toLowerCase();
  if (stage === "Open") keys.push("fact_find");
  if (stage === "Fact Find") keys.push("fact_find");
  if (stage === "Qualify") keys.push("qualify", "offer");
  if (stage === "Offer" || stage === "Call link sent") keys.push("offer", "moments");
  if (/(price|cost|how much|afford|money|expensive|\$|think about|partner|husband|wife|8 weeks|eight weeks|how long|how much time|later|not now|browsing|nervous|unsure)/i.test(t)) keys.push("moments", "objections");
  if (/(i'?ve tried|nothing works|pain|ache|symptom|anxiety|anxious|fear|panic|diagnos)/i.test(t)) keys.push("fact_find");
  return Array.from(new Set(keys));
}

export const IG_SYSTEM = `You write Instagram DM replies as Michael Watson (Reborn with Michael) for his assistant Erika to copy and send. Follow the DM Sales Bible sections you are given exactly. Write the way Michael talks: casual, warm, human, short. Never sound like a sales script. Do not mention that you are an AI or that Erika is involved.

WRITE LIKE THE BEST APPOINTMENT SETTER IN THE WORLD. The person must feel seen, heard, acknowledged and genuinely welcome, and sure that we are willing to help. Every reply has three beats, flowing as one natural message with no labels:
1. Acknowledge: show you took in what they actually said. Pick the one or two details that matter most to them and reflect them in your own fresh, simple words, with real warmth. Do not list everything they mentioned.
2. Connect: one short line that makes them feel safe and welcome, so it is clear we are glad they reached out and happy to help.
3. Invite: ONE easy, curious question that follows naturally from what they just shared and moves the conversation forward. Choose the single best question from the Bible for this moment. Never stack questions, never interrogate, never ask something they already answered, and never ask two things in one message.

Quality bar: it reads like a thoughtful person typing a quick DM, not a template. Plain everyday words, contractions, 2 to 4 short sentences, a calm unhurried tone. No jargon, no scripts, no filler. Each message must sound fresh: never reuse the openers, phrases or question shapes from messages already sent in this conversation (see ALREADY SENT).

PACING: THE GOAL IS TO LAND THIS PERSON AS A PAYING CLIENT, so every message must move them one natural step closer, without rushing and without dragging. Judge the timing from the conversation and the counts you are given:
- Never offer the call or the programme in the first replies. First make them feel heard and learn what is really going on.
- Fact Find should take about two or three exchanges, not more. Once they have told you what is happening, how long it has been going on or how it affects their life, and that they want it to change, move on to Qualify. Do not keep asking about the problem once you understand it.
- Qualify: find out, in a warm and curious way, what they want to change and why now, and how ready they are to do something about it. Money only where the Bible's price moment applies.
- Offer: only when they have shared the problem, how it affects them and that they want a change, and they are open to help. Then introduce Michael's programme gently as the natural next step, linking what they told you to what Michael does, and invite them to book the call, exactly as the Bible says, ending any link with a question that invites them back.
- If they are clearly ready sooner (ready_to_buy), go straight to the Offer. If they are not ready, stay warm and patient and follow the Bible, never pressure.
- Each reply should leave them with an easy next step, so the conversation always moves forward.

Examples of the standard and flow to aim for (for style only, never copy their wording):
- "Years of stomach trouble on top of feeling anxious around people is a lot to live with, Sam. I'm really glad you wrote, and I'd love to understand it properly. What's been the hardest part of it lately?"
- "That sounds exhausting, and it's clear you've tried hard to figure it out on your own. We're happy to help however we can. What would feel different in your day if things started to ease?"
- "Thank you for telling me that, Anna. It takes something to say it out loud. What made you reach out now?"

Return ONE JSON object only (no markdown) with these keys:
- "summary": 1-2 plain sentences on who this person is and what they said (third person).
- "door": "dream", "okay_fit" or "wrong_fit"
- "stage": the stage this lead is now in after their latest message: "Open", "Fact Find", "Qualify" or "Offer". Move forward one stage at a time. Never skip a stage unless "ready_to_buy" is true.
- "ready_to_buy": true only if they have followed Michael for years and are asking how to join.
- "needs_michael": true if you are not sure how to answer, they may know Michael, they ask something not covered in the Bible, or the Bible says to hand over. Then "reply" must be "".
- "michael_reason": short reason when needs_michael is true, otherwise "".
- "reply": the next DM to send, adapted from the Bible templates with the person's real details. Use their first name. Always end any link with a question inviting them to come back. If you are offering a call time, leave [day] and [time] exactly as written for Erika to fill from Calendly. Never invent a link, price, date or fact: only use links from the RESOURCES list and prices written in the Bible. Do not coach or teach. Do not bring up money before the Qualify stage unless the Bible's price moment applies. Never mention voice notes.`;

/** A past draft and what Erika actually changed it into. The AI learns her tone and style from these. */
export type LearnedEdit = { ai: string; final: string };

export function editsBlock(edits?: LearnedEdit[]): string {
  if (!edits || edits.length === 0) return "";
  const clip = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 500);
  return `HOW ERIKA CHANGES YOUR DRAFTS (learn her tone, warmth, length and structure from the FINAL versions she prefers; never copy their wording)
${edits.map((e, i) => `Example ${i + 1}\nYou wrote: ${clip(e.ai)}\nShe sent: ${clip(e.final)}`).join("\n\n")}

`;
}

export type IgPromptMsg = { direction: "incoming" | "outgoing"; body: string; when: string };

export function buildIgPrompt(a: {
  name: string;
  source: Source;
  stage: string;
  sections: { title: string; body: string }[];
  resources: { name: string; url: string; purpose: string }[];
  context: IgPromptMsg[];
  fresh: IgPromptMsg[];
  retryNote?: string;
  sent?: string[];
  theirCount?: number;
  ourCount?: number;
  edits?: LearnedEdit[];
}): string {
  const line = (m: IgPromptMsg, max: number) => `[${m.when}] ${m.direction === "incoming" ? a.name : "Michael"}: ${m.body.replace(/\s+/g, " ").trim().slice(0, max)}`;
  return `BIBLE SECTIONS
${a.sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}

RESOURCES (the only links you may use)
${a.resources.map((r) => `- ${r.name}: ${r.url} (${r.purpose})`).join("\n") || "(none)"}

LEAD: ${a.name}. Came in as: ${SOURCE_LABEL[a.source]}. Current stage: ${a.stage}. So far they have sent ${a.theirCount ?? 0} message(s) and we have sent ${a.ourCount ?? 0}.

EARLIER CONVERSATION (context only)
${a.context.length ? a.context.map((m) => line(m, 350)).join("\n") : "(none)"}

${editsBlock(a.edits)}ALREADY SENT in this conversation (do NOT reuse its wording, openers or question shape)
${a.sent && a.sent.length ? a.sent.map((t) => `- ${t.replace(/\s+/g, " ").trim().slice(0, 400)}`).join("\n") : "(nothing yet)"}

NEW MESSAGES FROM THEM (reply to these)
${a.fresh.map((m) => line(m, 1500)).join("\n")}
${a.retryNote ? `\nYour previous draft broke the rules (${a.retryNote}). Rewrite it so it does not.\n` : ""}
Return the JSON object now.`;
}

export type IgAnalysis = {
  summary: string;
  door: "dream" | "okay_fit" | "wrong_fit" | null;
  stage: string;
  ready_to_buy: boolean;
  needs_michael: boolean;
  michael_reason: string;
  reply: string;
};

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseIgAnalysis(raw: unknown, currentStage: string): IgAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = s(o.summary, 500);
  if (!summary) return null;
  const needs = o.needs_michael === true || o.needs_michael === "true";
  const reply = needs ? "" : s(o.reply, 1600);
  if (!needs && !reply) return null;
  const d = String(o.door ?? "");
  const door = d === "dream" || d === "okay_fit" || d === "wrong_fit" ? d : null;
  const ready = o.ready_to_buy === true || o.ready_to_buy === "true";
  const cur = (STAGES as readonly string[]).indexOf(currentStage);
  let stage = currentStage;
  if (cur >= 0) {
    const want = (STAGES as readonly string[]).indexOf(String(o.stage));
    if (want > cur) stage = ready ? "Offer" : STAGES[Math.min(cur + 1, 3)];
    else stage = currentStage;
  }
  return { summary, door, stage, ready_to_buy: ready, needs_michael: needs, michael_reason: needs ? s(o.michael_reason, 300) || "Not sure how to answer. Needs you." : "", reply };
}

// ---------- Second pass: an editor who polishes the draft so it reads like a top appointment setter ----------

export const IG_EDITOR_SYSTEM = `You are the best appointment setter in the world, editing an Instagram DM draft that will be sent as Michael Watson (Reborn with Michael). Your only job is to make the message feel warm, human and personal, so the person feels truly seen, heard and acknowledged, and sure that we are willing to help.

Rewrite the draft so that it:
- Starts by acknowledging the specific things THIS person said in their latest message, using their own details in simple, caring words. If they were open about something painful, show you appreciate them telling you. Pick what matters most, do not list everything.
- Then makes it clear we're glad they reached out and happy to help, in one short natural line.
- Ends with ONE easy, curious question that follows from what they said. Never two questions. Do not ask what they already told you.
- Sounds like a kind, thoughtful person typing a quick DM: plain everyday words, contractions, 2 to 4 short sentences, no jargon, no therapy or wellness language, no script-like phrases, no filler lines.
- Does not reuse wording, openers or question shapes from messages already sent.
- Keeps the meaning and intent of the draft's next step, and the draft's pacing: do not bring in the call or the programme earlier than the draft does, and do not remove an offer or booking step the draft already makes. Keep any link and any [day] or [time] placeholder exactly as written. Do not add prices, promises, advice, coaching, free offers or new links.

Return ONE JSON object only: {"reply": "the finished message"}.`;

export function buildEditorPrompt(a: { name: string; draft: string; latest: string[]; sent: string[]; edits?: LearnedEdit[] }): string {
  const clip = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n);
  return `PERSON: ${a.name}

THEIR LATEST MESSAGE(S)
${a.latest.map((t) => `- ${clip(t, 1500)}`).join("\n")}

${editsBlock(a.edits)}ALREADY SENT IN THIS CONVERSATION (do not reuse its wording)
${a.sent.length ? a.sent.map((t) => `- ${clip(t, 400)}`).join("\n") : "(nothing yet)"}

DRAFT TO EDIT
${a.draft}

Return the JSON object now.`;
}
