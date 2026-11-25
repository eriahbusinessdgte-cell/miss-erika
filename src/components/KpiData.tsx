"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateTime, todayInTz, weekdayOf, zonedToUtc, isWorkingDate, prettyDate } from "@/lib/core";
import { buildKpiReport, callsKpi, checkinKpi, igKpi, quietKpi, type Ctx } from "@/lib/kpi";
import type { Checkin, Client, IgCall, IgLead, KpiReportRow, QuietFlag, ReplyDraft } from "@/lib/types";

export function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

type RawMsg = { lead_id: string; direction: "incoming" | "outgoing"; sent_at: string };
type RawOut = { client_id: string; created_at: string };
type RawInc = { client_id: string; sent_at: string };

export function useKpi(weekStart: string) {
  const { settings } = useAppData();
  const supabase = useMemo(() => createClient(), []);
  const tz = settings?.timezone || "Asia/Manila";
  const inactiveDays = settings?.quiet_inactive_days ?? 14;
  const [raw, setRaw] = useState<{ leads: IgLead[]; msgs: RawMsg[]; clients: Client[]; outs: RawOut[]; inc: RawInc[]; drafts: ReplyDraft[]; checkins: Checkin[]; flags: QuietFlag[]; calls: IgCall[]; reports: KpiReportRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const q = await Promise.all([
      supabase.from("ig_leads").select("*"),
      supabase.from("ig_messages").select("lead_id,direction,sent_at"),
      supabase.from("clients").select("*"),
      supabase.from("client_messages").select("client_id,created_at").eq("direction", "outgoing"),
      supabase.from("client_messages").select("client_id,sent_at").eq("direction", "incoming"),
      supabase.from("reply_drafts").select("*").eq("kind", "checkin"),
      supabase.from("checkins").select("*").eq("week_start", weekStart),
      supabase.from("quiet_flags").select("*").eq("week_start", weekStart),
      supabase.from("ig_calls").select("*").order("call_at", { ascending: false }),
      supabase.from("kpi_reports").select("*").order("created_at", { ascending: false }),
    ]);
    const e = q.find((r) => r.error)?.error;
    if (e) setErr(e.message);
    const d = (i: number) => (q[i].data || []) as never[];
    setRaw({ leads: d(0), msgs: d(1), clients: d(2), outs: d(3), inc: d(4), drafts: d(5), checkins: d(6), flags: d(7), calls: d(8), reports: d(9) });
  }, [supabase, weekStart]);

  useEffect(() => { reload(); }, [reload]);

  const computed = useMemo(() => {
    if (!raw) return null;
    const ms = (s: string | null) => (s ? new Date(s).getTime() : null);
    const endOfDay = (day: string) => (zonedToUtc(`${addDays(day, 1)}T00:00`, tz)?.getTime() ?? 0) - 1;
    const ctx: Ctx = { dayOf: (t) => todayInTz(tz, new Date(t)), isWorking: isWorkingDate, nextDay: (d) => addDays(d, 1), endOfDay };
    const weekStartMs = zonedToUtc(`${weekStart}T00:00`, tz)?.getTime() ?? 0;
    const weekEndMs = endOfDay(addDays(weekStart, 6)) + 1;
    const fridayEnd = endOfDay(addDays(weekStart, 4));
    const mondayEnd = endOfDay(weekStart);
    const tuesdayEnd = endOfDay(addDays(weekStart, 1));
    const now = Date.now();
    const kClients = raw.clients.map((c) => ({ id: c.id, name: c.name, status: c.status, created_at: new Date(c.created_at).getTime(), last_message_at: ms(c.last_message_at), last_response_at: ms(c.last_response_at) }));
    const ig = igKpi({
      leads: raw.leads.map((l) => ({ id: l.id, name: l.name, handle: l.handle, source: l.source, created_at: new Date(l.created_at).getTime(), engaged_at: ms((l as IgLead & { engaged_at?: string | null }).engaged_at ?? null) })),
      messages: raw.msgs.map((m) => ({ lead_id: m.lead_id, direction: m.direction, sent_at: new Date(m.sent_at).getTime() })),
      weekStart: weekStartMs, weekEnd: weekEndMs, now, ctx,
    });
    const calls = callsKpi({
      calls: raw.calls.map((c) => ({ id: c.id, name: c.name, handle: c.handle, source: c.source, booked_on: c.booked_on, call_at: ms(c.call_at), status: c.status })),
      weekStart: weekStartMs, weekEnd: weekEndMs, fridayEnd, now,
    });
    const checkins = checkinKpi({
      clients: kClients,
      checkins: raw.checkins.map((c) => ({ client_id: c.client_id, mode: c.mode, created_at: new Date(c.created_at).getTime(), draft_id: c.draft_id })),
      drafts: raw.drafts.map((d) => ({ id: d.id, client_id: d.client_id, kind: d.kind, status: d.status, sent_at: ms(d.sent_at) })),
      outgoing: raw.outs.map((o) => ({ client_id: o.client_id, created_at: new Date(o.created_at).getTime() })),
      mondayDay: weekStart, mondayEnd, now, ctx,
    });
    const heard = (id: string) => raw.inc.filter((m) => m.client_id === id).map((m) => new Date(m.sent_at).getTime()).filter((t) => t <= mondayEnd).sort((x, y) => y - x)[0] ?? null;
    const heardAny = (id: string) => raw.inc.filter((m) => m.client_id === id).map((m) => new Date(m.sent_at).getTime()).filter((t) => t <= now).sort((x, y) => y - x)[0] ?? null;
    const quiet = quietKpi({
      clients: kClients.map((c) => ({ ...c, last_heard_by_monday: heard(c.id), last_heard_any: heardAny(c.id) })),
      flags: raw.flags.map((f) => ({ client_id: f.client_id, status: f.status, note: f.note, flagged_at: new Date(f.flagged_at).getTime(), resolved_at: ms(f.resolved_at) })),
      weekStart: weekStartMs, lookbackDays: inactiveDays, mondayEnd, tuesdayEnd, now,
    });
    const fmt = { date: (t: number) => formatDateTime(new Date(t).toISOString(), tz).split(",")[0], dateTime: (t: number) => formatDateTime(new Date(t).toISOString(), tz), day: (t: number) => todayInTz(tz, new Date(t)) };
    const weekLabel = `${prettyDate(weekStart)} to ${prettyDate(addDays(weekStart, 4))}`;
    const report = buildKpiReport({ weekLabel, ig, calls, checkins, quiet, fmt });
    return { ig, calls, checkins, quiet, report, weekLabel, tz, inactiveDays };
  }, [raw, weekStart, tz, inactiveDays]);

  return { raw, computed, err, reload, tz, supabase };
}

