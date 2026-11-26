// Telegram rules: Erika's voice, safety checks, score reading and analysis validation.
// Pure functions only (no imports) so they can be unit-tested and used on server and client.

export const ALLOWED_TAGS = [
  "CLIENT UPDATE",
  "CLIENT CONCERN",
  "NEEDS RESPONSE",
  "NEEDS GUIDANCE",
  "PROGRAM QUESTION",
  "PERSONAL UPDATE",
  "CLIENT PROGRESS",
  "UPCOMING SUPPORT",
  "SPEAKING REQUEST",
  "ADMINISTRATIVE",
  "FOLLOW-UP REQUIRED",
] as const;

export const URGENCIES = ["URGENT", "MEDIUM PRIORITY", "NOT URGENT"] as const;
export type Urgency = (typeof URGENCIES)[number];

export type Analysis = {
  summary: string;
  tags: string[];
  urgency: Urgency;
  needs_michael: boolean;
  michael_reason: string;
  internal_report: string;
  /** false when no reply from Erika is needed (Michael is already in the conversation, or it is a plain closing thank-you). */
  reply_needed: boolean;
  reply: string;
  flags: string[];
};

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

// ---------- Scores: read only what the client actually wrote ----------

export type Scores = { peace?: number; life?: number; body?: number };

const UNIT_AFTER = "(?!\\s*(?:days?|hours?|hrs?|weeks?|months?|years?|times?|mins?|minutes?|%|am|pm))";
function scoreRegex(label: string): RegExp {
  return new RegExp(
    `\\b${label}(?:\\s+score)?\\s*(?:is|was|:|=|-|–|—)?\\s*(\\d{1,2}(?:\\.\\d+)?)(?:\\s*\\/\\s*10)?\\b${UNIT_AFTER}`,
    "i"
  );
}
const SCORE_RE = { peace: scoreRegex("peace"), life: scoreRegex("life"), body: scoreRegex("body") };

/** Returns only scores written explicitly as "Peace 7", "Life: 6/10", etc. Never estimates. */
export function extractScores(text: string): Scores {
  const out: Scores = {};
  (Object.keys(SCORE_RE) as (keyof typeof SCORE_RE)[]).forEach((k) => {
    const m = text.match(SCORE_RE[k]);
    if (m) out[k] = parseFloat(m[1]);
  });
  return out;
}

// ---------- Crisis wording: always escalate to Michael, never generate advice ----------

