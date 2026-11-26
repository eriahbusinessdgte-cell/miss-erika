"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateTime, weekdayOf, zonedToUtc } from "@/lib/core";
import type { Client } from "@/lib/types";
import { isQuiet } from "@/lib/clients";
import { TelegramImport } from "@/components/TelegramImport";
import { usePreviews } from "@/components/usePreviews";
import { RowMenu } from "@/components/RowMenu";
import { previewLine } from "@/lib/inbox";

function urgencyChip(u: Client["urgency"]) {
  if (u === "URGENT") return <span className="chip high">URGENT</span>;
  if (u === "MEDIUM PRIORITY") return <span className="chip today">MEDIUM PRIORITY</span>;
  if (u === "NOT URGENT") return <span className="chip ok">NOT URGENT</span>;
  return null;
}

export default function TelegramClients() {
  const { clients, settings, reloadClients } = useAppData();
  const router = typeof window === "undefined" ? null : window;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("current");
  const [flag, setFlag] = useState("all");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState({ name: "", telegram_username: "", status: "Active", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setAdding(true);
      window.history.replaceState(null, "", "/telegram");
    }
  }, []);
  void router;

  const [previews, reloadPreviews] = usePreviews("client", clients);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  async function toggleRead(id: string) {
    const isUnread = !!previews[id]?.unread;
    await createClient().from("clients").update(isUnread ? { marked_unread: false, last_opened_at: new Date().toISOString() } : { marked_unread: true }).eq("id", id);
    setMenu(null);
    reloadPreviews();
  }
  const tz = settings?.timezone || "Asia/Manila";
  const quietDays = settings?.quiet_inactive_days ?? 6;
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const mondayStr = addDays(todayStr, -((weekdayOf(todayStr) + 6) % 7));
  const quietCutoff = (zonedToUtc(`${mondayStr}T00:00`, tz)?.getTime() ?? 0) - quietDays * 86400000;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients
      .filter((c) => {
        if (status === "current" && c.status === "Archived") return false;
        if (status !== "current" && status !== "all" && c.status !== status) return false;
        if (flag === "reply" && !c.needs_reply) return false;
        if (flag === "michael" && !c.needs_michael) return false;
        if (flag === "quiet" && !isQuiet(c, quietCutoff)) return false;
        if (needle && !`${c.name} ${c.telegram_username} ${c.tags.join(" ")}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => {
        const w = (c: Client) => (c.needs_michael ? 0 : 1) + (c.needs_reply ? 0 : 2);
        return w(a) - w(b) || a.name.localeCompare(b.name);
      });
  }, [clients, q, status, flag, quietCutoff]);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: draft.name.trim(),
        telegram_username: draft.telegram_username.trim().replace(/^@/, ""),
        status: draft.status,
        notes: draft.notes,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setErr(error?.message || "Couldn't add the client.");
      return;
    }
    await reloadClients();
    window.location.href = `/telegram/${data.id}`;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Telegram Clients</h1>
          <p className="sub">Open a client to paste their messages into their own chat.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>Import from Telegram</button>
          <button className="btn primary" onClick={() => { setErr(null); setAdding(true); }}>
            <Icon name="plus" size={16} /> Add client
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="c-q">Search</label>
          <input id="c-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username or tag" />
        </div>
        <div className="field">
          <label htmlFor="c-status">Status</label>
          <select id="c-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="current">All current</option>
            <option>Active</option><option>Paused</option><option>Inactive</option><option>Archived</option>
            <option value="all">Everyone</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-flag">Show</label>
          <select id="c-flag" value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="all">All</option>
            <option value="reply">Needs a reply</option>
            <option value="michael">Waiting for Michael</option>
            <option value="quiet">Quiet clients</option>
          </select>
        </div>
      </div>

      <section className="card">
        {shown.length === 0 ? (
          <p className="empty">{clients.length === 0 ? "No clients yet. Use “Add client” to create the first one." : "No clients match."}</p>
        ) : (
          <ul className="list">
            {shown.map((c) => (
              <li key={c.id}>
                <Link href={`/telegram/${c.id}`} className={`client-row${previews[c.id]?.unread ? " unread" : ""}`} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: c.id }); }}>
                  <span className="avatar">{c.name.slice(0, 1).toUpperCase()}{isQuiet(c, quietCutoff) && <span className="quiet-flag" title="Quiet client" aria-label="Quiet client"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 1.5v13" stroke="#b42318" strokeWidth="1.6" strokeLinecap="round"/><path d="M3.8 2.2h8.4l-2 3 2 3H3.8z" fill="#d92d20"/></svg></span>}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="task-title">{c.name} {c.telegram_username && <span className="sub" style={{ fontWeight: 400 }}>@{c.telegram_username}</span>}</span>
                    {previews[c.id] ? <span className="preview">{previewLine(previews[c.id])}</span> : c.summary ? <span className="task-desc" style={{ display: "block" }}>{c.summary}</span> : null}
                    <span className="meta">
                      {urgencyChip(c.urgency)}
                      {c.tags.map((t) => <span key={t} className="chip auto">{t}</span>)}
                      {c.needs_reply && <span className="chip today">Needs reply</span>}
                      {c.needs_michael && <span className="chip high">Waiting for Michael</span>}
                      {isQuiet(c, quietCutoff) && <span className="chip">Quiet</span>}
                      {c.status !== "Active" && <span className="chip">{c.status}</span>}
                    </span>
                  </span>
                  <span className="client-side">
                    <span className="sub" style={{ fontSize: 12 }}>{c.last_message_at ? `Last message ${formatDateTime(c.last_message_at, tz)}` : "No messages yet"}</span>
                    {previews[c.id]?.unread && <span className="unread-dot" aria-label="Unread" />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {importing && <TelegramImport onClose={() => setImporting(false)} />}
      {adding && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Add client">
          <form className="modal" onSubmit={addClient}>
            <h2>Add client</h2>
            {err && <div className="banner error" role="alert">{err}</div>}
            <div className="field">
              <label htmlFor="n-name">Client name</label>
              <input id="n-name" type="text" required autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="two">
              <div className="field">
                <label htmlFor="n-user">Telegram username (optional)</label>
                <input id="n-user" type="text" value={draft.telegram_username} onChange={(e) => setDraft({ ...draft, telegram_username: e.target.value })} placeholder="@username" />
              </div>
              <div className="field">
                <label htmlFor="n-status">Status</label>
                <select id="n-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option>Active</option><option>Paused</option><option>Inactive</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="n-notes">Notes (optional)</label>
              <textarea id="n-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
            <div className="row">
              <button className="btn primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add client"}</button>
              <button className="btn" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {menu && <RowMenu x={menu.x} y={menu.y} unread={!!previews[menu.id]?.unread} onToggle={() => toggleRead(menu.id)} onClose={() => setMenu(null)} />}
    </>
  );
}
