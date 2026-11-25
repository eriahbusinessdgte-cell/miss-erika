"use client";

import Link from "next/link";
import { useState } from "react";
import { KpiTabs, StatusChip, WeekPicker, useKpi, useWeek } from "@/components/KpiData";
import { formatDateTime, utcToZonedInput, zonedToUtc } from "@/lib/core";
import { SOURCE_LABEL } from "@/lib/ig";
import { TARGET_CALLS } from "@/lib/kpi";
import type { IgCall } from "@/lib/types";

const STATUSES: IgCall["status"][] = ["Pending", "Attended", "Did Not Attend", "Cancelled"];
const EMPTY = { name: "", handle: "", source: "Commented “peace”", booked_on: "", call_at: "", notes: "" };

export default function CallTracker() {
  const [week, setWeek] = useWeek();
  const { raw, computed: k, err, reload, tz, supabase } = useKpi(week);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);

  async function insert(d: typeof EMPTY, lead_id: string | null) {
    setMsg(null);
    if (!d.name.trim()) return setMsg("Enter the lead's name.");
    const at = d.call_at ? zonedToUtc(d.call_at, tz) : null;
    if (d.call_at && !at) return setMsg("The call date and time isn't valid.");
    const { error } = await supabase.from("ig_calls").insert({ lead_id, name: d.name.trim(), handle: d.handle.trim().replace(/^@/, ""), source: d.source, booked_on: d.booked_on || null, call_at: at ? at.toISOString() : null, notes: d.notes });
    if (error) return setMsg(error.message);
    setF(EMPTY);
    await reload();
  }
  async function update(c: IgCall, p: Partial<IgCall>) {
    const { error } = await supabase.from("ig_calls").update(p).eq("id", c.id);
    if (error) setMsg(error.message);
    await reload();
  }
  async function remove(c: IgCall) {
    if (!confirm(`Delete the call record for ${c.name}?`)) return;
    await supabase.from("ig_calls").delete().eq("id", c.id);
    await reload();
  }

  const tracked = new Set((raw?.calls || []).map((c) => c.lead_id).filter(Boolean));
  const untracked = (raw?.leads || []).filter((l) => l.link_sent_at && !tracked.has(l.id));

  return (
    <>
      <div className="page-head">
        <div><h1>Discovery calls</h1><p className="sub">A booked call does not count. Only calls you mark Attended count towards the weekly target of {TARGET_CALLS}.</p></div>
        <WeekPicker week={week} onChange={setWeek} />
      </div>
      <KpiTabs />
      {(err || msg) && <div className="banner error" role="alert">{err || msg}</div>}
      {k && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>This week</h2><StatusChip s={k.calls.status} /></div>
          <div className="scores">
            <div className="score"><b>{k.calls.attendedCount} / {TARGET_CALLS}</b><span>Attended</span></div>
            <div className="score"><b>{k.calls.pendingCount}</b><span>Pending</span></div>
            <div className="score"><b>{k.calls.didNotAttend + k.calls.cancelled}</b><span>No-show / cancelled</span></div>
          </div>
        </section>
      )}

      {untracked.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>Call link sent, not in the tracker yet</h2></div>
          <ul className="list">
            {untracked.map((l) => (
              <li key={l.id} className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <Link href={`/instagram/${l.id}`}>{l.name}{l.handle ? ` (@${l.handle})` : ""}</Link>
                <button className="btn" onClick={() => insert({ ...EMPTY, name: l.name, handle: l.handle, source: SOURCE_LABEL[l.source] }, l.id)}>Add to tracker</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>Add a call</h2></div>
        <form onSubmit={(e) => { e.preventDefault(); insert(f, null); }} className="two" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="c-name">Name</label><input id="c-name" type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-handle">Instagram username</label><input id="c-handle" type="text" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-source">Lead source</label>
            <select id="c-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.values(SOURCE_LABEL).map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label htmlFor="c-booked">Booking date</label><input id="c-booked" type="date" value={f.booked_on} onChange={(e) => setF({ ...f, booked_on: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-at">Call date and time ({tz})</label><input id="c-at" type="datetime-local" value={f.call_at} onChange={(e) => setF({ ...f, call_at: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-notes">Notes</label><input id="c-notes" type="text" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div><button className="btn primary" type="submit">Add call (status: Pending)</button></div>
        </form>
      </section>

      <section className="card">
        <div className="card-head"><h2>All calls</h2></div>
        {!raw || raw.calls.length === 0 ? <p className="empty">No calls recorded yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Instagram</th><th>Source</th><th>Booked</th><th>Call</th><th>Attendance</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {raw.calls.map((c) => (
                  <tr key={c.id}>
                    <td>{c.lead_id ? <Link href={`/instagram/${c.lead_id}`}>{c.name}</Link> : c.name}</td>
                    <td>{c.handle ? `@${c.handle}` : ""}</td>
                    <td>{c.source}</td>
                    <td>{c.booked_on || ""}</td>
                    <td><input type="datetime-local" aria-label={`Call time for ${c.name}`} value={c.call_at ? utcToZonedInput(c.call_at, tz) : ""} onChange={(e) => { const at = zonedToUtc(e.target.value, tz); if (at) update(c, { call_at: at.toISOString() }); }} />
                      {c.call_at && <span className="sub" style={{ display: "block", fontSize: 12 }}>{formatDateTime(c.call_at, tz)}</span>}</td>
                    <td><select aria-label={`Attendance for ${c.name}`} value={c.status} onChange={(e) => update(c, { status: e.target.value as IgCall["status"] })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td><input type="text" aria-label={`Notes for ${c.name}`} defaultValue={c.notes} onBlur={(e) => e.target.value !== c.notes && update(c, { notes: e.target.value })} /></td>
                    <td><button className="btn" onClick={() => remove(c)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