export function WeekPicker({ week, onChange }: { week: string; onChange: (w: string) => void }) {
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <button className="btn" onClick={() => onChange(addDays(week, -7))} aria-label="Previous week">←</button>
      <span><b>Week of {prettyDate(week)}</b></span>
      <button className="btn" onClick={() => onChange(addDays(week, 7))} aria-label="Next week">→</button>
    </div>
  );
}

export function KpiTabs() {
  const path = usePathname();
  const tabs = [["/kpis", "Overview & Friday report"], ["/kpis/calls", "Discovery calls"], ["/kpis/checkins", "Monday check-ins"], ["/kpis/quiet", "Quiet clients"]];
  return (
    <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }} role="tablist">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={`btn ${path === href ? "primary" : ""}`} role="tab" aria-selected={path === href}>{label}</Link>
      ))}
    </div>
  );
}

export function StatusChip({ s }: { s: string }) {
  const cls = s === "MET" ? "ok" : s === "NOT MET" ? "high" : s === "IN PROGRESS" || s === "COMPLETED LATE" ? "today" : "";
  return <span className={`chip ${cls}`}>{s}</span>;
}

export function useWeek() {
  const { settings, today } = useAppData();
  void settings;
  const [week, setWeek] = useState(mondayOf(today));
  return [week, setWeek] as const;
}
