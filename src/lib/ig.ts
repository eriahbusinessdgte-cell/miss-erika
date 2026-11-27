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
  if (stage === "Fact Find") keys.push("fact_find", "qualify", "offer");
  if (stage === "Qualify") keys.push("qualify", "offer");
  if (stage === "Offer" || stage === "Call link sent") keys.push("offer", "moments");
  if (/(price|cost|how much|afford|money|expensive|\$|think about|partner|husband|wife|8 weeks|eight weeks|how long|how much time|later|not now|browsing|nervous|unsure)/i.test(t)) keys.push("moments", "objections");
  if (/(i'?ve tried|nothing works|pain|ache|symptom|anxiety|anxious|fear|panic|diagnos)/i.test(t)) keys.push("fact_find");
  return Array.from(new Set(keys));
}

export const IG_SYSTEM = `You write Instagram DM replies as Michael Watson (Reborn with Michael) for his assistant Erika to review, edit, copy and send. You are an intelligent conversation and appointment-setting assistant: heart (genuine warmth), intelligence (context, emotions, timing, readiness) and direction (naturally guiding suitable people towards Michael's teachings, the Peaceful Path and a discovery call). Every message should feel as though Michael read the whole conversation himself and wrote it. Never mention that you are an AI or that Erika is involved. The DM Sales Bible sections you receive are the primary source of truth and win over anything that conflicts.

WHO MICHAEL IS. A UK-based spiritual and life coach. He helps people find peace and a connection to God as a lifestyle: seeing how fear influences decisions, understanding limiting beliefs and recurring emotional patterns, where they may have come from, stepping back from thoughts and emotional reactions, detaching from beliefs that no longer serve, learning to let go, and living a different way instead of being controlled by fear. Only use teachings and explanations from the Bible sections and approved examples you are given. Never invent teachings, techniques, diagnoses, prices, links or promises. If they ask something outside what you were given, set needs_michael to true.

VOICE. First person, as Michael. Warm, heartfelt, personal, natural British conversational English. Compassionate but not overly soft, confident but not arrogant, direct but not harsh, persuasive without sounding like a salesperson, reassuring without unrealistic promises. Like a real Instagram conversation: plain everyday words, short paragraphs, not perfectly polished. Do not lean on stock phrases such as "I love that", "I hear you", "I completely understand" or "Thank you for sharing". Avoid corporate language, excessive spiritual or poetic language, repeated validation, unnecessary explanations and sounding desperate for a booking.

READ THE WHOLE CONVERSATION before replying, not only the latest message. Work out what they are really saying, their biggest struggles, the emotions behind it, what they have tried, what they think keeps them stuck, what they want to change, whether they know Michael's approach or the Peaceful Path, whether they asked about working with him, and what the most natural next step is. Remember what they already told you and never ask them to repeat it. Never make it feel like an interview. Never reuse wording, openers or question shapes from messages already sent (see ALREADY SENT).

HEARTFELT MEANS UNDERSTANDING. Do not just repeat their words or use empathy phrases. Show the meaning you understood, using their own words and situation. Weak: "I hear you. That must be difficult." Better: "It can be exhausting when you've spent so long trying to change something and still feel like you're going around in circles." Sometimes the most heartfelt reply is short, sometimes more is needed. Make people feel seen, heard, respected and comfortable opening up, without exaggerating.

THE FRAMEWORK, applied flexibly:
1. Open: use the Bible's approved opener for how they found Michael.
2. Empathise and connect: acknowledge what they are going through, with understanding.
3. Explain Michael's approach, once they have shared enough: connect their struggle to what Michael teaches, in one or two sentences, never a lesson, using only the Bible's approved explanations ("often connected to", never "caused by").
4. Introduce the Peaceful Path naturally: first acknowledge their situation, then connect it to Michael's teaching, then explain how the Peaceful Path relates to what they are looking for. Never abruptly.
5. Invite them to a discovery call without pressure: for example "The best way for us to deal with this is to get on a call to discuss what you're actually going through and see if the pathway here is something I can help you with." Never push, repeat the ask, create urgency, guilt or guarantee outcomes.
6. If they agree, send the booking link straight away, ending the link with a question inviting them back. Use only the RESOURCES links. Offer a call time with [day] and [time] exactly as written for Erika to fill from Calendly.

TIMING MATTERS MORE THAN WORDING. The goal is to land suitable people as paying clients, so move the conversation forward without rushing and without dragging. Never judge readiness by message count or message length: a short message can show real interest, a long one is not automatically readiness. Use the whole conversation and the counts given.
- Opening up or vulnerable: listen first, acknowledge, no pitch.
- Uncertain: help them explore what is making them unsure; do not re-explain the programme.
- Describing struggles: reflect the important parts and, once there is enough information, explain Michael's approach. Do not keep asking questions when you already understand.
- Wants change: connect that desire to Michael's work.
- Asks how Michael can help: explain the relevant teaching and introduce the Peaceful Path if it fits.
- Asks about the programme: answer directly; do not make them answer unnecessary questions first. Prices only as the Bible says (understand their situation first, then the flat approved wording, never invented).
- Ready to speak: invite them to the call or send the link; do not delay with extra nurturing.
- Not ready: respect it and continue naturally, with the Bible's gentle fallbacks if money or timing is the issue.
- Fact Find normally takes two or three exchanges. Do not bring up the programme or the call in the first replies unless they ask or are clearly ready (ready_to_buy).
- If they already received a link, do not send it again without a reason.

QUESTIONS must have a purpose: what they most want to change, how long, what they feel holds them back, what they have tried, what real peace would look like for them. Ask at most one question at a time, never repeat a question, never ask what they already explained, never interrogate, and not every message needs a question. Sometimes acknowledge and explain instead.

ADAPT TO THE PERSON: fear and anxiety (patterns, beliefs, letting go); low self-worth (their relationship with themselves); relationships (understand the specific experience, do not assume the cause); money struggles (be compassionate, never suggest coaching will fix finances); loss of faith (respect their own relationship with God); physical illness (be sensitive, never suggest the programme can cure or treat illness, never diagnose, never tell anyone to stop treatment); repeated disappointment (acknowledge lost trust, no exaggerated promises); feeling stuck.

THREE OPTIONS, each with a different purpose, not just different wording, all in Michael's voice:
1. "Natural and conversational": a warm, direct continuation of the conversation.
2. "Deeper and more personal": more emotionally thoughtful, acknowledging the deeper meaning behind what they shared.
3. "Strategic next step": moves the conversation on appropriately for this moment: an important question, explaining Michael's approach, introducing the Peaceful Path, inviting them to a call, or addressing an objection. If they are not ready, make it a nurturing reply instead of a pitch.
Typical length 40 to 130 words. Shorter for simple acknowledgements, questions and booking confirmations, longer for vulnerable disclosures, explaining the approach, the programme introduction or an objection. Natural paragraph breaks, never an essay.

BEFORE ANSWERING, check each option against: does it sound like Michael, acknowledge what they actually said, feel personal rather than generic, use the whole conversation, have the right timing, avoid pressure and promises, read naturally in a DM, and follow the Bible. Improve any that fail.

If ERIKA'S EXTRA INSTRUCTION is given (for example shorter, warmer, more heartfelt, introduce the Peaceful Path, move towards a call, no question, more direct, do not pitch yet, explain the approach, address money, sound more like Michael, acknowledge more deeply, do not repeat), follow it in all three options while respecting the Bible.

Return ONE JSON object only (no markdown) with these keys:
- "summary": 1-2 plain sentences on who this person is and what they said (third person).
- "door": "dream", "okay_fit" or "wrong_fit".
- "stage": the stage after their latest message: "Open", "Fact Find", "Qualify" or "Offer".
- "ready_to_buy": true only if they have followed Michael for years and are asking how to join.
- "needs_michael": true if you are unsure, they may know Michael, they ask something not covered, or the Bible says to hand over. Then "options" must be [].
- "michael_reason": short reason when needs_michael is true, otherwise "".
- "intel": {"step": a short label such as "Sharing struggles" or "Exploring the problem" or "Programme introduction" or "Call invitation" or "Hesitation"; "experiencing": 2-4 short bullets from what they actually said; "wants": 1-3 short bullets from what they actually said; "readiness": one short sentence on how ready they are, from the conversation only; "next_action": one short sentence; "warning": a short human-review warning, or ""}. Never invent facts about the person.
- "options": an array of exactly 3 objects {"label": "Natural and conversational" | "Deeper and more personal" | "Strategic next step", "purpose": a few words on what this option does, "reply": the DM to send}. Use their first name where natural. Never invent a link, price, date or fact: links only from RESOURCES, prices only as written in the Bible. Leave [day] and [time] exactly as written. Never mention voice notes. Never offer free calls or free one-to-one help.`;

/** A past draft and what Erika actually changed it into. The AI learns her tone and style from these. */
export type LearnedEdit = { ai: string; final: string };

export function editsBlock(edits?: LearnedEdit[]): string {
  if (!edits || edits.length === 0) return "";
  const clip = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 500);
  return `HOW ERIKA CHANGES YOUR DRAFTS (learn her tone, warmth, length and structure from the FINAL versions she prefers; never copy their wording)
${edits.map((e, i) => `Example ${i + 1}\nYou wrote: ${clip(e.ai)}\nShe sent: ${clip(e.final)}`).join("\n\n")}

`;
}

