import type { Recurrence } from "./core";

export type Settings = {
  user_id: string;
  display_name: string;
  manager_name: string;
  timezone: string;
  quiet_inactive_days: number;
  quiet_flag_weekday: number;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  due_date: string | null;
  priority: "Low" | "Medium" | "High";
  status: "To do" | "In progress" | "Done";
  recurrence: Recurrence;
  notes: string;
  kind: "manual" | "daily_paste" | "daily_report" | "monday_checkin" | "quiet_flag";
  ref_date: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Resource = {
  id: string;
  key: string | null;
  name: string;
  url: string;
  category: string;
  purpose: string;
  notes: string;
  active: boolean;
};
