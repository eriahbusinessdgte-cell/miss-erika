"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { formatDateTime } from "@/lib/core";
import { scanState, nextCheckAt } from "@/lib/scan";

/**
 * Telegram scan, on request only. The button asks for one scan; the watcher on Erika's computer starts it at its
 * next check (29 minutes past the hour), reads Telegram once, and stops. Nothing repeats by itself.
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
    settings.scan_requested_at ? new Date(settings.scan_requested_at) : null,
    settings.scan_last_at ? new Date(settings.scan_last_at) : null
  );

  async function start() {
    setBusy(true);
    await saveSettings({ scan_requested_at: new Date().toISOString() });
    setBusy(false);
  }

  if (st.kind === "pending") {
    return (
      <section className="card scan-slim">
        <div className="ico"><Icon name="telegram" size={18} /></div>
        <div className="txt">
          <div className="ttl">Scan requested</div>
          <p className="sub"><span className="dot wait" />Starts around {formatDateTime(nextCheckAt(now).toISOString(), tz)}. Keep your Mac on with Chrome open.</p>
        </div>
        <div className="waiting">Waiting…</div>
      </section>
    );
  }
  return (
    <section className="card scan-slim">
      <div className="ico"><Icon name="telegram" size={18} /></div>
      <div className="txt">
        <div className="ttl">Telegram scan</div>
        <p className="sub"><span className="dot" />{st.lastAt ? `Last scan ${formatDateTime(st.lastAt.toISOString(), tz)}. ` : "No scan yet. "}Runs only when you ask.</p>
      </div>
      <button className="btn primary" onClick={start} disabled={busy}><Icon name="refresh" size={15} /> {busy ? "Requesting…" : "Scan now"}</button>
    </section>
  );
}
