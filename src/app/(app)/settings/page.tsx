"use client";

import { useState } from "react";
import { useAppData } from "@/components/AppData";
import { isValidTimezone, todayInTz } from "@/lib/core";

export default function SettingsPage() {
  const { settings, saveSettings } = useAppData();
  const [d, setD] = useState(() => ({
    display_name: settings?.display_name ?? "",
    manager_name: settings?.manager_name ?? "",
    timezone: settings?.timezone ?? "Asia/Manila",
    quiet_inactive_days: settings?.quiet_inactive_days ?? 14,
  }));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (!isValidTimezone(d.timezone)) {
      setErr("That time zone isn't recognised. Use a name like Asia/Manila or Europe/London.");
      return;
    }
    const ok = await saveSettings({
      display_name: d.display_name.trim() || "Erika",
      manager_name: d.manager_name.trim() || "Michael Watson",
      timezone: d.timezone,
      quiet_inactive_days: Math.max(1, Number(d.quiet_inactive_days) || 14),
    });
    if (ok) setMsg("Saved.");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Your time zone decides what counts as "today" and when the daily tasks appear.</p>
        </div>
      </div>
      <form className="card" style={{ maxWidth: 560 }} onSubmit={submit}>
        {msg && <div className="banner info" role="status">{msg}</div>}
        {err && <div className="banner error" role="alert">{err}</div>}
        <div className="field">
          <label htmlFor="s-name">Your name</label>
          <input id="s-name" type="text" value={d.display_name} onChange={(e) => setD({ ...d, display_name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="s-mgr">Who you report to</label>
          <input id="s-mgr" type="text" value={d.manager_name} onChange={(e) => setD({ ...d, manager_name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="s-tz">Time zone</label>
          <input id="s-tz" type="text" value={d.timezone} onChange={(e) => setD({ ...d, timezone: e.target.value })} list="tz-list" />
          <datalist id="tz-list">
            <option value="Asia/Manila" /><option value="Europe/London" /><option value="America/New_York" />
            <option value="America/Los_Angeles" /><option value="Asia/Singapore" /><option value="Australia/Sydney" />
          </datalist>
          <span className="hint">
            {isValidTimezone(d.timezone) ? `Today is ${todayInTz(d.timezone)} in this time zone.` : "Not a valid time zone yet."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="s-quiet">Treat a client as quiet after this many days without contact</label>
          <input id="s-quiet" type="number" min={1} value={d.quiet_inactive_days} onChange={(e) => setD({ ...d, quiet_inactive_days: Number(e.target.value) })} />
          <span className="hint">Used from Stage 5. Nothing is ever sent automatically.</span>
        </div>
        <button className="btn primary" type="submit">Save settings</button>
      </form>
    </>
  );
}
