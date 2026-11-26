"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Client, IgLead, Resource, Settings, Task } from "@/lib/types";
import {
  DAILY_PASTE_TITLE,
  DAILY_REPORT_TITLE,
  isWorkingDate,
  nextDueDate,
  todayInTz,
  type Recurrence,
} from "@/lib/core";
import { SEED_RESOURCES } from "@/lib/seed";
import { HOT_SEAT_FIND_TITLE, HOT_SEAT_REPORT_TITLE, hotSeatTasksDue } from "@/lib/hotseat";

type TaskInput = {
  id?: string;
  title: string;
  description: string;
  assignee: string;
  due_date: string | null;
  priority: Task["priority"];
  status: Task["status"];
  recurrence: Recurrence;
  notes: string;
};

type ResourceInput = {
  id?: string;
  name: string;
  url: string;
  category: string;
  purpose: string;
  notes: string;
  active: boolean;
};

type Ctx = {
  ready: boolean;
  error: string | null;
  clearError: () => void;
  settings: Settings | null;
  tasks: Task[];
  resources: Resource[];
  clients: Client[];
  leads: IgLead[];
  reloadLeads: () => Promise<void>;
  reloadClients: () => Promise<void>;
  today: string;
  saveTask: (t: TaskInput) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;
  setTaskStatus: (task: Task, status: Task["status"]) => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<boolean>;
  saveResource: (r: ResourceInput) => Promise<boolean>;
  deleteResource: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);

export function useAppData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}

