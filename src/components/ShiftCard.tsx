"use client";

import { useState } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { madridDay } from "@/lib/shift";
import { scanState } from "@/lib/scan";
import { prettyDate, formatDateTime } from "@/lib/core";

/** Shown instead of the day's tasks until Erika presses Start working. */
export function StartWorkCard() {
  const { settings, saveSettings, today } = useAppData();
  const [busy, setBusy] = useState(false);
  if (!settings) return null;

  async function start() {
    if (!settings) return;
    setBusy(true);
    const now = new Date();
    const patch: Record<string, string | null> = { shift_started_at: now.toISOString(), shift_ended_at: null, shift_date: madridDay(now) };
    // Starting work also starts the Telegram scan, unless one is already running or finished for this day.
    const st = scanState(now, settings.scan_requested_at ? new Date(settings.scan_requested_at) : null, settings.scan_last_at ? new Date(settings.scan_last_at) : null, madridDay);
    if (st.kind === "needed") patch.scan_requested_at = now.toISOString();
    await saveSettings(patch);
    setBusy(false);
  }

  const last = settings.shift_ended_at && settings.shift_date ? `Last shift: ${prettyDate(settings.shift_date)}, finished ${formatDateTime(settings.shift_ended_at, settings.timezone)}.` : null;
  return (
    <section className="card scan-card" style={{ padding: 28 }}>
      <div>
        <h2>Ready when you are</h2>
        <p className="sub">
          Press Start working to open <strong>{prettyDate(today)}</strong> (Michael's day). Your tasks for the day appear and the Telegram scan starts.
        </p>
        {last && <p className="sub" style={{ marginTop: 6 }}>{last}</p>}
      </div>
      <button className="btn primary" onClick={start} disabled={busy}>
        <Icon name="check" size={16} /> {busy ? "Starting…" : "Start working"}
      </button>
    </section>
  );
}

/** Small button in the page header while a shift is open. Asks first if the report is still unsent. */
export function FinishWorkButton({ reportPending }: { reportPending: boolean }) {
  const { saveSettings } = useAppData();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await saveSettings({ shift_ended_at: new Date().toISOString() });
    setBusy(false);
    setAsking(false);
  }

  if (asking) {
    return (
      <span className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="sub">{reportPending ? "Today's report isn't marked as sent. Finish anyway?" : "Finish working?"}</span>
        <button className="btn primary" onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Yes, finish"}</button>
        <button className="btn" onClick={() => setAsking(false)}>Keep working</button>
      </span>
    );
  }
  return <button className="btn" onClick={() => setAsking(true)}>Finish working</button>;
}
