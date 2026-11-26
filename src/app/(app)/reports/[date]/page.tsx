"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateTime, prettyDate, todayInTz, weekdayOf, zonedToUtc } from "@/lib/core";
import { buildReport, type RMessage } from "@/lib/report";
import { enqueueAnalysis, TELEGRAM } from "@/lib/analysisQueue";
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
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [flagOffer, setFlagOffer] = useState<{ id: string; name: string }[]>([]);

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
    // The report covers every chat currently marked unread, not just messages saved today.
    const pv = await supabase.rpc("client_previews");
    if (pv.error) setErr(pv.error.message);
    const unreadNow = ((pv.data as { client_id: string; unread: boolean }[]) || []).filter((r) => r.unread).map((r) => r.client_id);
    // Opening a chat marks it read, so also keep every chat that got a new client message since the last sent report.
    const cutoffIso = new Date(start ?? (dayStart.getTime() - 86400000)).toISOString();
    const fresh = await supabase.from("client_messages").select("client_id").eq("direction", "incoming").gt("sent_at", cutoffIso);
    if (fresh.error) setErr(fresh.error.message);
    const ids = Array.from(new Set([...unreadNow, ...(((fresh.data as { client_id: string }[]) || []).map((r) => r.client_id))]));
    let all: ClientMessage[] = [];
    if (ids.length > 0) {
      const m = await supabase.from("client_messages").select("*").in("client_id", ids);
      if (m.error) setErr(m.error.message);
      all = (m.data as ClientMessage[]) || [];
    }
    setUnreadIds(ids);
    const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
    const fl = await supabase.from("quiet_flags").select("client_id,status").eq("week_start", monday);
    setDismissed(((fl.data as { client_id: string; status: string }[]) || []).filter((f) => f.status === "dismissed").map((f) => f.client_id));
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
  // On Monday and Tuesday the report also lists active clients we haven't heard from since Tuesday of the previous week.
  const quietList = useMemo(() => {
    const dow = weekdayOf(date);
    const monday = addDays(date, -((dow + 6) % 7));
    const isLiveWeek = monday === addDays(todayInTz(tz), -((weekdayOf(todayInTz(tz)) + 6) % 7));
    if ((dow !== 1 && dow !== 2) || !isLiveWeek) return undefined;
    const days = settings?.quiet_inactive_days ?? 6;
    const since = addDays(monday, -days);
    const cutoff = zonedToUtc(`${since}T00:00`, tz)?.getTime() ?? 0;
    const list = clients
      .filter((c) => c.status === "Active" && !dismissed.includes(c.id))
      .filter((c) => (c.last_message_at ? new Date(c.last_message_at).getTime() : new Date(c.created_at).getTime()) < cutoff)
      .map((c) => ({ id: c.id, name: c.name, lastHeard: c.last_message_at ? formatDateTime(c.last_message_at, tz).split(",")[0] : "none yet" }));
    return { since: prettyDate(since), list };
  }, [date, tz, clients, dismissed, settings?.quiet_inactive_days]);

  const built = useMemo(() => {
    const rm: RMessage[] = msgs.map((m) => ({ client_id: m.client_id, direction: m.direction, created_at: new Date(m.created_at).getTime(), sent_at: new Date(m.sent_at).getTime(), analysis: m.analysis }));
    return buildReport({ prettyDate: prettyDate(date), periodStart, periodEnd, clients, messages: rm, unreadIds, quiet: quietList ? { since: quietList.since, clients: quietList.list } : undefined });
  }, [msgs, clients, date, periodStart, periodEnd, quietList, unreadIds]);

  const latest = versions.length ? versions[versions.length - 1] : null;
  const isSent = latest?.status === "sent";
  // A sent report is a record of what was unread when it went out, so later reading or new messages never change it.
  // Messages brought in from Telegram have no analysis yet. Find each unread chat's latest incoming message that needs one.
  const toAnalyse = useMemo(() => {
    const out: { client_id: string; id: string }[] = [];
    for (const cid of unreadIds) {
      const inc = msgs.filter((m) => m.client_id === cid && m.direction === "incoming").sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
      if (inc && !inc.analysis) out.push({ client_id: cid, id: inc.id });
    }
    return out;
  }, [msgs, unreadIds]);
  const [analysing, setAnalysing] = useState(false);
  const autoTried = useRef(false);
  const alreadySent = versions.length > 0 && versions[versions.length - 1].status === "sent";
  const analyseAll = useCallback(async () => {
    setAnalysing(true);
    for (const t of toAnalyse) await enqueueAnalysis(t.client_id, TELEGRAM, t.id);
    await load();
    setAnalysing(false);
  }, [toAnalyse, load]);
  useEffect(() => {
    if (!loaded || alreadySent || autoTried.current || toAnalyse.length === 0) return;
    autoTried.current = true;
    void analyseAll();
  }, [loaded, alreadySent, toAnalyse, analyseAll]);

  const shown = isSent && latest ? { clients: latest.client_count, sent: latest.replies_sent, pending: latest.replies_pending, michael: latest.michael_count, unanalysed: 0 } : built.counts;

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
    if (latest && !isSent && latest.edited && !confirm("This replaces your edits with a fresh report from the chats marked unread. Continue?")) return;
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
    if (quietList && quietList.list.length) {
      const names = quietList.list.filter((q) => text.includes(q.name));
      setFlagOffer(names.map((q) => ({ id: q.id, name: q.name })));
    }
    await load();
  }

  async function flagListed() {
    setBusy(true);
    const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
    const { data: have } = await supabase.from("quiet_flags").select("client_id").eq("week_start", monday);
    const done = new Set(((have as { client_id: string }[]) || []).map((f) => f.client_id));
    for (const q of flagOffer) {
      if (done.has(q.id)) continue;
      await supabase.from("quiet_flags").insert({ client_id: q.id, week_start: monday, status: "flagged", note: `Listed in the daily report sent ${prettyDate(date)}` });
    }
    setBusy(false);
    setFlagOffer([]);
    setNote("Quiet clients flagged to Michael.");
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
          <p className="sub">{prettyDate(date)} · covers every chat marked unread, plus any chat with a new client message since the last sent report{isSent ? " when it was sent" : ` (${unreadIds.length} right now)`}</p>
        </div>
        <div className="field">
          <label htmlFor="rd">Report date</label>
          <input id="rd" type="date" value={date} onChange={(e) => e.target.value && router.push(`/reports/${e.target.value}`)} />
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {note && <div className="banner" role="status">{note}</div>}
      {flagOffer.length > 0 && (
        <div className="banner">
          This report listed {flagOffer.length} quiet client{flagOffer.length === 1 ? "" : "s"} ({flagOffer.map((q) => q.name).join(", ")}). Record them as flagged to Michael?{" "}
          <button className="btn primary" disabled={busy} onClick={flagListed}>Yes, flag them</button>{" "}
          <button className="btn" onClick={() => setFlagOffer([])}>Not now</button>
        </div>
      )}
      {!loaded ? <p className="sub">Loading…</p> : (
        <div className="chatgrid">
          <section className="card">
            <div className="meta" style={{ marginBottom: 10 }}>
              {isSent ? <span className="chip ok">Sent {formatDateTime(latest!.sent_at, tz)}</span> : latest ? <span className="chip today">Draft saved</span> : <span className="chip">Not saved yet</span>}
              {latest && <span className="chip">Version {latest.version}{latest.is_update ? " (updated)" : ""}</span>}
              {latest?.edited && <span className="chip">Edited</span>}
            </div>
            {built.counts.unanalysed > 0 && !isSent && (
              <div className="banner error">{built.counts.unanalysed} client message{built.counts.unanalysed === 1 ? " hasn't" : "s haven't"} been analysed yet. {analysing ? "Analysing them now, this takes a moment…" : <>Press <button className="btn" onClick={() => void analyseAll()}>Analyse them now</button> (or open that client&apos;s chat and press Retry).</>}</div>
            )}
            {isSent && (
              <div className="banner">
                This report was sent and is kept as it is. If something changed since, you can write a new version.{" "}
                <button className="btn" disabled={busy} onClick={createUpdate}>Create updated version</button>
              </div>
            )}
            <textarea aria-label="Report text" value={text} onChange={(e) => setText(e.target.value)} readOnly={isSent} rows={22} style={{ width: "100%", fontFamily: "inherit" }} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={copyAll}>Copy Entire Report</button>
              {!isSent && <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>}
              {!isSent && <button className="btn" disabled={busy} onClick={rebuild}>Rebuild from unread chats</button>}
              {!isSent && <button className="btn primary" disabled={busy} onClick={markSent}>Mark as Sent</button>}
            </div>
            <p className="sub" style={{ marginTop: 8 }}>Copying doesn&apos;t count as sending. Only &ldquo;Mark as Sent&rdquo; does.</p>
          </section>
          <aside style={{ display: "grid", gap: 16 }}>
            <section className="card">
              <div className="panel-title">This report</div>
              <div className="scores">
                <div className="score"><b>{shown.clients}</b><span>Clients</span></div>
                <div className="score"><b>{shown.sent}</b><span>Replied</span></div>
                <div className="score"><b>{shown.pending}</b><span>Pending</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>{shown.michael} need your personal response.</p>
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
