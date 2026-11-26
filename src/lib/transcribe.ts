// SERVER ONLY. Turns a voice note into text with Groq's Whisper (OpenAI-compatible endpoint).
// The audio is sent straight through and never saved anywhere. Only the text comes back.
//   WHISPER_MODEL  optional, defaults to whisper-large-v3-turbo (free tier)

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string };

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // Vercel's request limit is about 4.5 MB

/** Work out the real audio type from the first bytes, so odd or missing file endings (.oga, none) still work. */
export function sniffAudioName(head: Uint8Array, name: string): string {
  const a = (i: number) => head[i] ?? 0;
  const str = (i: number, n: number) => String.fromCharCode(...Array.from(head.slice(i, i + n)));
  if (str(0, 4) === "OggS") return "voice.ogg";
  if (str(0, 4) === "fLaC") return "voice.flac";
  if (str(0, 4) === "RIFF" && str(8, 4) === "WAVE") return "voice.wav";
  if (a(0) === 0x1a && a(1) === 0x45 && a(2) === 0xdf && a(3) === 0xa3) return "voice.webm";
  if (str(4, 4) === "ftyp") return "voice.m4a";
  if (str(0, 3) === "ID3" || (a(0) === 0xff && (a(1) & 0xe0) === 0xe0)) return "voice.mp3";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "oga" || ext === "opus") return "voice.ogg";
  if (["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"].includes(ext)) return `voice.${ext}`;
  return "voice.ogg";
}

export async function transcribe(file: File): Promise<TranscribeResult> {
  const key = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: "The AI isn't connected yet: GROQ_API_KEY is missing in Vercel." };
  const base = (process.env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = process.env.WHISPER_MODEL || "whisper-large-v3-turbo";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fname = sniffAudioName(bytes.slice(0, 16), file.name || "");
  const blob = new Blob([bytes], { type: "application/octet-stream" });

  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.append("file", blob, fname);
    form.append("model", model);
    form.append("response_format", "json");
    form.append("temperature", "0");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 50_000);
    try {
      const res = await fetch(`${base}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal: ctl.signal });
      if (res.ok) {
        const data = await res.json();
        const text = typeof data?.text === "string" ? data.text.trim() : "";
        return text ? { ok: true, text } : { ok: false, error: "No speech was found in that recording." };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, error: "The AI provider rejected the key. Check GROQ_API_KEY in Vercel." };
      if (res.status === 429) {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 6000));
          continue;
        }
        return { ok: false, error: "Groq's free limit was reached for the moment. Wait a minute and try again." };
      }
      if (res.status === 400 || res.status === 413 || res.status === 415) {
        const t = (await res.text()).slice(0, 200);
        return { ok: false, error: `That file couldn't be read as audio (${res.status}). ${t}`.trim() };
      }
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return { ok: false, error: `The transcription didn't work (${res.status}).` };
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "The transcription service didn't answer. Try again." };
}
