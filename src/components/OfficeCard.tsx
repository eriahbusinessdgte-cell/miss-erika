"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Bubble, OfficeAgent } from "@/components/OfficeScene";

// three.js only loads in the browser.
const OfficeScene = dynamic(() => import("@/components/OfficeScene"), { ssr: false, loading: () => <div className="office-scene" /> });

type AgentRow = { id: string; name: string; role: string | null; status: "working" | "idle" | "stopped"; note: string | null; last_heartbeat: string | null; created_at?: string };

const STALE_MS = 90_000; // a PC that went to sleep stops sending heartbeats
const BUBBLE_MS = 15_000; // a reply stays visible this long
const ALL = "all";

/** The agents' office on the dashboard: scene, profiles, and a box to talk to one agent or all of them. */
export function OfficeCard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const seen = useRef<Record<string, string> | null>(null); // last note per agent; null until the first load
  const [open, setOpen] = useState<string | null>(null); // agent whose profile is showing
  const [nameDraft, setNameDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [target, setTarget] = useState(ALL);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("agent_status").select("*");
    if (error) return setErr(error.message);
    setErr(null);
    // Oldest first. Falls back to id if the table has no created_at column.
    const list = ((data as AgentRow[]) || []).slice().sort((a, b) => (a.created_at && b.created_at ? a.created_at.localeCompare(b.created_at) : a.id.localeCompare(b.id)));
    // A changed note after the first load is a new reply: show it as a speech bubble for a while.
    const prev = seen.current;
    seen.current = Object.fromEntries(list.map((r) => [r.id, r.note || ""]));
    if (prev) {
      for (const r of list) {
        if (r.note && r.note !== prev[r.id]) {
          const at = Date.now();
          setBubbles((b) => ({ ...b, [r.id]: { text: r.note!.length > 140 ? `${r.note!.slice(0, 137)}…` : r.note!, at } }));
          setTimeout(() => setBubbles((b) => (b[r.id]?.at === at ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== r.id)) : b)), BUBBLE_MS);
        }
      }
    }
    setRows(list);
    setNow(Date.now());
  }, [supabase]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const agents: OfficeAgent[] = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name, working: r.status === "working" && !!r.last_heartbeat && now - new Date(r.last_heartbeat).getTime() < STALE_MS })),
    [rows, now]
  );
  const profile = rows.find((r) => r.id === open);
  const profileWorking = agents.find((a) => a.id === open)?.working;

  function openProfile(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setOpen(id); setNameDraft(r.name); setRoleDraft(r.role || ""); setSaved(null);
  }
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !nameDraft.trim()) return;
    const { error } = await supabase.from("agent_status").update({ name: nameDraft.trim(), role: roleDraft.trim() }).eq("id", profile.id);
    if (error) return setErr(error.message);
    setErr(null);
    setSaved("Saved.");
    load();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const command = text.trim();
    if (!command || rows.length === 0) return;
    const ids = target === ALL ? rows.map((r) => r.id) : [target];
    const { error } = await supabase.from("agent_commands").insert(ids.map((agent_id) => ({ agent_id, command })));
    if (error) return setErr(error.message);
    setErr(null);
    setText("");
    setSent(target === ALL ? `Sent to ${ids.length === 1 ? rows[0].name : `all ${ids.length} agents`}. Waiting for a reply...` : `Sent to ${rows.find((r) => r.id === target)?.name || "the agent"}. Waiting for a reply...`);
  }

  return (
    <section className="card office-card" aria-label="Office">
      <div className="card-head"><h2>Office</h2></div>
      {err && <div className="banner error">{err}</div>}
      <OfficeScene agents={agents} bubbles={bubbles} onSelect={openProfile} />
      {rows.length > 0 && (
        <div className="office-agents">
          {agents.map((a) => (
            <button key={a.id} type="button" className={`office-chip${open === a.id ? " sel" : ""}`} onClick={() => openProfile(a.id)}>
              <i className={a.working ? "on" : "off"} />{a.name}
            </button>
          ))}
        </div>
      )}
      {profile && (
        <form className="office-profile" onSubmit={saveProfile}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{profile.name}</b>
            <span className={`chip ${profileWorking ? "today" : ""}`}>{profileWorking ? "Working" : "Stopped"}</span>
          </div>
          <div className="field"><label htmlFor="ag-name">Name</label><input id="ag-name" type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} /></div>
          <div className="field"><label htmlFor="ag-role">Role</label><input id="ag-role" type="text" value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="What does this agent do?" /></div>
          <div className="row">
            <button className="btn primary" type="submit" disabled={!nameDraft.trim()}>Save</button>
            <button className="btn" type="button" onClick={() => setOpen(null)}>Close</button>
            {saved && <span className="sub">{saved}</span>}
          </div>
        </form>
      )}
      <form onSubmit={send} className="office-chat">
        <label className="sr-only" htmlFor="office-to">Who to talk to</label>
        <select id="office-to" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value={ALL}>All agents</option>
          {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="office-cmd">Message</label>
        <input id="office-cmd" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell the agent what to do…" />
        <button className="btn primary" type="submit" disabled={!text.trim() || rows.length === 0}>Send</button>
      </form>
      {sent && <p className="sub" style={{ margin: "8px 0 0" }}>{sent}</p>}
    </section>
  );
}
