"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXAMPLE_KINDS, parseConversation } from "@/lib/ig";

type Example = { id: string; kind: string; title: string; body: string; note: string; approved: boolean; created_at: string };

export default function ExamplesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Example[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editKind, setEditKind] = useState("approved_edit");
  const [kind, setKind] = useState("michael_message");
  const [body, setBody] = useState("");
  const [convo, setConvo] = useState("");
  const [taught, setTaught] = useState<string | null>(null);
  const pairs = useMemo(() => parseConversation(convo), [convo]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("ig_examples").select("*").order("created_at", { ascending: false });
    if (error) return setErr(error.message);
    setRows((data as Example[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setErr("Paste the message first.");
    setErr(null);
    const { error } = await supabase.from("ig_examples").insert({ kind, body: body.trim(), approved: true });
    if (error) return setErr(error.message);
    setBody("");
    await load();
  }
  async function teach() {
    if (pairs.length === 0) return;
    setErr(null);
    const { error } = await supabase.from("ig_examples").insert(pairs.map((p) => ({ kind: "michael_message", body: p.michael, note: p.lead, approved: true })));
    if (error) return setErr(error.message);
    setTaught(`Saved ${pairs.length} of Michael's replies. The writer will learn from them.`);
    setConvo("");
    await load();
  }
  async function save(r: Example) {
    if (!editBody.trim()) return;
    const { error } = await supabase.from("ig_examples").update({ body: editBody.trim(), kind: editKind }).eq("id", r.id);
    if (error) return setErr(error.message);
    setEditing(null);
    await load();
  }
  async function toggle(r: Example) {
    const { error } = await supabase.from("ig_examples").update({ approved: !r.approved }).eq("id", r.id);
    if (error) return setErr(error.message);
    await load();
  }
  async function remove(r: Example) {
    if (!window.confirm("Remove this example? It won't be used for future replies.")) return;
    const { error } = await supabase.from("ig_examples").delete().eq("id", r.id);
    if (error) return setErr(error.message);
    await load();
  }

  const approved = rows.filter((r) => r.approved).length;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/instagram">← Instagram leads</Link></p>
          <h1>Approved examples</h1>
          <p className="sub">Messages you and Michael like. The writer learns their tone and structure from approved ones (it uses the latest eight) and never copies the wording. Nothing is added automatically: you save each one yourself. The Sales Bible stays the main source of truth.</p>
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>Teach the app from a real conversation</h2></div>
        <p className="sub" style={{ marginBottom: 8 }}>Paste a conversation between Michael and a lead. Start each message with <b>Lead:</b> or <b>Michael:</b>. Each of Michael&apos;s replies is saved together with what the lead had just written, so the app learns how he answers real messages. Only paste conversations Michael actually had.</p>
        {taught && <div className="banner info" role="status">{taught}</div>}
        <textarea aria-label="Conversation" rows={10} value={convo} onChange={(e) => { setConvo(e.target.value); setTaught(null); }} placeholder={"Lead: I've struggled with anxiety for years…\nMichael: It can be exhausting when…\nLead: …"} style={{ width: "100%" }} />
        {convo.trim() && (
          <p className="sub" style={{ marginTop: 8 }}>{pairs.length === 0 ? "No Michael replies found yet. Check that each line starts with Lead: or Michael:." : `Found ${pairs.length} reply${pairs.length === 1 ? "" : "ies"} from Michael to save.`}</p>
        )}
        {pairs.slice(0, 3).map((p, i) => (
          <div key={i} style={{ background: "var(--bg)", padding: 10, borderRadius: 10, margin: "6px 0" }}>
            {p.lead && <p className="sub" style={{ margin: 0 }}>Lead: {p.lead.slice(0, 160)}{p.lead.length > 160 ? "…" : ""}</p>}
            <p style={{ margin: 0 }}>Michael: {p.michael.slice(0, 220)}{p.michael.length > 220 ? "…" : ""}</p>
          </div>
        ))}
        {pairs.length > 3 && <p className="sub">…and {pairs.length - 3} more.</p>}
        <div style={{ marginTop: 8 }}><button className="btn primary" disabled={pairs.length === 0} onClick={teach}>{pairs.length > 0 ? `Save ${pairs.length} as approved examples` : "Save as approved examples"}</button></div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>Add a single example</h2></div>
        <form onSubmit={add} style={{ display: "grid", gap: 10 }}>
          <div className="field"><label htmlFor="ex-kind">What kind of message is it?</label>
            <select id="ex-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(EXAMPLE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label htmlFor="ex-body">The message</label><textarea id="ex-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste a message Michael or you sent that worked well" /></div>
          <div><button className="btn primary" type="submit">Save as approved example</button></div>
        </form>
        <p className="sub" style={{ marginTop: 8 }}>You can also save a draft or one of Michael&apos;s replies straight from a lead&apos;s chat.</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Saved examples</h2><span className="count">{approved} approved</span></div>
        {rows.length === 0 && <p className="empty">No examples yet.</p>}
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span><span className="chip">{EXAMPLE_KINDS[r.kind] || r.kind}</span> <span className={`chip ${r.approved ? "today" : ""}`}>{r.approved ? "Approved, in use" : "Not in use"}</span></span>
              </div>
              {editing === r.id ? (
                <>
                  <select aria-label="Kind" value={editKind} onChange={(e) => setEditKind(e.target.value)}>{Object.entries(EXAMPLE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <textarea aria-label="Edit example" rows={5} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <div className="row"><button className="btn primary" onClick={() => save(r)}>Save</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
                </>
              ) : (
                <>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.body}</p>
                  <div className="row">
                    <button className="btn" onClick={() => { setEditing(r.id); setEditBody(r.body); setEditKind(r.kind); }}>Edit</button>
                    <button className="btn" onClick={() => toggle(r)}>{r.approved ? "Stop using" : "Approve"}</button>
                    <button className="btn" onClick={() => remove(r)}>Remove</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
