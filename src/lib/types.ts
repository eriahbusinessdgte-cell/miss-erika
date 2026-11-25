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

export type Client = {
  id: string;
  name: string;
  telegram_username: string;
  status: "Active" | "Paused" | "Inactive" | "Archived";
  tags: string[];
  summary: string;
  urgency: "URGENT" | "MEDIUM PRIORITY" | "NOT URGENT" | null;
  last_message_at: string | null;
  last_response_at: string | null;
  peace_score: number | null;
  life_score: number | null;
  body_score: number | null;
  followup_status: string;
  needs_reply: boolean;
  needs_michael: boolean;
  michael_reason: string;
  michael_flagged_at: string | null;
  michael_resolved_at: string | null;
  notes: string;
  created_at: string;
};

export type ClientMessage = {
  id: string;
  client_id: string;
  direction: "incoming" | "outgoing";
  body: string;
  sent_at: string;
  session_date: string | null;
  analyzed: boolean;
  analysis: import("./erika").Analysis | null;
  analysis_error: string | null;
  created_at: string;
};

export type ReplyDraft = {
  id: string;
  client_id: string;
  kind: "reply" | "checkin";
  body: string;
  original_body: string;
  status: "draft" | "copied" | "sent" | "superseded";
  edited: boolean;
  ai_flags: string[];
  source_message_ids: string[];
  copied_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export type ScoreRow = {
  id: string;
  client_id: string;
  peace: number | null;
  life: number | null;
  body: number | null;
  recorded_at: string;
};

export type DailyReport = {
  id: string;
  report_date: string;
  version: number;
  status: "draft" | "sent";
  body: string;
  edited: boolean;
  is_update: boolean;
  period_start: string | null;
  period_end: string | null;
  client_count: number;
  replies_sent: number;
  replies_pending: number;
  michael_count: number;
  sent_at: string | null;
  created_at: string;
};
