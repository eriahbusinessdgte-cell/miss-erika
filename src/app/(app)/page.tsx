"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { TaskForm, TaskRow } from "@/components/TaskParts";
import { HotSeatCard } from "@/components/HotSeatCard";
import type { Task } from "@/lib/types";
import { followupState } from "@/lib/ig";
import { bucketOf, compareTasks, greetingFor, prettyDate, weekdayOf } from "@/lib/core";

/** Current time in the chosen time zone, refreshed every 20 seconds. Empty on first paint to avoid a server/browser mismatch. */
function Clock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  let text = "";
  try {
    text = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now);
  } catch {
    return null;
  }
  return <> · {text}</>;
}

function Soon({ title, icon, stage, text }: { title: string; icon: string; stage: string; text: string }) {
  return (
    <section className="card">
      <div className="card-head"><h2><Icon name={icon} /> {title}</h2></div>
      <p className="stage"><strong>{stage}.</strong> {text}</p>
    </section>
  );
}

function ClientList({ title, icon, empty, list }: { title: string; icon: string; empty: string; list: { id: string; name: string; sub: string; urgency: string | null; href?: string }[] }) {
  return (
    <section className="card">
      <div className="card-head"><h2><Icon name={icon} /> {title}</h2><span className="count">{list.length}</span></div>
      {list.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="list">
          {list.slice(0, 8).map((c) => (
            <li key={c.id}>
              <Link href={c.href || `/telegram/${c.id}`} className="client-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span><span className="task-title">{c.name}</span><span className="task-desc" style={{ display: "block" }}>{c.sub}</span></span>
                {c.urgency && <span className={`chip ${c.urgency === "URGENT" ? "high" : c.urgency === "MEDIUM PRIORITY" ? "today" : "ok"}`}>{c.urgency}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function Dashboard() {
  const { settings, tasks, clients, leads: allLeads, today } = useAppData();
  const leads = allLeads.filter((l) => !l.archived);
  const [quietOpen, setQuietOpen] = useState<{ id: string; client_id: string; note: string }[]>([]);
  useEffect(() => {
    createClient().from("quiet_flags").select("id,client_id,note,status,resolved_at").eq("status", "flagged").then(({ data }) => setQuietOpen(((data as { id: string; client_id: string; note: string; resolved_at: string | null }[]) || []).filter((f) => !f.resolved_at)));
  }, [clients]);
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  if (!settings) return null;

  const rank = (t: Task) => (t.kind === "daily_paste" ? 0 : t.kind === "daily_report" ? 1 : 2);
  const open = tasks.filter((t) => t.status !== "Done");
  const todays = open
    .filter((t) => bucketOf(t, today) === "today")
    .sort((a, b) => rank(a) - rank(b) || compareTasks(a, b));
  const doneTodayTasks = tasks.filter((t) => t.status === "Done" && t.due_date === today).sort((a, b) => rank(a) - rank(b));
  const overdue = open.filter((t) => bucketOf(t, today) === "overdue").sort(compareTasks);
  const upcoming = open.filter((t) => bucketOf(t, today) === "upcoming").length;

  const paste = tasks.find((t) => t.kind === "daily_paste" && t.ref_date === today);
  const report = tasks.find((t) => t.kind === "daily_report" && t.ref_date === today);
  const manager = settings.manager_name.split(" ")[0];

  const total = todays.length + doneTodayTasks.length;
  const pct = total === 0 ? 0 : Math.round((doneTodayTasks.length / total) * 100);
  const circ = 2 * Math.PI * 62;
  const otherToday = [...todays, ...doneTodayTasks].filter((t) => t.kind === "manual");
  const otherDone = otherToday.filter((t) => t.status === "Done").length;

  const dow = weekdayOf(today);
  const reminders: { text: string; href: string }[] = [];
  if (dow === 1) reminders.push({ text: "Monday: check in with every active Telegram client individually.", href: "/kpis/checkins" });
  if (dow === 2) reminders.push({ text: "Tuesday: review quiet clients and flag them to Michael by the end of today.", href: "/kpis/quiet" });
  if (dow === 5) reminders.push({ text: "Friday: copy and send the weekly KPI report to Michael.", href: "/kpis" });

  const recent = tasks
    .filter((t) => t.status === "Done" && t.completed_at)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greetingFor(settings.timezone)}, {settings.display_name}! 👋</h1>
          <p className="sub">Let's get your daily tasks done and keep your clients looked after.</p>
        </div>
        <div className="head-right">
          <span className="date-pill"><Icon name="calendar" /> {prettyDate(today)}<Clock tz={settings.timezone} /></span>
          <Link className="bell" href="/tasks" aria-label={overdue.length ? `${overdue.length} overdue tasks` : "Tasks"}>
            <Icon name="bell" />
            {overdue.length > 0 && <span className="dot" />}
          </Link>
        </div>
      </div>

      <div className="tiles">
        <div className="tile violet"><span className="ico"><Icon name="calendar" size={22} /></span><div><div className="num">{todays.length}</div><div className="cap">Due today</div></div></div>
        <div className="tile red"><span className="ico"><Icon name="alert" size={22} /></span><div><div className="num">{overdue.length}</div><div className="cap">Overdue</div></div></div>
        <div className="tile green"><span className="ico"><Icon name="check" size={22} /></span><div><div className="num">{doneTodayTasks.length}</div><div className="cap">Completed today</div></div></div>
        <div className="tile blue"><span className="ico"><Icon name="tasks" size={22} /></span><div><div className="num">{upcoming}</div><div className="cap">Upcoming</div></div></div>
      </div>

      <div className="cols">
        <section className="card">
          <div className="card-head">
            <h2><Icon name="tasks" /> Today's Tasks</h2>
            <span className={`count ${todays.length ? "danger" : ""}`}>{todays.length} pending</span>
          </div>
          {total === 0 && !paste ? (
            <p className="empty">Nothing due today. Your daily tasks appear on working days (Monday to Friday).</p>
          ) : (
            <ul className="list">
              {todays.map((t, i) => (
                <TaskRow key={t.id} task={t} onEdit={setEditing} hero={i === 0 && (t.kind === "daily_paste" || t.kind === "daily_report")} />
              ))}
              {paste && paste.status !== "Done" && !report && (
                <li className="task ghost" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span className="check" aria-hidden="true" style={{ borderStyle: "dashed" }} />
                  <div>
                    <span className="task-title">Review & Send Daily Client Report to {manager}</span>
                    <div className="task-desc">Appears after the first task is ticked.</div>
                  </div>
                  <span className="chip">Ready after first task</span>
                </li>
              )}
              {doneTodayTasks.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
            </ul>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setEditing(null)}><Icon name="plus" size={16} /> Add task</button>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2><Icon name="clock" /> Your Daily Progress</h2>
            <Link className="link-more" href="/tasks">View details <Icon name="arrow" size={14} /></Link>
          </div>
          <div className="ring-wrap">
            <div className="ring">
              <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${pct} percent of today's tasks complete`}>
                <circle cx="75" cy="75" r="62" fill="none" stroke="#e6e8f0" strokeWidth="14" />
                <circle cx="75" cy="75" r="62" fill="none" stroke="#1f8a4c" strokeWidth="14" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} />
              </svg>
              <div className="mid"><span className="pct">{pct}%</span><span className="lbl">Complete</span></div>
            </div>
          </div>
          <ul className="steps">
            <li><span className={`step-dot ${paste?.status === "Done" ? "on" : ""}`}>{paste?.status === "Done" && <Icon name="check" size={12} />}</span> Paste Telegram messages</li>
            <li><span className={`step-dot ${report?.status === "Done" ? "on" : ""}`}>{report?.status === "Done" && <Icon name="check" size={12} />}</span> Review & send daily report</li>
            <li><span className={`step-dot ${otherToday.length > 0 && otherDone === otherToday.length ? "on" : ""}`}>{otherToday.length > 0 && otherDone === otherToday.length && <Icon name="check" size={12} />}</span> Other tasks today ({otherDone}/{otherToday.length})</li>
          </ul>
          {total === 0 ? (
            <div className="note plain">No tasks due today.</div>
          ) : pct === 100 ? (
            <div className="note good"><Icon name="check" size={16} /> Everything due today is done.</div>
          ) : (
            <div className="note plain">{todays.length} {todays.length === 1 ? "task" : "tasks"} left today.</div>
          )}
        </section>
      </div>

      <div className="cols">
        <HotSeatCard today={today} manager={manager} from={settings.display_name} />
        <section className="card">
          <div className="card-head"><h2><Icon name="bell" /> Important Reminders</h2></div>
          {reminders.length === 0 ? (
            <p className="empty">No weekly reminders today.</p>
          ) : (
            <ul className="list">{reminders.map((r) => <li key={r.text} className="task" style={{ gridTemplateColumns: "1fr" }}><Link href={r.href}>{r.text}</Link></li>)}</ul>
          )}
        </section>
      </div>

      <div className="cols">
        <section className="card">
          <div className="card-head"><h2><Icon name="star" /> Recent Activity</h2></div>
          {recent.length === 0 ? (
            <p className="empty">Completed tasks will show here.</p>
          ) : (
            <ul className="activity">
              {recent.map((t) => (
                <li key={t.id}>
                  <span className="ico"><Icon name="check" size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t">Task completed</div>
                    <div className="s">{t.title}</div>
                  </div>
                  <span className="s">{timeAgo(t.completed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2><Icon name="users" /> Client Overview</h2><Link href="/telegram" className="btn">Open clients</Link></div>
          <div className="scores">
            <div className="score"><b>{clients.filter((c) => c.status === "Active").length}</b><span>Active</span></div>
            <div className="score"><b>{clients.filter((c) => c.needs_reply).length}</b><span>Need a reply</span></div>
            <div className="score"><b>{clients.filter((c) => c.needs_michael).length}</b><span>Waiting for Michael</span></div>
          </div>
        </section>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-head">
            <h2><Icon name="alert" /> Overdue Tasks</h2>
            <span className={`count ${overdue.length ? "danger" : ""}`}>{overdue.length}</span>
          </div>
          {overdue.length === 0 ? (
            <p className="empty">Nothing overdue.</p>
          ) : (
            <ul className="list">{overdue.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}</ul>
          )}
        </section>
        <ClientList title="Telegram messages needing a response" icon="telegram" empty="Every client message has a sent reply." list={clients.filter((c) => c.needs_reply).map((c) => ({ id: c.id, name: c.name, sub: c.summary || "New message", urgency: c.urgency }))} />
        <ClientList title="Waiting for Michael's personal response" icon="users" empty="Nothing waiting for Michael." list={[
          ...clients.filter((c) => c.needs_michael).map((c) => ({ id: c.id, name: c.name, sub: c.michael_reason || "Needs your personal response", urgency: c.urgency })),
          ...quietOpen.map((f) => ({ id: f.client_id, name: `${clients.find((c) => c.id === f.client_id)?.name || "Client"} (quiet client)`, sub: f.note || "Flagged as quiet", urgency: null })),
          ...leads.filter((l) => l.needs_michael).map((l) => ({ id: l.id, name: `${l.name} (Instagram)`, sub: l.michael_reason || "Needs Michael", urgency: null, href: `/instagram/${l.id}` })),
        ]} />
        <section className="card">
          <div className="card-head"><h2><Icon name="instagram" /> Instagram leads needing attention</h2></div>
          {(() => {
            const rows = leads
              .map((l) => ({ l, fu: followupState(l, Date.now()) }))
              .filter(({ l, fu }) => fu.state === "due" || l.needs_reply || l.needs_michael)
              .slice(0, 8);
            if (rows.length === 0) return <p className="empty">No leads need a reply or follow-up.</p>;
            return (
              <ul className="list">
                {rows.map(({ l, fu }) => (
                  <li key={l.id}>
                    <Link href={`/instagram/${l.id}`} className="client-row" style={{ gridTemplateColumns: "1fr auto" }}>
                      <span><span className="task-title">{l.name}</span><span className="task-desc" style={{ display: "block" }}>{l.stage}</span></span>
                      <span className="meta">
                        {fu.state === "due" && <span className="chip high">Follow-up {fu.number} due</span>}
                        {l.needs_reply && <span className="chip today">Needs reply</span>}
                        {l.needs_michael && <span className="chip high">Michael</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>
        <Soon title="Upcoming calls and weekly KPIs" icon="kpi" stage="Coming in Stage 5" text="Booked discovery calls, attendance and your four KPIs for the week." />
      </div>

      {editing !== undefined && <TaskForm task={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
