"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/components/AppData";
import { BackupCard } from "@/components/BackupCard";
import { isValidTimezone, todayInTz } from "@/lib/core";

export default function SettingsPage() {
  const { settings, saveSettings } = useAppData();
  const [d, setD] = useState(() => ({
    display_name: settings?.display_name ?? "",
    manager_name: settings?.manager_name ?? "",
    timezone: settings?.timezone ?? "Asia/Manila",
    quiet_inactive_days: settings?.quiet_inactive_days ?? 14,
    full_name: settings?.full_name ?? "",
    role_title: settings?.role_title ?? "",
    birthday: settings?.birthday ?? "",
    avatar_url: settings?.avatar_url ?? "",
  }));
  const fileRef = useRef<HTMLInputElement>(null);

  /** Shrinks the picture to a small square so it stays tiny (about 20 KB) and needs no file storage. */
  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const draw = (blob: Blob) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const size = 256;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const side = Math.min(img.width, img.height);
        c.getContext("2d")?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        setD((x) => ({ ...x, avatar_url: c.toDataURL("image/jpeg", 0.85) }));
      };
      img.onerror = async () => {
        URL.revokeObjectURL(url);
        // iPhone photos (HEIC) can't be opened by Chrome, so convert them first.
        if (blob === file && /heic|heif/i.test(file.type + file.name)) {
          try {
            const { default: heic2any } = await import("heic2any");
            const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
            return draw(Array.isArray(out) ? out[0] : out);
          } catch {
            /* fall through */
          }
        }
        setErr("That file couldn't be read as a picture. Try a JPG or PNG, or take a screenshot of the photo.");
      };
      img.src = url;
    };
    draw(file);
  }

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
      full_name: d.full_name.trim() || null,
      role_title: d.role_title.trim() || null,
      birthday: d.birthday || null,
      avatar_url: d.avatar_url || null,
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
        <div className="profile-photo">
          <span className="avatar">{d.avatar_url ? <img src={d.avatar_url} alt="Your profile picture" /> : (d.display_name || "E").slice(0, 1).toUpperCase()}</span>
          <div>
            <div className="row">
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{d.avatar_url ? "Change picture" : "Add profile picture"}</button>
              {d.avatar_url && <button type="button" className="btn" onClick={() => setD({ ...d, avatar_url: "" })}>Remove</button>}
            </div>
            <span className="hint">Press Save settings after choosing it.</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="field">
          <label htmlFor="s-full">Full name</label>
          <input id="s-full" type="text" value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} />
          <span className="hint">Kept on your profile. It isn't shown in the menu.</span>
        </div>
        <div className="field">
          <label htmlFor="s-name">Name shown in the app</label>
          <input id="s-name" type="text" value={d.display_name} onChange={(e) => setD({ ...d, display_name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="s-role">Your role</label>
          <input id="s-role" type="text" value={d.role_title} placeholder="Appointment Setter" onChange={(e) => setD({ ...d, role_title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="s-bday">Birthday</label>
          <input id="s-bday" type="date" value={d.birthday} onChange={(e) => setD({ ...d, birthday: e.target.value })} />
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
          <label htmlFor="s-quiet">Quiet client: we haven't heard from them since this many days before Monday (6 = since Tuesday of the previous week)</label>
          <input id="s-quiet" type="number" min={1} value={d.quiet_inactive_days} onChange={(e) => setD({ ...d, quiet_inactive_days: Number(e.target.value) })} />
          <span className="hint">Nothing is ever sent automatically.</span>
        </div>
        <button className="btn primary" type="submit">Save settings</button>
      </form>
      <BackupCard />
    </>
  );
}
