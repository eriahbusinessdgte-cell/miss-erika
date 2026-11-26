"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/AppData";
import { todayInTz, formatDateTime } from "@/lib/core";
import { scanState } from "@/lib/scan";

/**
 * Morning Telegram scan. The button only shows while no scan has been done today. Pressing it starts the scan and
 * then keeps it updating every 3 hours until about 7 am Manila time (the scan itself runs on Erika's computer).
 */
export function ScanCard() {
  const { settings, saveSettings } = useAppData();
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!settings || !now) return null;
  const tz = settings.timezone;
  const st = scanState(
    now,
    settings.scan_requested_at ? new Date(settings.scan_requested_at) : null,
    settings.scan_last_at ? new Date(settings.scan_last_at) : null,
    (d) => todayInTz(tz, d)
  );
  if (st.kind === "done") return null;

  async function start() {
    setBusy(true);
    await saveSettings({ scan_requested_at: new Date().toISOString() });
    setBusy(false);
  }

  if (st.kind === "needed") {
    return (
      <section className="card scan-card">
        <div>
          <h2>Telegram scan &amp; import</h2>
          <p className="sub">No scan yet today. Start it and the app brings in missed client messages, then checks again every 3 hours until about 7 am Manila time.</p>
        </div>
        <button className="btn primary" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start today's scan"}</button>
      </section>
    );
  }
  return (
    <section className="card scan-card">
      <div>
        <h2>Telegram scan {st.kind === "waiting" ? "started" : "is running"}</h2>
        <p className="sub">
          {st.kind === "waiting"
            ? "Waiting for the first scan. Keep your Mac on with Chrome open."
            : `Last updated ${formatDateTime(st.lastAt.toISOString(), tz)}. It checks again about every 3 hours until ${formatDateTime(st.until.toISOString(), tz)}.`}
        </p>
      </div>
    </section>
  );
}
