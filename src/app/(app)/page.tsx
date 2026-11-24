"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppData } from "@/components/AppData";
import { TaskForm, TaskRow } from "@/components/TaskParts";
import type { Task } from "@/lib/types";
import { bucketOf, compareTasks, greetingFor, prettyDate, weekdayOf } from "@/lib/core";

function Soon({ title, stage, text }: { title: string; stage: string; text: string }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <p className="stage"><strong>{stage}.</strong> {text}</p>
    </section>
  );
}

export default function Dashboard() {
  const { settings, tasks, today } = useAppData();
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  if (!settings) return null;

  const open = tasks.filter((t) => t.status !== "Done");
  const todays = open.filter((t) => bucketOf(t, today) === "today").sort((a, b) => {
    // Automatic daily tasks first, in order.
    const rank = (t: Task) => (t.kind === "daily_paste" ? 0 : t.kind === "daily_report" ? 1 : 2);
    return rank(a) - rank(b) || compareTasks(a, b);
  });
  const overdue = open.filter((t) => bucketOf(t, today) === "overdue").sort(compareTasks);
  const doneToday = tasks.filter((t) => t.status === "Done" && t.due_date === today).length;

  const paste = tasks.find((t) => t.kind === "daily_paste" && t.ref_date === today);
  const report = tasks.find((t) => t.kind === "daily_report" && t.ref_date === today);
  const dow = weekdayOf(today);

  const reminders: string[] = [];
  if (dow === 1) reminders.push("Monday: check in with every active client individually.");
  if (dow === 2) reminders.push("Tuesday: flag any quiet clients to Michael by the end of today.");
  if (dow === 5) reminders.push("Friday: send the weekly KPI report.");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greetingFor(settings.timezone)}, {settings.display_name}</h1>
          <p className="sub">{prettyDate(today)} · {settings.timezone}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>Add task</button>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-head">
            <h2>Today's tasks</h2>
            <span className="count">{todays.length} to do{doneToday ? ` · ${doneToday} done` : ""}</span>
          </div>
          {todays.length === 0 ? (
            <p className="empty">Nothing due today. {doneToday ? "Everything for today is done." : ""}</p>
          ) : (
            <ul className="list">{todays.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}</ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Overdue tasks</h2>
            <span className={`count ${overdue.length ? "danger" : ""}`}>{overdue.length}</span>
          </div>
          {overdue.length === 0 ? (
            <p className="empty">Nothing overdue.</p>
          ) : (
            <ul className="list">{overdue.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}</ul>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Daily reporting</h2></div>
          {!paste ? (
            <p className="empty">No daily tasks today (they run Monday to Friday).</p>
          ) : (
            <ul className="list">
              <li className="task" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  <Link className="task-title" href="/telegram">1. Paste after-hours Telegram messages</Link>
                </div>
                <span className={`chip ${paste.status === "Done" ? "ok" : "today"}`}>{paste.status === "Done" ? "Done" : "Pending"}</span>
              </li>
              <li className="task" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  {report ? (
                    <Link className="task-title" href={`/reports/${today}`}>2. Review & send the daily report to {settings.manager_name.split(" ")[0]}</Link>
                  ) : (
                    <span className="task-title" style={{ color: "var(--muted)", fontWeight: 400 }}>2. Daily report (appears after step 1 is ticked)</span>
                  )}
                </div>
                <span className="chip">{report ? (report.status === "Done" ? "Sent" : "Pending") : "Waiting"}</span>
              </li>
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Important reminders</h2></div>
          {reminders.length === 0 ? (
            <p className="empty">No weekly reminders today.</p>
          ) : (
            <ul className="list">{reminders.map((r) => <li key={r} className="task" style={{ gridTemplateColumns: "1fr" }}>{r}</li>)}</ul>
          )}
        </section>

        <Soon title="Telegram messages needing a response" stage="Coming in Stage 2" text="Clients whose latest message has no sent reply will appear here, with a link straight to their chat." />
        <Soon title="Waiting for Michael's personal response" stage="Coming in Stage 2" text="Your Michael Action Required list will appear here." />
        <Soon title="Instagram leads needing follow-up" stage="Coming in Stage 4" text="Only leads who are genuinely due a follow-up under the Sales Bible rules will appear here." />
        <Soon title="Upcoming calls" stage="Coming in Stage 5" text="Booked discovery calls and attendance." />
        <Soon title="Weekly KPI progress" stage="Coming in Stage 5" text="Your four KPIs for this Monday to Friday week." />
      </div>

      {editing !== undefined && <TaskForm task={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
