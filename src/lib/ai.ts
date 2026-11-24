// SERVER ONLY. Talks to an OpenAI-compatible chat API (Groq by default).
// The key is read from environment variables and never reaches the browser.
//
// To switch provider later, change these Vercel variables (no code changes):
//   AI_BASE_URL  e.g. https://api.groq.com/openai/v1
//   AI_API_KEY   (falls back to GROQ_API_KEY)
//   AI_MODEL     (falls back to GROQ_MODEL, then openai/gpt-oss-120b)

export type AiResult = { ok: true; text: string } | { ok: false; error: string; code: "no_key" | "rate_limited" | "auth" | "failed" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatJson(system: string, user: string): Promise<AiResult> {
  const key = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    return { ok: false, code: "no_key", error: "The AI isn't connected yet: GROQ_API_KEY is missing in Vercel." };
  }
  const base = (process.env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
    max_completion_tokens: 1600,
    response_format: { type: "json_object" },
  };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

  let lastStatus = 0;
  let lastMsg = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 40_000);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      lastStatus = res.status;
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) return { ok: true, text };
        lastMsg = "empty answer";
        continue;
      }
      const errText = await res.text();
      lastMsg = errText.slice(0, 300);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, code: "auth", error: "The AI provider rejected the key. Check GROQ_API_KEY in Vercel." };
      }
      if (res.status === 400 && /response_format|reasoning_effort/i.test(errText)) {
        delete body.response_format;
        delete body.reasoning_effort;
        continue;
      }
      if (res.status === 429) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || 8, 15);
        if (attempt < 2) {
          await sleep(wait * 1000);
          continue;
        }
        return { ok: false, code: "rate_limited", error: "Groq's free limit was reached for the moment. Wait a minute, then press Retry." };
      }
      if (res.status >= 500) {
        await sleep(1500);
        continue;
      }
      break;
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : "network error";
      await sleep(1000);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, code: "failed", error: `The AI didn't answer (${lastStatus || "no connection"}). Press Retry. ${lastMsg ? "" : ""}`.trim() };
}
