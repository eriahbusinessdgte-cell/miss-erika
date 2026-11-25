"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppData } from "@/components/AppData";
import { KpiTabs, StatusChip, WeekPicker, mondayOf, useKpi, useWeek } from "@/components/KpiData";
import { CHECKIN, TELEGRAM, enqueueAnalysis, useAnalysisState } from "@/lib/analysisQueue";
import { formatDateTime, prettyDate } from "@/lib/core";
import type { CheckinRow } from "@/lib/kpi";

function Row({ r, hasDraft, onRetry, time }: { r: CheckinRow; hasDraft: boolean; onRetry: () => void; time: string }) {
  const state = useAnalysisState(r.clientId, r.mode === "acknowledgement" ? TELEGRAM : CHECKIN);
  const cls = r.state === "sent" ? "ok" : r.state === "sent late" ? "today" : r.state === "not started" ? "" : "today";
  return (
    <li>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span>
          <Link href={`/telegram/${r.clientId}`} className="task-title">{r.name}</Link>
          <span className="meta">
            <span className={`chip ${cls}`}>{r.state === "draft" ? (hasDraft || r.mode === "acknowledgement" ? "Draft" : "Writing…") : r.state === "not started" ? "Not started" : r.state === "copied" ? "Copied, not sent" : r.state === "sent" ? "Sent" : "Sent late"}</span>
            {r.mode === "acknowledgement" && <span className="chip high">Unanswered message: acknowledgement instead of a check-in</span>}
            {r.completedMs && <span className="sub">{time}</span>}
          </span>
        </span>
        <span className="row">
          {state !== "idle" && <span className="sub">Writing…</span>}
          {r.state === "draft" && !hasDraft && r.mode === "checkin" && state === "idle" && <button className="btn" onClick={onRetry}>Retry</button>}
          {r.state !== "not started" && r.state !== "sent" && r.state !== "sent late" && <Link className="btn primary" href={`/telegram/${r.clientId}`}>Open draft</Link>}
        </span>
      </div>
    </li>
  );
}

export default function MondayCheckins() {
  const { today, settings } = useAppData();
  const [week, setWeek] = useWeek();
  const { raw, computed: k, err, reload, tz, supabase } = useKpi(week);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCurrent = mondayOf(today) === week;
  void settings;

  // Check-in drafts are written one at a time in the background; refresh while any are still being written.
  const waiting = !!k && k.checkins.rows.some((r) => r.state === "draft" && r.mode === "checkin" && !(raw?.drafts || []).some((d) => d.client_id === r.clientId && (d.status === "draft" || d.status === "copied")));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [waiting, reload]);

  async function prepare() {
    if (!raw || !k) return;
    setBusy(true); setMsg(null);
    const todo = raw.clients.filter((c) => c.status === "Active" && !raw.checkins.some((x) => x.client_id === c.id));
    if (todo.length === 0) { setBusy(false); return setMsg("Every active client already has a check-in for this week."); }
    const { data: open } = await supabase.from("reply_drafts").select("client_id,kind,status").in("status", ["draft", "copied"]);
    for (const c of todo) {
      // A client with an unanswered message gets an acknowledgement, never a general check-in.
      const mode = c.needs_reply ? "acknowledgement" : "checkin";
      const { error } = await supabase.from("checkins").insert({ client_id: c.id, week_start: week, mode });
      if (error) { setMsg(error.message); continue; }
      if (mode === "acknowledgement") {
        if (!(open || []).some((d: { client_id: string; kind: string }) => d.client_id === c.id && d.kind === "reply")) enqueueAnalysis(c.id, TELEGRAM);
      } else enqueueAnalysis(c.id, CHECKIN);
    }
    setBusy(false);
    await reload();
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Monday client check-ins</h1><p className="sub">Every active client is checked in with individually. A check-in only counts once you mark it as Sent in that client&apos;s chat. Copying doesn&apos;t count.</p></div>
        <WeekPicker week={week} onChange={setWeek} />
      </div>
      <KpiTabs />
      {(err || msg) && <div className="banner error" role="alert">{err || msg}</div>}
      {!k ? <p className="sub">Loading…</p> : (
        <section className="card">
          <div className="card-head"><h2>Week of {prettyDate(week)}</h2><StatusChip s={k.checkins.status} /></div>
          <div className="scores">
            <div className="score"><b>{k.checkins.completed} / {k.checkins.total}</b><span>Checked in</span></div>
            <div className="score"><b>{k.checkins.onMonday}</b><span>On Monday</span></div>
            <div className="score"><b>{k.checkins.notStarted}</b><span>Not started</span></div>
          </div>
          <div className="row" style={{ margin: "12px 0" }}>
            <button className="btn primary" onClick={prepare} disabled={busy || !isCurrent || k.checkins.notStarted === 0}>Prepare check-ins for every active client</button>
            {!isCurrent && <span className="sub">Drafts can only be prepared for the current week.</span>}
          </div>
          {k.checkins.rows.length === 0 ? <p className="empty">No active clients yet.</p> : (
            <ul className="list">
              {k.checkins.rows.map((r) => (
                <Row key={r.clientId} r={r} time={r.completedMs ? formatDateTime(new Date(r.completedMs).toISOString(), tz) : ""}
                  hasDraft={(raw?.drafts || []).some((d) => d.client_id === r.clientId && (d.status === "draft" || d.status === "copied"))}
                  onRetry={() => enqueueAnalysis(r.clientId, CHECKIN)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
