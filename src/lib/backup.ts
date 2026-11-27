// Backup format for export and import. Pure functions only (no imports) so they can be unit-tested.

export const APP_ID = "miss-erika";
export const FORMAT_VERSION = 1;

// Order matters on import: parents before the rows that point at them.
export const TABLES = [
  "resources", "tasks", "knowledge",
  "clients", "client_messages", "reply_drafts", "score_history",
  "ig_leads", "ig_messages", "ig_drafts", "ig_calls", "ig_examples",
  "checkins", "quiet_flags", "daily_reports", "kpi_reports",
] as const;
export type TableName = (typeof TABLES)[number];

export type Backup = { app: string; version: number; exported_at: string; settings: Record<string, unknown> | null; tables: Record<string, Record<string, unknown>[]> };

export function buildBackup(settings: Record<string, unknown> | null, tables: Record<string, Record<string, unknown>[]>, now: string): Backup {
  const clean = (r: Record<string, unknown>) => {
    const { user_id, ...rest } = r; // the owner is set again on import, so a backup can be restored into any account
    void user_id;
    return rest;
  };
  const out: Backup = { app: APP_ID, version: FORMAT_VERSION, exported_at: now, settings: settings ? clean(settings) : null, tables: {} };
  for (const t of TABLES) out.tables[t] = (tables[t] || []).map(clean);
  return out;
}

export type Check = { ok: true; counts: Record<string, number>; total: number } | { ok: false; error: string };

export function validateBackup(x: unknown): Check {
  if (!x || typeof x !== "object") return { ok: false, error: "That file isn't a Miss Erika backup." };
  const b = x as Partial<Backup>;
  if (b.app !== APP_ID) return { ok: false, error: "That file isn't a Miss Erika backup." };
  if (typeof b.version !== "number" || b.version > FORMAT_VERSION) return { ok: false, error: "This backup was made by a newer version of the app." };
  if (!b.tables || typeof b.tables !== "object") return { ok: false, error: "The backup is missing its data." };
  const counts: Record<string, number> = {};
  let total = 0;
  for (const t of TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows === undefined) { counts[t] = 0; continue; }
    if (!Array.isArray(rows)) return { ok: false, error: `The "${t}" section of the backup is damaged.` };
    for (const r of rows) {
      if (!r || typeof r !== "object" || typeof (r as { id?: unknown }).id !== "string") return { ok: false, error: `A row in "${t}" has no id, so the backup looks damaged.` };
    }
    counts[t] = rows.length;
    total += rows.length;
  }
  return { ok: true, counts, total };
}

export const TABLE_LABEL: Record<string, string> = {
  resources: "Resources and booking links", tasks: "Tasks", knowledge: "Sales Bible sections",
  clients: "Telegram clients", client_messages: "Telegram messages", reply_drafts: "Telegram drafts", score_history: "Score history",
  ig_leads: "Instagram leads", ig_messages: "Instagram messages", ig_drafts: "Instagram drafts", ig_calls: "Discovery calls", ig_examples: "Approved Instagram examples",
  checkins: "Monday check-ins", quiet_flags: "Quiet client flags", daily_reports: "Daily reports", kpi_reports: "KPI reports",
};

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}