const CRISIS_RE =
  /\b(suicid\w*|kill (myself|my ?self)|end (it all|my life)|want to die|self[- ]?harm|hurt(ing)? myself|can'?t breathe|chest pain|panic attack|panicking|emergency|ambulance|overdos\w*|collaps\w*)\b/i;

export function detectCrisis(text: string): boolean {
  return CRISIS_RE.test(text);
}

// ---------- Safety check for anything written in Erika's voice ----------

const RULES: { re: RegExp; why: string }[] = [
  { re: /\byou (should|could try|might want to|need to|must|ought to)\b/i, why: "gives advice" },
  { re: /\b(I recommend|I suggest|my advice|I'?d advise|have you tried|why not try)\b/i, why: "gives advice" },
  { re: /\b(try|consider) (to )?(breath\w*|meditat\w*|rest\w*|drink\w*|journal\w*|walk\w*|stretch\w*|relax\w*|grounding|sleep\w*|eat\w*)/i, why: "coaching suggestion" },
  { re: /\b(breathe|breathing|meditat\w*|journal\w*|mindful\w*|grounding|orrr)\b/i, why: "coaching technique" },
  { re: /\b(medication|medicine|doctor|physician|therap(y|ist)|diagnos\w*|symptom\w*|prescri\w*|dosage|supplement\w*|hospital|a&e)\b/i, why: "medical or therapeutic wording" },
  { re: /\b(healing|heal|universe|spirit\w*|energy|energies|chakra|karma|trauma|subconscious|inner child|manifest\w*|vibration|soul)\b/i, why: "spiritual or coaching wording" },
  { re: /\bit'?s (completely |totally |perfectly )?(normal|natural|okay|ok|common) (to|for)\b/i, why: "reassurance that interprets feelings" },
  { re: /\b(this|that) (is|means|shows|suggests|could be|might be) (a sign|because|your (body|mind))\b/i, why: "interprets symptoms or feelings" },
  { re: /\bwithin (the )?(next )?(\d+\s*)?(a |an )?(minute|hour|day|week)s?\b/i, why: "promises a response time" },
  { re: /\b(24 hours|by (tomorrow|tonight|today)|later today|tonight|this (evening|afternoon)|in the next (few )?(hours|days))\b/i, why: "promises a response time" },
  { re: /\bmichael (has|had) (already )?(replied|responded|seen|read|answered|messaged|got back)\b/i, why: "claims Michael has replied" },
  { re: /\bmichael (said|says|told me|wants you to|advises|thinks you)\b/i, why: "speaks for Michael" },
  { re: /\bI love (that|this)\b/i, why: "overused phrase" },
  { re: /(hope this (message )?finds you well|as an ai\b|i'?m an ai\b|language model)/i, why: "sounds robotic" },
];

/** Times of day and weekday-plus-number details in a draft must come from the conversation, never be invented. */
export function inventedDetails(reply: string, known: string): string[] {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, "");
  const k = norm(known);
  const times = reply.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi) || [];
  return times.filter((t) => !k.includes(norm(t))).map((t) => `invented a time (${t.trim()})`);
}

export function checkErikaReply(text: string, known = ""): string[] {
  const problems: string[] = [];
  const t = text.trim();
  if (known) problems.push(...inventedDetails(t, known));
  if (!t) problems.push("empty reply");
  for (const r of RULES) if (r.re.test(t) && !problems.includes(r.why)) problems.push(r.why);
  if (t.length > 900) problems.push("too long");
  if ((t.match(/!/g) || []).length > 2) problems.push("too many exclamation marks");
  return problems;
}

/** Any link in an Erika draft must be one saved under Resources. Never invented. */
export function checkUrls(text: string, allowed: string[]): string[] {
  const clean = (u: string) => u.replace(/[.,!?)]+$/, "");
  const ok = allowed.map(clean);
  return (text.match(/https?:\/\/[^\s]+/g) || []).map(clean).filter((u) => !ok.includes(u)).map((u) => `link not in Resources: ${u}`);
}

/** Plain, safe acknowledgement used only if the AI keeps breaking the rules. */
export function fallbackReply(clientName: string, needsMichael: boolean): string {
  const n = firstName(clientName);
  return needsMichael
    ? `Hi ${n}, thanks for sharing that with me. I'll make sure Michael sees this and gets back to you personally as soon as he can.`
    : `Hi ${n}, thanks for the update. I've passed it on to Michael.`;
}

// ---------- Prompts ----------

export const ERIKA_SYSTEM = `You write for Erika, the assistant to Michael Watson at Reborn with Michael. Erika is NOT a coach. She manages admin for Michael's existing clients on Telegram.

You will receive a client's new Telegram message(s) plus earlier conversation for context. Return ONE JSON object only (no markdown) with these keys:
- "summary": 1-3 plain sentences about what the client's NEW message(s) say, about the client in the third person (e.g. "Anita says the pain has returned..."). Do not repeat older history as if it were new.
- "tags": 2 or 3 tags chosen ONLY from: ${ALLOWED_TAGS.join(", ")}
- "urgency": exactly one of "URGENT", "MEDIUM PRIORITY", "NOT URGENT"
- "needs_michael": true only if the client needs Michael's personal guidance or attention (a concern, symptoms, distress, coaching or programme guidance, a request for Michael). false for positive updates, thank-yous and admin.
- "michael_reason": short phrase saying what Michael needs to address ("" if needs_michael is false). Never invent actions.
- "internal_report": 2-5 sentences written directly to Michael using "you". Do not hand Michael jobs that Erika can do herself (admin, links, scheduling): say what Erika will do and only ask Michael for what only he can answer. Say what happened, the important context, the client's questions or concerns, and what you need to know or do. Never refer to Michael in the third person. Do not say any reply has been sent.
- "reply_needed": true or false. Set false ONLY when Erika has nothing to answer: (a) the earlier conversation shows Michael (personally) wrote the most recent message(s) to this client and the client's new message simply continues that conversation with Michael, or (b) the new message is only a closing acknowledgement (thanks, ok, an emoji, a blessing) with no question or request. Set true when the client asks Erika something (admin, scheduling, links, a request), shares news or a concern after Erika's own last message or after a long gap, or starts a new topic. When unsure, use true.
- "reply": Erika's draft reply to the client (see voice rules). Use "" when reply_needed is false.

Erika's voice for "reply": warm, natural, caring, concise (usually 1-3 short sentences), clear, professional but not corporate, conversational, direct without being rude. UK phrasing where natural. Start with the client's first name. No long polished paragraphs. Do not overuse exclamation marks. Never say "I love that".

Erika CAN: acknowledge updates, answer admin and scheduling questions, handle session and group-session logistics, check in, confirm she has passed information to Michael, take responsibility for next steps.

Erika must NEVER: give coaching, spiritual, therapeutic, mental-health or medical advice; diagnose; interpret physical symptoms or feelings; suggest techniques or things to try; say what something "means"; promise when Michael will reply; say Michael has already replied or said anything.

Whenever reply_needed is true, write a reply, even when Michael must respond personally. In that case Erika warmly acknowledges and says Michael will respond personally, for example: "Thanks for sharing that with me. I'll make sure Michael sees this and gets back to you personally as soon as he can." Vary the wording. If you do not know an admin answer (a date, a time, a link, a price), do not guess: say you will check with Michael and come back. NEVER state a time, date, price or link that is not written in the conversation you were given (for example, do not invent when a group call is).

Match the reply to what the client actually said. Positive update: a short, genuine acknowledgement and that you will share it with Michael. Question for Michael: acknowledge, say you'll pass it on. Logistics you cannot answer: say you'll check and come back.`;

export type PromptMessage = { direction: "incoming" | "outgoing"; sender?: "erika" | "michael"; body: string; when: string };

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function buildAnalysisPrompt(args: {
  clientName: string;
  context: PromptMessage[];
  fresh: PromptMessage[];
  retryNote?: string;
}): string {
  const line = (m: PromptMessage, max: number) =>
    `[${m.when}] ${m.direction === "incoming" ? "Client" : m.sender === "michael" ? "Michael (personally)" : "Erika"}: ${clip(m.body.replace(/\s+/g, " ").trim(), max)}`;
  const ctx = args.context.length
    ? args.context.map((m) => line(m, 400)).join("\n")
    : "(no earlier messages)";
  const fresh = args.fresh.map((m) => line(m, 1800)).join("\n");
  return `CLIENT: ${args.clientName}

EARLIER CONVERSATION (context only, NOT new):
${ctx}

NEW MESSAGES FROM THE CLIENT (analyse and reply to these):
${fresh}
${args.retryNote ? `\nYour previous draft broke Erika's rules (${args.retryNote}). Rewrite the "reply" so it does not, keeping it short and warm.\n` : ""}
Return the JSON object now.`;
}

// ---------- Validate whatever the model returned ----------

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function parseAnalysis(raw: unknown, clientText: string): Analysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const replyNeeded = !(o.reply_needed === false || o.reply_needed === "false");
  const reply = replyNeeded ? str(o.reply, 1500) : "";
  const summary = str(o.summary, 600);
  if ((replyNeeded && !reply) || !summary) return null;

  const tags = Array.isArray(o.tags)
    ? Array.from(
        new Set(
          o.tags
            .map((t) => String(t).toUpperCase().trim())
            .filter((t) => (ALLOWED_TAGS as readonly string[]).includes(t))
        )
      ).slice(0, 3)
    : [];
  if (tags.length === 0) tags.push("CLIENT UPDATE");

  const u = String(o.urgency ?? "").toUpperCase().trim();
  let urgency: Urgency = (URGENCIES as readonly string[]).includes(u) ? (u as Urgency) : "MEDIUM PRIORITY";

  let needs = o.needs_michael === true || o.needs_michael === "true";
  let reason = str(o.michael_reason, 300);
  const flags: string[] = [];

  // Crisis wording always goes to Michael as urgent, whatever the model said.
  if (detectCrisis(clientText)) {
    urgency = "URGENT";
    if (!needs) {
      needs = true;
      reason = reason || "Client used wording that may need urgent personal attention";
    }
    flags.push("crisis_wording");
  }
  if (needs && !reason) reason = "Needs your personal response";
  if (!needs) reason = "";

  return {
    summary,
    tags,
    urgency,
    needs_michael: needs,
    michael_reason: reason,
    internal_report: str(o.internal_report, 1500),
    reply_needed: replyNeeded,
    reply,
    flags,
  };
}

/** Pull the first JSON object out of model text, tolerating code fences. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      return null;
    }
  }
  return null;
}

// ---------- Monday check-ins ----------

export const ERIKA_SYSTEM_CHECKIN = `You write for Erika, the assistant to Michael Watson at Reborn with Michael. Erika is NOT a coach. Every Monday she checks in with each of Michael's existing clients on Telegram.

You will receive one client's recent Telegram conversation. Return ONE JSON object only (no markdown): {"reply": "..."}.

Write Erika's Monday check-in to THIS client. It must be personal to them: refer naturally to one specific thing from their conversation (something they shared, an update, a session, an upcoming event), so it could not be sent to anyone else. If the conversation is thin, keep it short and still use their name and what you do know.

Include the idea that Michael asked her to check in, using wording like "Michael asked me to also check in on you". Voice: warm, natural, caring, concise (2-4 short sentences), conversational, UK phrasing where natural, no corporate tone, few exclamation marks, never "I love that". Start with the client's first name.

Erika must NEVER: give coaching, spiritual, therapeutic, mental-health or medical advice; diagnose; interpret symptoms or feelings; suggest things to try; promise when Michael will reply; say Michael has replied or said anything beyond asking her to check in. Do not quote scores or numbers unless the client gave them in this conversation. Do not invent events or facts. End with a simple, open question about how they are doing.`;

export function buildCheckinPrompt(args: { clientName: string; summary: string; history: PromptMessage[]; retryNote?: string }): string {
  const line = (m: PromptMessage) => `[${m.when}] ${m.direction === "incoming" ? "Client" : m.sender === "michael" ? "Michael (personally)" : "Erika"}: ${clip(m.body.replace(/\s+/g, " ").trim(), 350)}`;
  return `CLIENT: ${args.clientName}
${args.summary ? `LATEST SUMMARY: ${args.summary}\n` : ""}
RECENT CONVERSATION:
${args.history.length ? args.history.map(line).join("\n") : "(no earlier messages)"}
${args.retryNote ? `\nYour previous draft broke the rules (${args.retryNote}). Rewrite it so it does not.\n` : ""}
Return the JSON object now.`;
}
