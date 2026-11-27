"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OfficeAgent } from "@/components/OfficeScene";

// three.js only loads in the browser.
const OfficeScene = dynamic(() => import("@/components/OfficeScene"), { ssr: false, loading: () => <div className="office-scene" /> });

type AgentRow = { id: string; name: string; status: "working" | "idle" | "stopped"; note: string | null; last_heartbeat: string | null; created_at?: string };

const AGENT_ID = "telegram-listener"; // the only agent for now
const STALE_MS = 90_000; // a PC that went to sleep stops sending heartbeats

export default function OfficePage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("agent_status").select("*");
    if (error) return setErr(error.message);
    setErr(null);
    // Oldest first. Falls back to id if the table has no created_at column.
    const list = ((data as AgentRow[]) || []).slice().sort((a, b) => (a.created_at && b.created_at ? a.created_at.localeCompare(b.created_at) : a.id.localeCompare(b.id)));
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

  const agent = rows.find((r) => r.id === AGENT_ID);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function saveName(id: string) {
    const name = (drafts[id] ?? "").trim();
    if (!name) return;
    const { error } = await supabase.from("agent_status").update({ name }).eq("id", id);
    if (error) return setErr(error.message);
    setErr(null);
    setDrafts((d) => { const next = { ...d }; delete next[id]; return next; });
    setSaved(`Saved name "${name}".`);
    load();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const command = text.trim();
    if (!command) return;
    const { error } = await supabase.from("agent_commands").insert({ agent_id: AGENT_ID, command });
    if (error) return setErr(error.message);
    setErr(null);
    setText("");
    setSent("Sent. Waiting for the agent...");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Office</h1>
          <p className="sub">Your agents at their desks. Updates every few seconds.</p>
        </div>
      </div>
      {err && <div className="banner error">{err}</div>}
      <OfficeScene agents={agents} />
      <section className="card">
        <h2>Names</h2>
        <p className="sub">Give each agent a name. It shows above its desk.</p>
        {rows.map((r) => (
          <form key={r.id} className="row" onSubmit={(e) => { e.preventDefault(); saveName(r.id); }}>
            <label className="sr-only" htmlFor={`name-${r.id}`}>Name for {r.name}</label>
            <input id={`name-${r.id}`} type="text" value={drafts[r.id] ?? r.name} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} />
            <button className="btn" type="submit" disabled={!(drafts[r.id] ?? "").trim() || (drafts[r.id] ?? "").trim() === r.name}>Save name</button>
          </form>
        ))}
        {saved && <p className="sub">{saved}</p>}
      </section>
      <section className="card office-chat">
        <form onSubmit={send} className="row">
          <label className="sr-only" htmlFor="office-cmd">Message to the agent</label>
          <input id="office-cmd" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell the agent what to do…" />
          <button className="btn primary" type="submit" disabled={!text.trim()}>Send</button>
        </form>
        {sent && <p className="sub">{sent}</p>}
        <p className="office-note"><b>{agent?.name || "Agent"}:</b> {agent?.note || "No reply yet."}</p>
      </section>
    </>
  );
}
