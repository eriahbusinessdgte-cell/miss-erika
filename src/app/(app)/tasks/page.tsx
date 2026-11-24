"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { TaskForm, TaskRow } from "@/components/TaskParts";
import type { Task } from "@/lib/types";
import { bucketOf, compareTasks } from "@/lib/core";

export default function TasksPage() {
  const { tasks, today } = useAppData();
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [view, setView] = useState("open");
  const [status, setStatus] = useState("any");
  const [priority, setPriority] = useState("any");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    return tasks
      .filter((t) => {
        const b = bucketOf(t, today);
        if (view === "open" && t.status === "Done") return false;
        if (view === "overdue" && b !== "overdue") return false;
        if (view === "today" && b !== "today") return false;
        if (view === "upcoming" && b !== "upcoming") return false;
        if (view === "done" && t.status !== "Done") return false;
        if (status !== "any" && t.status !== status) return false;
        if (priority !== "any" && t.priority !== priority) return false;
        if (q && !`${t.title} ${t.description} ${t.notes}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort(view === "done" ? (a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : compareTasks);
  }, [tasks, today, view, status, priority, q]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="sub">Your daily and weekly responsibilities.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>Add task</button>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="f-view">Show</label>
          <select id="f-view" value={view} onChange={(e) => setView(e.target.value)}>
            <option value="open">All open</option>
            <option value="today">Due today</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming</option>
            <option value="done">Completed</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="any">Any</option><option>To do</option><option>In progress</option><option>Done</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-priority">Priority</label>
          <select id="f-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="any">Any</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="f-q">Search</label>
          <input id="f-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" />
        </div>
      </div>

      <section className="card">
        {shown.length === 0 ? (
          <p className="empty">No tasks match. Use "Add task" to create one.</p>
        ) : (
          <ul className="list">{shown.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}</ul>
        )}
      </section>

      {editing !== undefined && <TaskForm task={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
