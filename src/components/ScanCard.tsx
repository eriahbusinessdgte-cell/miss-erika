"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/AppData";
import { formatDateTime } from "@/lib/core";
import { madridDay } from "@/lib/shift";
import { scanState, nextScanAt } from "@/lib/scan";

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
    madridDay
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
        <h2>{st.kind === "waiting" ? "Telegram scan started" : "Telegram scan is on"}</h2>
        <p className="sub">
          {st.kind === "waiting"
            ? "Waiting for the first scan. Keep your Mac on with Chrome open."
            : nextScanAt(st.lastAt).getTime() < st.until.getTime() ? `Last scan finished ${formatDateTime(st.lastAt.toISOString(), tz)}. The next one starts around ${formatDateTime(nextScanAt(st.lastAt).toISOString(), tz)}, then about every 3 hours until ${formatDateTime(st.until.toISOString(), tz)}.` : `Last scan finished ${formatDateTime(st.lastAt.toISOString(), tz)}. That was the last scan for this shift (updates stop at ${formatDateTime(st.until.toISOString(), tz)}).`}
        </p>
      </div>
    </section>
  );
}
