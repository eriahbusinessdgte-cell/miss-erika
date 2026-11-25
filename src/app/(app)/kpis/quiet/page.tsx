"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KpiTabs, StatusChip, WeekPicker, useKpi, useWeek } from "@/components/KpiData";
import { formatDateTime, prettyDate } from "@/lib/core";
import type { QuietRow } from "@/lib/kpi";
import type { QuietFlag } from "@/lib/types";

type Hist = { client_id: string; direction: string; sender: string; body: string; sent_at: string };

export default function QuietClients() {
  const [week, setWeek] = useWeek();
  const { raw, computed: k, err, reload, tz, supabase } = useKpi(week);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Hist[]>([]);
  const [open, setOpen] = useState<QuietFlag[]>([]);

  const ids = k ? [...k.quiet.rows, ...k.quiet.later].map((r) => r.clientId) : [];
  const idKey = ids.join(",");
  useEffect(() => {
    if (!idKey) { setHist([]); return; }
    supabase.from("client_messages").select("client_id,direction,sender,body,sent_at").in("client_id", idKey.split(",")).order("sent_at", { ascending: false }).then(({ data }) => setHist((data as Hist[]) || []));
  }, [idKey, supabase]);

  const loadOpen = async () => {
    const { data } = await supabase.from("quiet_flags").select("*").eq("status", "flagged");
    setOpen(((data as QuietFlag[]) || []).filter((f) => !f.resolved_at));
  };
  useEffect(() => { loadOpen(); }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(r: QuietRow, status: "flagged" | "dismissed") {
    setMsg(null);
    const note = (notes[r.clientId] || "").trim();
    if (status === "dismissed" && !note) return setMsg("Add a short reason for not flagging this client (for example, they said they're away).");
    const existing = raw?.flags.find((f) => f.client_id === r.clientId);
    const row = { status, note, flagged_at: new Date().toISOString(), resolved_at: null };
    const { error } = existing ? await supabase.from("quiet_flags").update(row).eq("id", existing.id) : await supabase.from("quiet_flags").insert({ client_id: r.clientId, week_start: week, ...row });
    if (error) return setMsg(error.message);
    await reload();
  }
  async function undo(r: QuietRow) {
    const existing = raw?.flags.find((f) => f.client_id === r.clientId);
    if (existing) await supabase.from("quiet_flags").delete().eq("id", existing.id);
    await reload();
  }
  async function resolve(f: QuietFlag) {
    await supabase.from("quiet_flags").update({ resolved_at: new Date().toISOString() }).eq("id", f.id);
    await reload(); await loadOpen();
  }

  const nameOf = (id: string) => raw?.clients.find((c) => c.id === id)?.name || "Client";
  const card = (r: QuietRow, later = false) => {
    const c = raw?.clients.find((x) => x.id === r.clientId);
    const recent = hist.filter((h) => h.client_id === r.clientId).slice(0, 3);
    return (
      <li key={r.clientId} style={{ padding: "12px 0" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
          <Link href={`/telegram/${r.clientId}`} className="task-title">{r.name}</Link>
          <span className={`chip ${r.state === "flagged" ? "ok" : r.state === "needs review" ? "high" : "today"}`}>{later ? "Quiet after Tuesday" : r.state === "flagged late" ? "Flagged after Tuesday" : r.state}</span>
        </div>
        <div className="scores" style={{ margin: "8px 0" }}>
          <div className="score"><b>{r.daysSince}</b><span>Days since contact</span></div>
          <div className="score"><b style={{ fontSize: 14 }}>{r.lastMessageMs ? formatDateTime(new Date(r.lastMessageMs).toISOString(), tz) : "Never"}</b><span>Last message</span></div>
          <div className="score"><b style={{ fontSize: 14 }}>{r.lastResponseMs ? formatDateTime(new Date(r.lastResponseMs).toISOString(), tz) : "Never"}</b><span>Last response</span></div>
        </div>
        <p className="sub" style={{ marginBottom: 6 }}>Last contact: {formatDateTime(new Date(r.lastContactMs).toISOString(), tz)}.{c?.summary ? ` Latest summary: ${c.summary}` : ""}</p>
        {recent.length > 0 && (
          <ul className="sub" style={{ margin: "0 0 8px 16px", fontSize: 13 }}>
            {recent.map((h, i) => <li key={i}>{h.direction === "incoming" ? "Client" : h.sender === "michael" ? "Michael" : "Erika"} ({formatDateTime(h.sent_at, tz)}): {h.body.slice(0, 140)}{h.body.length > 140 ? "…" : ""}</li>)}
          </ul>
        )}
        <p className="sub" style={{ marginBottom: 6 }}>Read the history before deciding. A quiet client might be away or finished a programme.</p>
        {r.flag ? (
          <div className="row" style={{ alignItems: "center" }}>
            <span className="sub">{r.flag.status === "flagged" ? "Flagged to Michael" : "Reviewed, not flagged"} {formatDateTime(new Date(r.flag.flagged_at).toISOString(), tz)}{r.flag.note ? `: ${r.flag.note}` : ""}</span>
            <button className="btn" onClick={() => undo(r)}>Undo</button>
          </div>
        ) : (
          <div className="row" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <input type="text" aria-label={`Note for ${r.name}`} placeholder="Note for Michael, or reason for not flagging" style={{ flex: 1, minWidth: 220 }} value={notes[r.clientId] || ""} onChange={(e) => setNotes({ ...notes, [r.clientId]: e.target.value })} />
            <button className="btn primary" onClick={() => decide(r, "flagged")}>Flag to Michael</button>
            <button className="btn" onClick={() => decide(r, "dismissed")}>Not quiet, don&apos;t flag</button>
          </div>
        )}
      </li>
    );
  };

  const tgMichael = (raw?.clients || []).filter((c) => c.needs_michael);
  const igMichael = (raw?.leads || []).filter((l) => l.needs_michael);

  return (
    <>
      <div className="page-head">
        <div><h1>Quiet clients</h1><p className="sub">Clients with no contact for {k?.inactiveDays ?? 14} days are listed for you to review. Nothing is flagged until you decide, after reading their history.</p></div>
        <WeekPicker week={week} onChange={setWeek} />
      </div>
      <KpiTabs />
      {(err || msg) && <div className="banner error" role="alert">{err || msg}</div>}
      {k && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>Week of {prettyDate(week)}</h2><StatusChip s={k.quiet.status} /></div>
          <p className="sub">Target: every quiet client reviewed and flagged to Michael by the end of Tuesday.</p>
          {k.quiet.rows.length === 0 ? <p className="empty">No quiet clients to review.</p> : <ul className="list">{k.quiet.rows.map((r) => card(r))}</ul>}
          {k.quiet.later.length > 0 && (<><h3 style={{ margin: "14px 0 4px" }}>Became quiet after Tuesday (review next week)</h3><ul className="list">{k.quiet.later.map((r) => card(r, true))}</ul></>)}
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Michael Action Required</h2><span className="count">{open.length + tgMichael.length + igMichael.length}</span></div>
        {open.length + tgMichael.length + igMichael.length === 0 ? <p className="empty">Nothing is waiting for Michael.</p> : (
          <ul className="list">
            {open.map((f) => (
              <li key={f.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span><Link href={`/telegram/${f.client_id}`}>{nameOf(f.client_id)}</Link> <span className="chip">Quiet client</span> <span className="sub">flagged {formatDateTime(f.flagged_at, tz)}{f.note ? `: ${f.note}` : ""}</span></span>
                <button className="btn" onClick={() => resolve(f)}>Michael responded</button>
              </li>
            ))}
            {tgMichael.map((c) => <li key={c.id}><Link href={`/telegram/${c.id}`}>{c.name}</Link> <span className="chip">Telegram</span> <span className="sub">{c.michael_reason}</span></li>)}
            {igMichael.map((l) => <li key={l.id}><Link href={`/instagram/${l.id}`}>{l.name}</Link> <span className="chip">Instagram</span> <span className="sub">{l.michael_reason}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