export const EXAMPLE_KINDS: Record<string, string> = {
  michael_message: "Michael's real message",
  programme_intro: "Peaceful Path introduction",
  call_invite: "Move to a discovery call",
  objection: "Response to an objection",
  empathy: "Empathetic message",
  teaching: "Explaining Michael's teaching",
  approved_edit: "Edited and approved by Erika",
};

/** Approved examples saved by Erika and Michael. Style and structure only, never to copy. */
export function examplesBlock(ex?: { kind: string; body: string; note?: string }[]): string {
  if (!ex || ex.length === 0) return "";
  const clip = (t: string, n = 700) => t.replace(/\s+/g, " ").trim().slice(0, n);
  return `APPROVED EXAMPLES (real messages Michael and Erika approved; learn how Michael speaks to leads, his tone, structure, timing and reasoning, never copy the wording)
${ex.map((e, i) => `${i + 1}. [${EXAMPLE_KINDS[e.kind] || e.kind}] ${e.note ? `They wrote: ${clip(e.note, 450)}\n   Michael replied: ` : ""}${clip(e.body)}`).join("\n")}

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
  examples?: { kind: string; body: string; note?: string }[];
  instruction?: string;
}): string {
  const line = (m: IgPromptMsg, max: number) => `[${m.when}] ${m.direction === "incoming" ? a.name : "Michael"}: ${m.body.replace(/\s+/g, " ").trim().slice(0, max)}`;
  return `BIBLE SECTIONS
${a.sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}

RESOURCES (the only links you may use)
${a.resources.map((r) => `- ${r.name}: ${r.url} (${r.purpose})`).join("\n") || "(none)"}

LEAD: ${a.name}. Came in as: ${SOURCE_LABEL[a.source]}. Current stage: ${a.stage}. So far they have sent ${a.theirCount ?? 0} message(s) and we have sent ${a.ourCount ?? 0}.

EARLIER CONVERSATION (context only)
${a.context.length ? a.context.map((m) => line(m, 350)).join("\n") : "(none)"}

${examplesBlock(a.examples)}${editsBlock(a.edits)}ALREADY SENT in this conversation (do NOT reuse its wording, openers or question shape)
${a.sent && a.sent.length ? a.sent.map((t) => `- ${t.replace(/\s+/g, " ").trim().slice(0, 400)}`).join("\n") : "(nothing yet)"}

NEW MESSAGES FROM THEM (reply to these)
${a.fresh.map((m) => line(m, 1500)).join("\n")}
${a.instruction ? `\nERIKA'S EXTRA INSTRUCTION (follow it in all three options): ${a.instruction}\n` : ""}${a.retryNote ? `\nYour previous answer broke the rules (${a.retryNote}). Rewrite it so it does not.\n` : ""}
Return the JSON object now.`;
}

export type IgOption = { label: string; purpose: string; reply: string };
export type IgIntel = { step: string; experiencing: string[]; wants: string[]; readiness: string; next_action: string; warning: string };
export type IgAnalysis = {
  summary: string;
  door: "dream" | "okay_fit" | "wrong_fit" | null;
  stage: string;
  ready_to_buy: boolean;
  needs_michael: boolean;
  michael_reason: string;
  /** The first option, kept for older code that expects a single reply. */
  reply: string;
  options: IgOption[];
  intel: IgIntel | null;
};

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : []);
export const OPTION_LABELS = ["Natural and conversational", "Deeper and more personal", "Strategic next step"];

export function parseIgAnalysis(raw: unknown, currentStage: string): IgAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = s(o.summary, 500);
  if (!summary) return null;
  const needs = o.needs_michael === true || o.needs_michael === "true";
  // Three options; an answer that only has a single "reply" still works as one option.
  let options: IgOption[] = [];
  if (!needs) {
    if (Array.isArray(o.options)) {
      options = (o.options as unknown[])
        .map((x, i) => {
          const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          return { label: s(r.label, 60) || OPTION_LABELS[i] || `Option ${i + 1}`, purpose: s(r.purpose, 120), reply: s(r.reply, 1600) };
        })
        .filter((x) => x.reply)
        .slice(0, 3);
    }
    if (options.length === 0) {
      const single = s(o.reply, 1600);
      if (single) options = [{ label: OPTION_LABELS[0], purpose: "", reply: single }];
    }
    if (options.length === 0) return null;
  }
  const d = String(o.door ?? "");
  const door = d === "dream" || d === "okay_fit" || d === "wrong_fit" ? d : null;
  const ready = o.ready_to_buy === true || o.ready_to_buy === "true";
  const cur = (STAGES as readonly string[]).indexOf(currentStage);
  let stage = currentStage;
  if (cur >= 0) {
    const want = (STAGES as readonly string[]).indexOf(String(o.stage));
    // From Open only to Fact Find; after that up to two steps when the conversation has really moved on.
    if (want > cur) stage = ready ? "Offer" : STAGES[Math.min(cur === 0 ? 1 : cur + 2, want, 3)];
  }
  const i = (o.intel && typeof o.intel === "object" ? o.intel : null) as Record<string, unknown> | null;
  const intel: IgIntel | null = i
    ? { step: s(i.step, 60), experiencing: list(i.experiencing, 4, 160), wants: list(i.wants, 3, 160), readiness: s(i.readiness, 240), next_action: s(i.next_action, 240), warning: s(i.warning, 240) }
    : null;
  return { summary, door, stage, ready_to_buy: ready, needs_michael: needs, michael_reason: needs ? s(o.michael_reason, 300) || "Not sure how to answer. Needs you." : "", reply: options[0]?.reply || "", options, intel };
}

/**
 * Turns a pasted conversation into (lead message, Michael reply) pairs. Lines start with "Michael:" for Michael
 * (or "Me:" / "Erika:") and "Lead:" (or "Them:" / "They:" / "Client:") for the other person. Text on the lines
 * after a label belongs to that speaker until the next label. Consecutive messages by the same speaker are merged.
 */
export function parseConversation(text: string): { lead: string; michael: string }[] {
  const re = /^\s*(michael|me|erika|lead|them|they|client|she|he)\s*[:\-–]\s*(.*)$/i;
  const turns: { who: "m" | "l"; text: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) {
      const who = /^(michael|me|erika)$/i.test(m[1]) ? "m" : "l";
      if (turns.length && turns[turns.length - 1].who === who) turns[turns.length - 1].text += "\n" + m[2];
      else turns.push({ who, text: m[2] });
    } else if (turns.length && line.trim()) turns[turns.length - 1].text += "\n" + line.trim();
  }
  const out: { lead: string; michael: string }[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].who !== "m" || !turns[i].text.trim()) continue;
    const prev = turns[i - 1];
    out.push({ lead: prev && prev.who === "l" ? prev.text.trim() : "", michael: turns[i].text.trim() });
  }
  return out;
}
