// Reads a Telegram Desktop export (result.json, or a single chat's export). Pure functions, no imports.

export type TgMsg = { at: number; fromMe: boolean; text: string; michael?: boolean };
export type TgChat = { key: string; name: string; messages: TgMsg[] };
export type TgParsed = { ok: true; chats: TgChat[]; meKnown: boolean } | { ok: false; error: string };

type Raw = Record<string, unknown>;

function flatten(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((p) => (typeof p === "string" ? p : p && typeof p === "object" && typeof (p as Raw).text === "string" ? ((p as Raw).text as string) : "")).join("");
  return "";
}

const MEDIA: Record<string, string> = { voice_message: "[voice message]", video_message: "[video message]", sticker: "[sticker]", animation: "[GIF]" };

function bodyOf(m: Raw): string {
  const text = flatten(m.text).trim();
  let tag = "";
  if (typeof m.media_type === "string" && MEDIA[m.media_type]) tag = MEDIA[m.media_type];
  else if (m.photo) tag = "[photo]";
  else if (m.file) tag = "[file]";
  return [text, tag].filter(Boolean).join(" ").trim();
}

/** Michael sometimes answers from Erika's account and signs the message with his name. */
export function signedByMichael(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return /^michael\s*[x♥❤️🙏.!]*$/i.test(last);
}

function chatFrom(c: Raw, meId: string | null, idx: number): TgChat | null {
  const raw = Array.isArray(c.messages) ? (c.messages as Raw[]) : [];
  const out: TgMsg[] = [];
  const senders: Record<string, number> = {};
  for (const m of raw) if (m.type === "message" && m.from_id) senders[String(m.from_id)] = (senders[String(m.from_id)] || 0) + 1;
  for (const m of raw) {
    if (m.type !== "message") continue; // joins, calls, pins and so on
    const body = bodyOf(m);
    if (!body) continue;
    const at = m.date_unixtime ? Number(m.date_unixtime) * 1000 : Date.parse(String(m.date || ""));
    if (!Number.isFinite(at)) continue;
    const fromMe = meId !== null && String(m.from_id) === meId;
    out.push({ at, fromMe, text: body, michael: fromMe && signedByMichael(body) });
  }
  if (out.length === 0) return null;
  out.sort((a, b) => a.at - b.at);
  return { key: String(c.id ?? idx), name: String(c.name || "").trim() || `Chat ${idx + 1}`, messages: out };
}

export function parseExport(x: unknown): TgParsed {
  if (!x || typeof x !== "object") return { ok: false, error: "That doesn't look like a Telegram export." };
  const r = x as Raw;
  const info = r.personal_information as Raw | undefined;
  const meRaw = info && (info.user_id ?? null);
  const meId = meRaw !== null && meRaw !== undefined ? `user${meRaw}` : null;
  const chats: TgChat[] = [];
  const list = (r.chats as Raw | undefined)?.list;
  if (Array.isArray(list)) {
    list.forEach((c, i) => {
      const cc = c as Raw;
      if (cc.type !== "personal_chat") return; // only one-to-one chats, never groups or channels
      const ch = chatFrom(cc, meId, i);
      if (ch) chats.push(ch);
    });
  } else if (Array.isArray(r.messages)) {
    if (r.type && r.type !== "personal_chat") return { ok: false, error: "That export is a group or channel. Export a one-to-one chat." };
    const ch = chatFrom(r, null, 0);
    if (ch) chats.push(ch);
  } else {
    return { ok: false, error: "That doesn't look like a Telegram export. Choose the result.json file." };
  }
  if (chats.length === 0) return { ok: false, error: "No one-to-one chats with text messages were found in that file." };
  return { ok: true, chats, meKnown: meId !== null };
}

/** For a single-chat export we don't know which side is "me". The chat name is the client, so anyone else is me. */
export function applySingleChatMe(raw: unknown, chat: TgChat): TgChat {
  const r = raw as Raw;
  const clientName = chat.name;
  const msgs = Array.isArray(r.messages) ? (r.messages as Raw[]) : [];
  const byTime = new Map<string, boolean>();
  for (const m of msgs) if (m.type === "message") byTime.set(`${m.date_unixtime}|${bodyOf(m)}`, String(m.from) !== clientName);
  return { ...chat, messages: chat.messages.map((m) => { const me = byTime.get(`${Math.round(m.at / 1000)}|${m.text}`) ?? false; return { ...m, fromMe: me, michael: me && signedByMichael(m.text) }; }) };
}

export function lastN(chat: TgChat, n: number | "all"): TgMsg[] {
  return n === "all" ? chat.messages : chat.messages.slice(-n);
}

export const sameMsg = (a: { at: number; text: string; fromMe: boolean }, b: { at: number; text: string; fromMe: boolean }) =>
  a.fromMe === b.fromMe && Math.round(a.at / 1000) === Math.round(b.at / 1000) && a.text.trim() === b.text.trim();
