"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateTime, prettyDate, zonedToUtc } from "@/lib/core";
import { buildReport, reportChanged, type RMessage } from "@/lib/report";
import type { Client, ClientMessage, DailyReport } from "@/lib/types";

export default function DailyReportPage() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const { settings, tasks, setTaskStatus } = useAppData();
  const supabase = useMemo(() => createClient(), []);
  const tz = settings?.timezone || "Asia/Manila";

  const [clients, setClients] = useState<Client[]>([]);
  const [msgs, setMsgs] = useState<ClientMessage[]>([]);
  const [versions, setVersions] = useState<DailyReport[]>([]);
  const [history, setHistory] = useState<DailyReport[]>([]);
  const [prevEnd, setPrevEnd] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const dayStart = zonedToUtc(`${date}T00:00`, tz);
  const dayEnd = zonedToUtc(`${addDays(date, 1)}T00:00`, tz);

  const load = useCallback(async () => {
    if (!dayStart || !dayEnd) return;
    const [c, v, h, prior] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("daily_reports").select("*").eq("report_date", date).order("version", { ascending: true }),
      supabase.from("daily_reports").select("*").order("report_date", { ascending: false }),
      supabase.from("daily_reports").select("*").eq("status", "sent").lt("report_date", date).order("report_date", { ascending: false }),
    ]);
    const e = c.error || v.error || h.error || prior.error;
    if (e) setErr(e.message);
    const start = prior.data && prior.data.length && prior.data[0].period_end ? new Date(prior.data[0].period_end).getTime() : null;
    setPrevEnd(start);
    const from = new Date(Math.min(dayStart.getTime(), start ?? Infinity)).toISOString();
    const m = await supabase.from("client_messages").select("*").gte("created_at", from).lt("created_at", dayEnd.toISOString());
    // replies sent after the period still count for "pending" truthfulness, so also load the latest outgoing ones
    const out = await supabase.from("client_messages").select("*").eq("direction", "outgoing");
    if (m.error || out.error) setErr((m.error || out.error)!.message);
    const all = [...((m.data as ClientMessage[]) || []), ...(((out.data as ClientMessage[]) || []).filter((o) => !(m.data || []).some((x: ClientMessage) => x.id === o.id)))];
    setClients((c.data as Client[]) || []);
    setMsgs(all);
    setVersions((v.data as DailyReport[]) || []);
    setHistory((h.data as DailyReport[]) || []);
    setLoaded(true);
  }, [supabase, date, dayStart?.getTime(), dayEnd?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoaded(false);
    load();
  }, [load]);

  const periodStart = Math.min(dayStart?.getTime() ?? 0, prevEnd ?? Infinity);
  const periodEnd = dayEnd?.getTime() ?? 0;
  const built = useMemo(() => {
    const rm: RMessage[] = msgs.map((m) => ({ client_id: m.client_id, direction: m.direction, created_at: new Date(m.created_at).getTime(), sent_at: new Date(m.sent_at).getTime(), analysis: m.analysis }));
    return buildReport({ prettyDate: prettyDate(date), periodStart, periodEnd, clients, messages: rm });
  }, [msgs, clients, date, periodStart, periodEnd]);

  const latest = versions.length ? versions[versions.length - 1] : null;
  const isSent = latest?.status === "sent";
  const newestPaste = Math.max(0, ...msgs.filter((m) => m.direction === "incoming" && new Date(m.created_at).getTime() < periodEnd).map((m) => new Date(m.created_at).getTime()));
  const changed = isSent && latest ? reportChanged(latest, built.counts, newestPaste) : false;

  // The editor shows the saved draft, or the live preview when nothing is saved yet.
  useEffect(() => {
    if (!loaded) return;
    setText(latest ? latest.body : built.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, latest?.id, latest?.body, latest ? "" : built.body]);

  const rowFor = (body: string, extra: Partial<DailyReport>) => ({
    report_date: date,
    body,
    period_start: new Date(periodStart).toISOString(),
    period_end: new Date(periodEnd).toISOString(),
    client_count: built.counts.clients,
    replies_sent: built.counts.sent,
    replies_pending: built.counts.pending,
    michael_count: built.counts.michael,
    ...extra,
  });

  async function saveDraft() {
    setBusy(true); setErr(null); setNote(null);
    const edited = text !== built.body;
    const res = latest && !isSent
      ? await supabase.from("daily_reports").update({ body: text, edited }).eq("id", latest.id)
      : await supabase.from("daily_reports").insert(rowFor(text, { version: 1, status: "draft", edited }));
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    setNote("Draft saved.");
    await load();
  }

  async function rebuild() {
    if (latest && !isSent && latest.edited && !confirm("This replaces your edits with a fresh report from the latest messages. Continue?")) return;
    setBusy(true); setErr(null); setNote(null);
    const res = latest && !isSent
      ? await supabase.from("daily_reports").update(rowFor(built.body, { edited: false })).eq("id", latest.id)
      : await supabase.from("daily_reports").insert(rowFor(built.body, { version: 1, status: "draft", edited: false }));
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    await load();
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Paste it straight into WhatsApp.");
    } catch {
      setErr("Couldn't copy automatically. Select the text and copy it.");
    }
  }

  async function markSent() {
    setBusy(true); setErr(null); setNote(null);
    const now = new Date().toISOString();
    const edited = latest && !isSent ? text !== built.body || latest.edited : text !== built.body;
    const res = latest && !isSent
      ? await supabase.from("daily_reports").update({ body: text, edited, status: "sent", sent_at: now }).eq("id", latest.id)
      : await supabase.from("daily_reports").insert(rowFor(text, { version: 1, status: "sent", edited, sent_at: now }));
    if (res.error) {
      setBusy(false);
      return setErr(res.error.message);
    }
    const task = tasks.find((t) => t.kind === "daily_report" && t.ref_date === date);
    if (task && task.status !== "Done") await setTaskStatus(task, "Done");
    setBusy(false);
    setNote("Marked as sent.");
    await load();
  }

  async function createUpdate() {
    if (!latest) return;
    setBusy(true); setErr(null);
    const body = `UPDATED REPORT (replaces the version sent ${formatDateTime(latest.sent_at, tz)})\n\n${built.body}`;
    const res = await supabase.from("daily_reports").insert(rowFor(body, { version: latest.version + 1, status: "draft", edited: false, is_update: true }));
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    await load();
  }

  if (!dayStart) return <div className="banner error">That date isn&apos;t valid. <Link href="/">Back to the dashboard</Link></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily Client Report</h1>
          <p className="sub">{prettyDate(date)} · covers messages saved {formatDateTime(new Date(periodStart).toISOString(), tz)} to {formatDateTime(new Date(periodEnd).toISOString(), tz)}</p>
        </div>
        <div className="field">
          <label htmlFor="rd">Report date</label>
          <input id="rd" type="date" value={date} onChange={(e) => e.target.value && router.push(`/reports/${e.target.value}`)} />
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {note && <div className="banner" role="status">{note}</div>}
      {!loaded ? <p className="sub">Loading…</p> : (
        <div className="chatgrid">
          <section className="card">
            <div className="meta" style={{ marginBottom: 10 }}>
              {isSent ? <span className="chip ok">Sent {formatDateTime(latest!.sent_at, tz)}</span> : latest ? <span className="chip today">Draft saved</span> : <span className="chip">Not saved yet</span>}
              {latest && <span className="chip">Version {latest.version}{latest.is_update ? " (updated)" : ""}</span>}
              {latest?.edited && <span className="chip">Edited</span>}
            </div>
            {built.counts.unanalysed > 0 && !isSent && (
              <div className="banner error">{built.counts.unanalysed} client message{built.counts.unanalysed === 1 ? " hasn't" : "s haven't"} been analysed yet. Open that client&apos;s chat and press Retry, then rebuild the report.</div>
            )}
            {changed && (
              <div className="banner error">
                Messages or replies have changed since this report was sent. The sent version is kept as it is.{" "}
                <button className="btn primary" disabled={busy} onClick={createUpdate}>Create updated version</button>
              </div>
            )}
            <textarea aria-label="Report text" value={text} onChange={(e) => setText(e.target.value)} readOnly={isSent} rows={22} style={{ width: "100%", fontFamily: "inherit" }} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={copyAll}>Copy Entire Report</button>
              {!isSent && <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>}
              {!isSent && <button className="btn" disabled={busy} onClick={rebuild}>Rebuild from latest messages</button>}
              {!isSent && <button className="btn primary" disabled={busy} onClick={markSent}>Mark as Sent</button>}
            </div>
            <p className="sub" style={{ marginTop: 8 }}>Copying doesn&apos;t count as sending. Only &ldquo;Mark as Sent&rdquo; does.</p>
          </section>
          <aside style={{ display: "grid", gap: 16 }}>
            <section className="card">
              <div className="panel-title">This report</div>
              <div className="scores">
                <div className="score"><b>{built.counts.clients}</b><span>Clients</span></div>
                <div className="score"><b>{built.counts.sent}</b><span>Replied</span></div>
                <div className="score"><b>{built.counts.pending}</b><span>Pending</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>{built.counts.michael} need your personal response.</p>
            </section>
            {versions.length > 1 && (
              <section className="card">
                <div className="panel-title">Versions for this date</div>
                <ul className="list">{versions.map((v) => <li key={v.id} className="sub">v{v.version}: {v.status === "sent" ? `sent ${formatDateTime(v.sent_at, tz)}` : "draft"}{v.is_update ? " (update)" : ""}</li>)}</ul>
              </section>
            )}
            <section className="card">
              <div className="panel-title">Report history</div>
              {history.length === 0 ? <p className="sub">No saved reports yet.</p> : (
                <ul className="list">
                  {history.slice(0, 20).map((h) => (
                    <li key={h.id}><Link href={`/reports/${h.report_date}`} className="sub">{prettyDate(h.report_date)} · v{h.version} · {h.status === "sent" ? "sent" : "draft"}</Link></li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
