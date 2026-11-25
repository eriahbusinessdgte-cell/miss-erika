"use client";

import Link from "next/link";
import { useState } from "react";
import { KpiTabs, StatusChip, WeekPicker, useKpi, useWeek } from "@/components/KpiData";
import { formatDateTime, prettyDate } from "@/lib/core";
import { TARGET_CALLS } from "@/lib/kpi";

export default function KpiOverview() {
  const [week, setWeek] = useWeek();
  const { raw, computed: k, err, reload, tz, supabase } = useKpi(week);
  const [note, setNote] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNote("Copied. Paste it straight into WhatsApp."); } catch { setMsg("Couldn't copy automatically. Select the text and copy it."); }
  }
  async function save() {
    if (!raw || !k) return;
    setMsg(null); setNote(null);
    const version = Math.max(0, ...raw.reports.filter((r) => r.week_start === week).map((r) => r.version)) + 1;
    const { error } = await supabase.from("kpi_reports").insert({ week_start: week, version, body: k.report, snapshot: { ig: { total: k.ig.total, onTime: k.ig.onTime, pending: k.ig.pending, overdue: k.ig.overdue, late: k.ig.late }, calls: k.calls.attendedCount, checkins: { done: k.checkins.completed, total: k.checkins.total }, quiet: { identified: k.quiet.identified, flagged: k.quiet.flagged } } });
    if (error) return setMsg(error.message);
    setNote(`Saved to history as version ${version}.`);
    await reload();
  }

  return (
    <>
      <div className="page-head">
        <div><h1>KPIs &amp; Weekly Reports</h1><p className="sub">Calculated from your Telegram and Instagram records. Nothing here is typed in by hand.</p></div>
        <WeekPicker week={week} onChange={setWeek} />
      </div>
      <KpiTabs />
      {(err || msg) && <div className="banner error" role="alert">{err || msg}</div>}
      {note && <div className="banner" role="status">{note}</div>}
      {!k ? <p className="sub">Loading…</p> : (
        <>
          <div className="grid">
            <section className="card">
              <div className="card-head"><h2>1. Instagram messages answered</h2><StatusChip s={k.ig.status} /></div>
              <div className="scores">
                <div className="score"><b>{k.ig.pct === null ? "–" : `${k.ig.pct}%`}</b><span>Same working day (target 100%)</span></div>
                <div className="score"><b>{k.ig.pending}</b><span>Pending</span></div>
                <div className="score"><b>{k.ig.overdue + k.ig.late}</b><span>Overdue / late</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>{k.ig.onTime} of {k.ig.total} answered on time. A reply only counts once it is marked as Sent.</p>
              {k.ig.items.filter((i) => i.state !== "on time").length > 0 && (
                <ul className="list" style={{ marginTop: 8 }}>
                  {k.ig.items.filter((i) => i.state !== "on time").slice(0, 8).map((i, n) => (
                    <li key={n}><Link href={`/instagram/${i.leadId}`} className="sub">{i.name} · {i.kind} · {i.state}</Link></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <div className="card-head"><h2>2. Discovery calls attended</h2><StatusChip s={k.calls.status} /></div>
              <div className="scores">
                <div className="score"><b>{k.calls.attendedCount} / {TARGET_CALLS}</b><span>Attended (target {TARGET_CALLS})</span></div>
                <div className="score"><b>{k.calls.pendingCount}</b><span>Awaiting confirmation</span></div>
                <div className="score"><b>{k.calls.booked}</b><span>Booked this week</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>Booked calls don&apos;t count until you confirm attendance. <Link href="/kpis/calls">Open the call tracker</Link></p>
            </section>
            <section className="card">
              <div className="card-head"><h2>3. Monday client check-ins</h2><StatusChip s={k.checkins.status} /></div>
              <div className="scores">
                <div className="score"><b>{k.checkins.completed} / {k.checkins.total}</b><span>Checked in (target all)</span></div>
                <div className="score"><b>{k.checkins.onMonday}</b><span>On Monday</span></div>
                <div className="score"><b>{k.checkins.notStarted}</b><span>Not started</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>Only check-ins marked Sent count. <Link href="/kpis/checkins">Open Monday check-ins</Link></p>
            </section>
            <section className="card">
              <div className="card-head"><h2>4. Quiet clients flagged by Tuesday</h2><StatusChip s={k.quiet.status} /></div>
              <div className="scores">
                <div className="score"><b>{k.quiet.identified}</b><span>Identified</span></div>
                <div className="score"><b>{k.quiet.flagged + k.quiet.dismissed}</b><span>Reviewed on time</span></div>
                <div className="score"><b>{k.quiet.outstanding}</b><span>Not yet reviewed</span></div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>Quiet = an active client who hasn't messaged since Tuesday of the previous week (adjust in Settings). <Link href="/kpis/quiet">Open quiet clients</Link></p>
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><h2>Friday KPI report</h2></div>
            <p className="sub">{k.weekLabel}. Built from the records above only. Save it to keep it in history.</p>
            <textarea aria-label="KPI report" readOnly rows={22} style={{ width: "100%", fontFamily: "inherit", marginTop: 8 }} value={k.report} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => copy(k.report)}>Copy Entire Report</button>
              <button className="btn" onClick={save}>Save to history</button>
            </div>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><h2>Previous weekly reports</h2></div>
            {raw!.reports.length === 0 ? <p className="empty">No saved reports yet.</p> : (
              <ul className="list">
                {raw!.reports.map((r) => (
                  <li key={r.id}>
                    <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <span>Week of {prettyDate(r.week_start)} · version {r.version} · saved {formatDateTime(r.created_at, tz)}</span>
                      <span className="row">
                        <button className="btn" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? "Hide" : "View"}</button>
                        <button className="btn" onClick={() => copy(r.body)}>Copy</button>
                      </span>
                    </div>
                    {openId === r.id && <pre style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 12, borderRadius: 10, marginTop: 8, font: "inherit" }}>{r.body}</pre>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
