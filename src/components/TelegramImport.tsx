"use client";

import { useMemo, useRef, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { utcToZonedInput, formatDateTime } from "@/lib/core";
import { extractScores } from "@/lib/erika";
import { applySingleChatMe, lastN, parseExport, sameMsg, type TgChat } from "@/lib/tgImport";

type Pick = { on: boolean; chat: TgChat };
const LIMITS: { v: string; label: string }[] = [
  { v: "25", label: "Last 25 messages" }, { v: "50", label: "Last 50 messages" }, { v: "100", label: "Last 100 messages" }, { v: "all", label: "Everything" },
];

export function TelegramImport({ onClose }: { onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { clients, settings, reloadClients } = useAppData();
  const tz = settings?.timezone || "Asia/Manila";
  const fileRef = useRef<HTMLInputElement>(null);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [limit, setLimit] = useState("25");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<string[] | null>(null);

  async function choose(f: File | undefined) {
    setErr(null); setPicks(null);
    if (!f) return;
    let raw: unknown;
    try { raw = JSON.parse(await f.text()); } catch { return setErr("That file couldn't be read. Choose the result.json file from the Telegram export."); }
    const p = parseExport(raw);
    if (!p.ok) return setErr(p.error);
    const chats = p.meKnown ? p.chats : p.chats.map((c) => applySingleChatMe(raw, c));
    chats.sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at);
    setPicks(chats.map((chat) => ({ on: chats.length === 1, chat })));
  }

  const existing = (name: string) => clients.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const shown = (picks || []).filter((p) => p.chat.name.toLowerCase().includes(q.trim().toLowerCase()));
  const chosen = (picks || []).filter((p) => p.on);

  async function run() {
    setBusy(true); setErr(null); const log: string[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        const chat = chosen[i].chat;
        setProgress(`Importing ${chat.name} (${i + 1} of ${chosen.length})…`);
        let client = existing(chat.name);
        let clientId = client?.id;
        if (!clientId) {
          const { data, error } = await supabase.from("clients").insert({ name: chat.name, status: "Active" }).select("*").single();
          if (error) throw new Error(`${chat.name}: ${error.message}`);
          clientId = data.id as string; client = data;
        }
        const have: { at: number; text: string; fromMe: boolean }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from("client_messages").select("direction,body,sent_at").eq("client_id", clientId).range(from, from + 999);
          if (error) throw new Error(`${chat.name}: ${error.message}`);
          (data || []).forEach((m: { direction: string; body: string; sent_at: string }) => have.push({ at: new Date(m.sent_at).getTime(), text: m.body, fromMe: m.direction === "outgoing" }));
          if (!data || data.length < 1000) break;
        }
        const fresh = lastN(chat, limit === "all" ? "all" : Number(limit)).filter((m) => !have.some((h) => sameMsg(h, m)));
        const rows = fresh.map((m) => ({
          client_id: clientId, direction: m.fromMe ? "outgoing" : "incoming", sender: "erika", body: m.text,
          sent_at: new Date(m.at).toISOString(), session_date: utcToZonedInput(new Date(m.at).toISOString(), tz).slice(0, 10),
          history_only: true, analyzed: true,
        }));
        for (let k = 0; k < rows.length; k += 200) {
          const { error } = await supabase.from("client_messages").insert(rows.slice(k, k + 200));
          if (error) throw new Error(`${chat.name}: ${error.message}`);
        }
        // Scores the client wrote, exactly as written, plus last-contact dates.
        const scored = fresh.filter((m) => !m.fromMe).map((m) => ({ m, s: extractScores(m.text) })).filter((x) => Object.keys(x.s).length);
        if (scored.length) {
          await supabase.from("score_history").insert(scored.map(({ m, s }) => ({ client_id: clientId, peace: s.peace ?? null, life: s.life ?? null, body: s.body ?? null, recorded_at: new Date(m.at).toISOString() })));
        }
        const patch: Record<string, unknown> = {};
        const lastIn = fresh.filter((m) => !m.fromMe).reduce((t, m) => Math.max(t, m.at), 0);
        const lastOut = fresh.filter((m) => m.fromMe).reduce((t, m) => Math.max(t, m.at), 0);
        const prevIn = client?.last_message_at ? new Date(client.last_message_at).getTime() : 0;
        const prevOut = client?.last_response_at ? new Date(client.last_response_at).getTime() : 0;
        if (lastIn > prevIn) patch.last_message_at = new Date(lastIn).toISOString();
        if (lastOut > prevOut) patch.last_response_at = new Date(lastOut).toISOString();
        if (scored.length && lastIn >= prevIn) {
          const l = scored[scored.length - 1].s;
          if (l.peace !== undefined) patch.peace_score = l.peace;
          if (l.life !== undefined) patch.life_score = l.life;
          if (l.body !== undefined) patch.body_score = l.body;
        }
        if (Object.keys(patch).length) await supabase.from("clients").update(patch).eq("id", clientId);
        log.push(`${chat.name}: ${rows.length} added${fresh.length < lastN(chat, limit === "all" ? "all" : Number(limit)).length ? ", the rest were already saved" : ""}`);
      }
      await reloadClients();
      setDone(log);
    } catch (e) { setErr(`${e instanceof Error ? e.message : "The import failed."} Anything already imported is safe, and you can run it again.`); }
    setBusy(false); setProgress("");
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="Import from Telegram">
      <div className="modal" style={{ maxWidth: 640 }}>
        <h2>Import from Telegram</h2>
        {err && <div className="banner error" role="alert">{err}</div>}
        {done ? (
          <>
            <div className="banner" role="status"><b>Import finished.</b><ul style={{ margin: "6px 0 0 18px" }}>{done.map((d) => <li key={d}>{d}</li>)}</ul></div>
            <p className="sub">Everything was saved to history only. No replies were written and your reports and KPIs are unchanged.</p>
            <div className="row"><button className="btn primary" onClick={onClose}>Done</button></div>
          </>
        ) : !picks ? (
          <>
            <p className="sub">Export your chats from <b>Telegram Desktop</b> on a computer (the phone app can&apos;t export):</p>
            <ol style={{ margin: "6px 0 12px 18px", lineHeight: 1.6 }}>
              <li>Open Telegram Desktop, then Settings, Advanced, <b>Export Telegram data</b>.</li>
              <li>Tick <b>Personal chats</b> only. Untick everything else (photos, videos, files, groups).</li>
              <li>Set Format to <b>Machine-readable JSON</b>. Optionally set a start date to keep it small.</li>
              <li>Press Export, then choose the <b>result.json</b> file below.</li>
            </ol>
            <p className="sub">The file is read in your browser and saved straight to your own account. It is never sent to the AI.</p>
            <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Choose Telegram export file" onChange={(e) => choose(e.target.files?.[0])} />
            <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={onClose}>Cancel</button></div>
          </>
        ) : (
          <>
            <p className="sub">{picks.length} chats found. Tick the ones that are clients. Existing clients are matched by name; new names are added as Active clients.</p>
            <div className="two">
              <div className="field"><label htmlFor="ti-q">Search</label><input id="ti-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="field"><label htmlFor="ti-n">How much to import per client</label>
                <select id="ti-n" value={limit} onChange={(e) => setLimit(e.target.value)}>{LIMITS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}</select></div>
            </div>
            <div className="row" style={{ margin: "6px 0" }}>
              <button className="btn" type="button" onClick={() => setPicks(picks.map((p) => (p.chat.name.toLowerCase().includes(q.trim().toLowerCase()) ? { ...p, on: true } : p)))}>Tick all shown</button>
              <button className="btn" type="button" onClick={() => setPicks(picks.map((p) => ({ ...p, on: false })))}>Clear</button>
            </div>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 6 }}>
              {shown.map((p) => (
                <label key={p.chat.key} className="checkrow" style={{ padding: "6px 8px" }}>
                  <input type="checkbox" checked={p.on} onChange={(e) => setPicks(picks.map((x) => (x === p ? { ...x, on: e.target.checked } : x)))} />
                  <span><b>{p.chat.name}</b> · {p.chat.messages.length} messages · last {formatDateTime(new Date(p.chat.messages[p.chat.messages.length - 1].at).toISOString(), tz)}{existing(p.chat.name) ? " · already a client" : " · new"}</span>
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={busy || chosen.length === 0} onClick={run}>{busy ? "Importing…" : `Import ${chosen.length} chat${chosen.length === 1 ? "" : "s"}`}</button>
              <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
            </div>
            {progress && <p className="sub" role="status">{progress}</p>}
          </>
        )}
      </div>
    </div>
  );
}
