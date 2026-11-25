"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLES, TABLE_LABEL, buildBackup, toCsv, validateBackup, type Backup } from "@/lib/backup";
import { useAppData } from "@/components/AppData";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function fetchAll(supabase: ReturnType<typeof createClient>, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data as Record<string, unknown>[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function BackupCard() {
  const supabase = useMemo(() => createClient(), []);
  const { today } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; counts: Record<string, number>; total: number } | null>(null);

  async function load() {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const t of TABLES) tables[t] = await fetchAll(supabase, t);
    const { data: s } = await supabase.from("settings").select("*").maybeSingle();
    return { tables, settings: (s as Record<string, unknown>) || null };
  }

  async function exportJson() {
    setBusy(true); setMsg(null);
    try {
      const { tables, settings } = await load();
      const b = buildBackup(settings, tables, new Date().toISOString());
      download(`miss-erika-backup-${today}.json`, JSON.stringify(b, null, 2), "application/json");
      const n = Object.values(b.tables).reduce((a, r) => a + r.length, 0);
      setMsg({ kind: "ok", text: `Backup downloaded (${n} records). Keep the file somewhere safe, like Google Drive.` });
    } catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "The backup failed." }); }
    setBusy(false);
  }

  async function exportCsv(which: "clients" | "ig_leads" | "ig_calls" | "kpi_reports" | "client_messages") {
    setBusy(true); setMsg(null);
    try {
      const rows = await fetchAll(supabase, which);
      const cols = rows.length ? Object.keys(rows[0]).filter((c) => c !== "user_id") : ["id"];
      download(`miss-erika-${which}-${today}.csv`, toCsv(rows, cols), "text/csv");
      setMsg({ kind: "ok", text: `Downloaded ${rows.length} ${TABLE_LABEL[which].toLowerCase()}.` });
    } catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "The export failed." }); }
    setBusy(false);
  }

  async function chooseFile(f: File | undefined) {
    setMsg(null); setPending(null);
    if (!f) return;
    let parsed: unknown;
    try { parsed = JSON.parse(await f.text()); } catch { return setMsg({ kind: "error", text: "That file couldn't be read. Choose a .json backup made by this app." }); }
    const v = validateBackup(parsed);
    if (!v.ok) return setMsg({ kind: "error", text: v.error });
    setPending({ backup: parsed as Backup, counts: v.counts, total: v.total });
  }

  async function restore() {
    if (!pending) return;
    setBusy(true); setMsg(null);
    try {
      let done = 0;
      for (const t of TABLES) {
        const rows = pending.backup.tables[t] || [];
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { error } = await supabase.from(t).upsert(chunk, { onConflict: "id" });
          if (!error) { done += chunk.length; continue; }
          if (error.code !== "23505") throw new Error(`${TABLE_LABEL[t]}: ${error.message}`);
          // A row clashes with a different one already here (e.g. an automatic task for the same day). Go one by one and skip the clashes.
          for (const r of chunk) {
            const one = await supabase.from(t).upsert(r, { onConflict: "id" });
            if (!one.error) done++;
            else if (one.error.code !== "23505") throw new Error(`${TABLE_LABEL[t]}: ${one.error.message}`);
          }
        }
      }
      const s = pending.backup.settings;
      if (s) {
        const { display_name, manager_name, timezone, quiet_inactive_days } = s as Record<string, unknown>;
        await supabase.from("settings").update({ display_name, manager_name, timezone, quiet_inactive_days }).not("user_id", "is", null);
      }
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ kind: "ok", text: `Restored ${done} records. Reload the page to see everything.` });
    } catch (e) { setMsg({ kind: "error", text: `${e instanceof Error ? e.message : "The restore failed."} Nothing was deleted. You can try again.` }); }
    setBusy(false);
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><h2>Backup and export</h2></div>
      <p className="sub">Your data lives in Supabase. A backup file is your own extra copy of everything: clients, messages, drafts, leads, calls, reports, tasks, links and the Sales Bible.</p>
      {msg && <div className={`banner ${msg.kind === "error" ? "error" : ""}`} role={msg.kind === "error" ? "alert" : "status"} style={{ marginTop: 10 }}>{msg.text}</div>}
      <div className="row" style={{ margin: "12px 0", flexWrap: "wrap" }}>
        <button className="btn primary" onClick={exportJson} disabled={busy}>{busy ? "Working…" : "Download full backup"}</button>
      </div>
      <div className="panel-title">Spreadsheet exports (CSV)</div>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 16 }}>
        <button className="btn" disabled={busy} onClick={() => exportCsv("clients")}>Telegram clients</button>
        <button className="btn" disabled={busy} onClick={() => exportCsv("client_messages")}>Telegram messages</button>
        <button className="btn" disabled={busy} onClick={() => exportCsv("ig_leads")}>Instagram leads</button>
        <button className="btn" disabled={busy} onClick={() => exportCsv("ig_calls")}>Discovery calls</button>
        <button className="btn" disabled={busy} onClick={() => exportCsv("kpi_reports")}>Weekly KPI reports</button>
      </div>
      <div className="panel-title">Restore from a backup</div>
      <p className="sub">Restoring adds back anything in the file. It never deletes what's already in the app, and anything with the same ID is overwritten with the backup&apos;s version.</p>
      <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Choose backup file" onChange={(e) => chooseFile(e.target.files?.[0])} style={{ margin: "8px 0" }} />
      {pending && (
        <div className="banner" style={{ marginTop: 8 }}>
          <b>This backup was made {new Date(pending.backup.exported_at).toLocaleString()} and holds {pending.total} records:</b>
          <ul style={{ margin: "6px 0 10px 18px" }}>
            {TABLES.filter((t) => pending.counts[t] > 0).map((t) => <li key={t}>{TABLE_LABEL[t]}: {pending.counts[t]}</li>)}
          </ul>
          <button className="btn primary" disabled={busy} onClick={restore}>{busy ? "Restoring…" : "Restore this backup"}</button>{" "}
          <button className="btn" disabled={busy} onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = ""; }}>Cancel</button>
        </div>
      )}
    </section>
  );
}
