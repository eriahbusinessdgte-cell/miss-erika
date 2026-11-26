"use client";

import Link from "next/link";
import { useState } from "react";
import type { Task } from "@/lib/types";
import { bucketOf, prettyDate, type Recurrence } from "@/lib/core";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";

/** Where clicking a task takes you. Manual tasks stay in the task list. */
export function taskHref(t: Task): string | null {
  if (t.kind === "daily_paste") return "/telegram";
  if (t.kind === "daily_report" && t.ref_date) return `/reports/${t.ref_date}`;
  if (t.kind === "monday_checkin") return "/telegram";
  if (t.kind === "quiet_flag") return "/telegram";
  if (t.kind === "hot_seat_find" || t.kind === "hot_seat_report") return "/#hot-seat";
  return null;
}

export function TaskRow({ task, onEdit, hero }: { task: Task; onEdit?: (t: Task) => void; hero?: boolean }) {
  const { setTaskStatus, today } = useAppData();
  const bucket = bucketOf(task, today);
  const done = task.status === "Done";
  const href = taskHref(task);

  return (
    <li className={`task ${done ? "done" : ""} ${hero && !done ? "hero" : ""}`}>
      <input
        className="check"
        type="checkbox"
        checked={done}
        aria-label={done ? `Reopen: ${task.title}` : `Mark complete: ${task.title}`}
        onChange={() => setTaskStatus(task, done ? "To do" : "Done")}
      />
      <div>
        {href ? (
          <Link className="task-title" href={href}>{task.title}</Link>
        ) : onEdit ? (
          <button className="task-title linklike" style={{ color: "inherit", textDecoration: "none" }} onClick={() => onEdit(task)}>
            {task.title}
          </button>
        ) : (
          <span className="task-title">{task.title}</span>
        )}
        {hero && task.description && !done && <div className="task-desc">{task.description}</div>}
        <div className="meta">
          {bucket === "overdue" && <span className="chip over">Overdue · {prettyDate(task.due_date!)}</span>}
          {bucket === "today" && <span className="chip today">Due today</span>}
          {bucket === "upcoming" && <span className="chip">Due {prettyDate(task.due_date!)}</span>}
          {task.kind !== "manual" && <span className="chip auto">Automatic</span>}
          {task.priority === "High" && <span className="chip high">High</span>}
          {task.status === "In progress" && <span className="chip">In progress</span>}
          {task.recurrence !== "None" && <span className="chip">Repeats {task.recurrence.toLowerCase()}</span>}
          {task.assignee && task.assignee !== "Erika" && <span className="chip">{task.assignee}</span>}
        </div>
      </div>
      {hero && href && !done ? (
        <Link className="btn primary" href={href}>Start Task <Icon name="arrow" size={16} /></Link>
      ) : (
        onEdit && task.kind === "manual" && <button className="btn small" onClick={() => onEdit(task)}>Edit</button>
      )}
    </li>
  );
}

type Draft = {
  id?: string;
  title: string;
  description: string;
  assignee: string;
  due_date: string;
  priority: Task["priority"];
  status: Task["status"];
  recurrence: Recurrence;
  notes: string;
};

export function TaskForm({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { saveTask, deleteTask, today } = useAppData();
  const [d, setD] = useState<Draft>({
    id: task?.id,
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignee: task?.assignee ?? "Erika",
    due_date: task?.due_date ?? today,
    priority: task?.priority ?? "Medium",
    status: task?.status ?? "To do",
    recurrence: task?.recurrence ?? "None",
    notes: task?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return;
    setBusy(true);
    const ok = await saveTask({ ...d, due_date: d.due_date || null });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={task ? "Edit task" : "Add task"}>
      <form className="modal" onSubmit={submit}>
        <h2>{task ? "Edit task" : "Add task"}</h2>
        <div className="field">
          <label htmlFor="t-title">Task title</label>
          <input id="t-title" type="text" required autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-desc">Description</label>
          <textarea id="t-desc" value={d.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="t-assignee">Assignee</label>
            <input id="t-assignee" type="text" value={d.assignee} onChange={(e) => set("assignee", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-due">Due date</label>
            <input id="t-due" type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-priority">Priority</label>
            <select id="t-priority" value={d.priority} onChange={(e) => set("priority", e.target.value as Task["priority"])}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-status">Status</label>
            <select id="t-status" value={d.status} onChange={(e) => set("status", e.target.value as Task["status"])}>
              <option>To do</option><option>In progress</option><option>Done</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-rec">Recurrence</label>
          <select id="t-rec" value={d.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
            <option>None</option><option>Daily</option><option>Weekdays</option><option>Weekly</option><option>Monthly</option>
          </select>
          <span className="hint">When you complete a repeating task, the next one is created automatically.</span>
        </div>
        <div className="field">
          <label htmlFor="t-notes">Notes</label>
          <textarea id="t-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save task"}</button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
          {task && (
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                if (window.confirm("Delete this task? This can't be undone.")) {
                  await deleteTask(task.id);
                  onClose();
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