const DUPLICATE = "23505"; // Postgres "already exists": expected when two tabs create the same daily task

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<IgLead[]>([]);
  const [today, setToday] = useState<string>(() => todayInTz("Asia/Manila"));
  const ensuring = useRef(false);

  const fail = useCallback((what: string, message: string) => {
    setError(`${what}: ${message}`);
  }, []);

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) {
      fail("Couldn't load tasks", error.message);
      return [] as Task[];
    }
    setTasks(data as Task[]);
    return data as Task[];
  }, [supabase, fail]);

  const loadResources = useCallback(async () => {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      fail("Couldn't load saved links", error.message);
      return;
    }
    setResources(data as Resource[]);
  }, [supabase, fail]);

  const reloadClients = useCallback(async () => {
    const { data, error } = await supabase.from("clients").select("*").order("name", { ascending: true });
    if (error) {
      fail("Couldn't load clients", error.message);
      return;
    }
    setClients(data as Client[]);
  }, [supabase, fail]);

  const reloadLeads = useCallback(async () => {
    const { data, error } = await supabase.from("ig_leads").select("*").order("created_at", { ascending: false });
    if (error) {
      fail("Couldn't load Instagram leads", error.message);
      return;
    }
    setLeads(data as IgLead[]);
  }, [supabase, fail]);

  // First load: settings (created with the starting links on first ever sign-in), tasks, links.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let { data: s, error: sErr } = await supabase.from("settings").select("*").maybeSingle();
      if (sErr) {
        if (!cancelled) fail("Couldn't load settings", sErr.message);
        return;
      }
      if (!s) {
        const { data: created, error: cErr } = await supabase
          .from("settings")
          .insert({})
          .select("*")
          .single();
        if (cErr) {
          if (!cancelled) fail("Couldn't create your settings", cErr.message);
          return;
        }
        s = created;
        const { error: rErr } = await supabase.from("resources").insert(SEED_RESOURCES);
        if (rErr && !cancelled) fail("Couldn't save the starting links", rErr.message);
      }
      if (cancelled) return;
      setSettings(s as Settings);
      setToday(todayInTz((s as Settings).timezone));
      await Promise.all([loadTasks(), loadResources(), reloadClients(), reloadLeads()]);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, fail, loadTasks, loadResources, reloadClients, reloadLeads]);

  // Keep "today" correct if the app stays open past midnight in the chosen time zone.
  useEffect(() => {
    if (!settings) return;
    const tz = settings.timezone;
    setToday(todayInTz(tz));
    const id = setInterval(() => setToday(todayInTz(tz)), 60_000);
    return () => clearInterval(id);
  }, [settings]);

  // Daily recurring Telegram tasks (Monday to Friday).
  useEffect(() => {
    if (!ready || !settings || ensuring.current) return;
    ensuring.current = true;
    (async () => {
      try {
        let changed = false;
        // Task 1: always present on working days.
        if (isWorkingDate(today) && !tasks.some((t) => t.kind === "daily_paste" && t.ref_date === today)) {
          const { error } = await supabase.from("tasks").insert({
            title: DAILY_PASTE_TITLE,
            description:
              "Open each client's own chat and paste the messages they sent while you were away. Tick this when you have finished.",
            kind: "daily_paste",
            ref_date: today,
            due_date: today,
            priority: "High",
            recurrence: "None",
          });
          if (error && error.code !== DUPLICATE) fail("Couldn't create today's first task", error.message);
          else changed = true;
        }
        // Task 2: only after Task 1 for the same day is done.
        for (const t of tasks) {
          if (t.kind === "daily_paste" && t.status === "Done" && t.ref_date) {
            const has = tasks.some((x) => x.kind === "daily_report" && x.ref_date === t.ref_date);
            if (!has) {
              const { error } = await supabase.from("tasks").insert({
                title: DAILY_REPORT_TITLE,
                description: "Review the compiled report and send it to Michael. It stays pending until you mark it as sent.",
                kind: "daily_report",
                ref_date: t.ref_date,
                due_date: t.ref_date,
                priority: "High",
                recurrence: "None",
              });
              if (error && error.code !== DUPLICATE) fail("Couldn't create the report task", error.message);
              else changed = true;
            }
          }
        }
        // Weekly Hot Seat tasks: look for participants (Monday), send Michael the report (Wednesday).
        for (const h of hotSeatTasksDue(today)) {
          if (tasks.some((t) => t.kind === h.kind && t.ref_date === h.ref_date)) continue;
          const find = h.kind === "hot_seat_find";
          const { error } = await supabase.from("tasks").insert({
            title: find ? HOT_SEAT_FIND_TITLE : HOT_SEAT_REPORT_TITLE,
            description: find
              ? "Find who will sit in the Hot Seat this Thursday and add their names to the Hot Seat note on the dashboard."
              : "Copy the Hot Seat report from the dashboard note and send it to Michael, then press Mark as sent.",
            kind: h.kind,
            ref_date: h.ref_date,
            due_date: h.ref_date,
            priority: "High",
            recurrence: "None",
          });
          if (error && error.code !== DUPLICATE) fail("Couldn't create the Hot Seat task", error.message);
          else changed = true;
        }
        if (changed) await loadTasks();
      } finally {
        ensuring.current = false;
      }
    })();
  }, [ready, settings, today, tasks, supabase, fail, loadTasks]);

  const saveTask = useCallback(
    async (t: TaskInput) => {
      const row = {
        title: t.title.trim(),
        description: t.description,
        assignee: t.assignee.trim() || "Erika",
        due_date: t.due_date || null,
        priority: t.priority,
        status: t.status,
        recurrence: t.recurrence,
        notes: t.notes,
        completed_at: t.status === "Done" ? new Date().toISOString() : null,
      };
      const { error } = t.id
        ? await supabase.from("tasks").update(row).eq("id", t.id)
        : await supabase.from("tasks").insert(row);
      if (error) {
        fail("Couldn't save the task", error.message);
        return false;
      }
      await loadTasks();
      return true;
    },
    [supabase, fail, loadTasks]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) fail("Couldn't delete the task", error.message);
      await loadTasks();
    },
    [supabase, fail, loadTasks]
  );

  const setTaskStatus = useCallback(
    async (task: Task, status: Task["status"]) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status, completed_at: status === "Done" ? new Date().toISOString() : null })
        .eq("id", task.id);
      if (error) {
        fail("Couldn't update the task", error.message);
        return;
      }
      // Completing a recurring manual task creates the next one.
      if (status === "Done" && task.status !== "Done" && task.kind === "manual" && task.recurrence !== "None") {
        const base = task.due_date ?? today;
        const next = nextDueDate(base, task.recurrence);
        if (next) {
          const { error: nErr } = await supabase.from("tasks").insert({
            title: task.title,
            description: task.description,
            assignee: task.assignee,
            due_date: next,
            priority: task.priority,
            status: "To do",
            recurrence: task.recurrence,
            notes: task.notes,
          });
          if (nErr) fail("Couldn't create the next repeat of this task", nErr.message);
        }
      }
      await loadTasks(); // the daily-task effect then creates Task 2 when Task 1 is done
    },
    [supabase, fail, loadTasks, today]
  );

  const saveSettings = useCallback(
    async (s: Partial<Settings>) => {
      const { data, error } = await supabase
        .from("settings")
        .update(s)
        .eq("user_id", settings?.user_id ?? "")
        .select("*")
        .single();
      if (error) {
        fail("Couldn't save settings", error.message);
        return false;
      }
      setSettings(data as Settings);
      return true;
    },
    [supabase, fail, settings]
  );

  const saveResource = useCallback(
    async (r: ResourceInput) => {
      const row = {
        name: r.name.trim(),
        url: r.url.trim(),
        category: r.category.trim() || "Other",
        purpose: r.purpose,
        notes: r.notes,
        active: r.active,
      };
      const { error } = r.id
        ? await supabase.from("resources").update(row).eq("id", r.id)
        : await supabase.from("resources").insert(row);
      if (error) {
        fail("Couldn't save the link", error.message);
        return false;
      }
      await loadResources();
      return true;
    },
    [supabase, fail, loadResources]
  );

  const deleteResource = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) fail("Couldn't delete the link", error.message);
      await loadResources();
    },
    [supabase, fail, loadResources]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  const value: Ctx = {
    ready,
    error,
    clearError: () => setError(null),
    settings,
    tasks,
    resources,
    clients,
    reloadClients,
    leads,
    reloadLeads,
    today,
    saveTask,
    deleteTask,
    setTaskStatus,
    saveSettings,
    saveResource,
    deleteResource,
    signOut,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
