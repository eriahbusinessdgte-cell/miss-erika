"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppData } from "@/components/AppData";
import { buildHotSeatReport, parseNames, thursdayOf, weekStartOf } from "@/lib/hotseat";

type Row = { id: string; name: string };

function longDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A clean sticky note for this week's Hot Seat names, plus the Wednesday report for the manager. */
export function HotSeatCard({
  today, manager, from, onState,
}: { today: string; manager: string; from: string; onState?: (s: { count: number; sent: boolean }) => void }) {
  const supabase = createClient();
  const { tasks, setTaskStatus } = useAppData();
  const week = weekStartOf(today);
  const thursday = thursdayOf(week);
  const [rows, setRows] = useState<Row[]>([]);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const [n, w] = await Promise.all([
      supabase.from("hot_seat").select("id,name").eq("week_start", week).order("created_at", { ascending: true }),
      supabase.from("hot_seat_weeks").select("report_sent_at").eq("week_start", week).maybeSingle(),
    ]);
    if (n.error) return setErr("Couldn't load the Hot Seat list: " + n.error.message);
    setRows((n.data as Row[]) || []);
    setSentAt((w.data as { report_sent_at: string | null } | null)?.report_sent_at ?? null);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (loaded) onState?.({ count: rows.length, sent: !!sentAt }); }, [loaded, rows.length, sentAt, onState]);

  async function add() {
    const names = parseNames(text, rows.map((r) => r.name));
    if (names.length === 0) { setText(""); return; }
    setErr(null);
    const { error } = await supabase.from("hot_seat").insert(names.map((name) => ({ week_start: week, name })));
    if (error) return setErr("Couldn't save: " + error.message);
    setText("");
    await load();
    box.current?.focus();
  }

  async function remove(id: string) {
    setErr(null);
    const { error } = await supabase.from("hot_seat").delete().eq("id", id);
    if (error) return setErr("Couldn't remove: " + error.message);
    await load();
  }

  const report = buildHotSeatReport(rows.map((r) => r.name), longDay(thursday), manager, from);

  async function copy() {
    try { await navigator.clipboard.writeText(report); } catch {
      const t = document.createElement("textarea");
      t.value = report; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function markSent(sent: boolean) {
    setErr(null);
    const { error } = await supabase.from("hot_seat_weeks").upsert({ week_start: week, report_sent_at: sent ? new Date().toISOString() : null }, { onConflict: "user_id,week_start" });
    if (error) return setErr("Couldn't save: " + error.message);
    if (sent) {
      const t = tasks.find((x) => x.kind === "hot_seat_report" && x.status !== "Done" && x.due_date && weekStartOf(x.due_date) === week);
      if (t) await setTaskStatus(t, "Done");
    }
    await load();
  }

  return (
    <section className="card sticky" id="hot-seat">
      <div className="card-head">
        <h2>📌 Hot Seat This Week</h2>
        <span className="sticky-day">Thursday, {longDay(thursday).replace(/^Thursday /, "")}</span>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {loaded && rows.length === 0 && <p className="sticky-empty">No names yet. Add them below as you confirm them.</p>}
      {rows.length > 0 && (
        <ol className="sticky-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.name}</span>
              <button type="button" className="sticky-x" onClick={() => remove(r.id)} aria-label={`Remove ${r.name}`}>×</button>
            </li>
          ))}
        </ol>
      )}
      <div className="sticky-add">
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder="Add a name (or paste a list), then press Enter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void add(); } }}
        />
        <button type="button" className="btn" onClick={() => void add()} disabled={!text.trim()}>Add</button>
      </div>
      <div className="sticky-foot">
        <button type="button" className="btn primary" onClick={() => void copy()} disabled={rows.length === 0}>{copied ? "Copied ✓" : `Copy report for ${manager}`}</button>
        {sentAt ? (
          <span className="sticky-sent">Sent ✓ <button type="button" className="linklike" onClick={() => void markSent(false)}>undo</button></span>
        ) : (
          <button type="button" className="btn" onClick={() => void markSent(true)} disabled={rows.length === 0}>Mark as sent</button>
        )}
      </div>
    </section>
  );
}
