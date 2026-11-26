"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, zonedToUtc } from "@/lib/core";
import { ALL_STAGES, SOURCE_LABEL, followupState, openerFor, type Source } from "@/lib/ig";
import type { IgLead } from "@/lib/types";
import { usePreviews } from "@/components/usePreviews";
import { previewLine } from "@/lib/inbox";

export default function InstagramLeads() {
  const { leads, settings, reloadLeads } = useAppData();
  const previews = usePreviews("lead", leads);
  const tz = settings?.timezone || "Asia/Manila";
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const [show, setShow] = useState("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", handle: "", source: "comment" as Source, may_know_michael: false, michael_sent_link: false, notes: "", engaged: "" });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setAdding(true);
      window.history.replaceState(null, "", "/instagram");
    }
  }, []);

  const now = Date.now();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (show === "archived" ? !l.archived : l.archived) return false;
      if (stage !== "all" && l.stage !== stage) return false;
      const fu = followupState(l, now).state;
      if (show === "due" && fu !== "due") return false;
      if (show === "reply" && !l.needs_reply) return false;
      if (show === "michael" && !l.needs_michael) return false;
      if (needle && !`${l.name} ${l.handle}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [leads, q, stage, show, now]);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const flagged = f.may_know_michael || f.michael_sent_link;
    const { data, error } = await supabase
      .from("ig_leads")
      .insert({
        name: f.name.trim(),
        handle: f.handle.trim().replace(/^@/, ""),
        source: f.source,
        notes: f.notes,
        engaged_at: f.engaged ? zonedToUtc(f.engaged, tz)?.toISOString() ?? null : null,
        may_know_michael: f.may_know_michael,
        michael_sent_link: f.michael_sent_link,
        needs_michael: flagged,
        michael_reason: f.michael_sent_link ? "Michael may already have sent this person a link. Check with him first." : f.may_know_michael ? "This person may know Michael. Ask him first." : "",
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      setErr(error?.message || "Couldn't add the lead.");
      return;
    }
    // The opener is fixed by the Bible, so it is written here, not by the AI. Held back if Michael needs to check first.
    if (!flagged) {
      await supabase.from("ig_drafts").insert({ lead_id: data.id, kind: "opener", body: openerFor(f.source, f.name), status: "draft" });
    }
    await reloadLeads();
    window.location.href = `/instagram/${data.id}`;
  }

  function chips(l: IgLead) {
    const fu = followupState(l, now);
    return (
      <span className="meta">
        <span className="chip auto">{l.stage}</span>
        <span className="chip">{SOURCE_LABEL[l.source]}</span>
        {l.needs_reply && <span className="chip today">Needs reply</span>}
        {fu.state === "due" && <span className="chip high">Follow-up {fu.number} due</span>}
        {fu.state === "waiting" && <span className="chip">Follow-up {fu.number} {formatDateTime(new Date(fu.dueAt).toISOString(), tz)}</span>}
        {l.needs_michael && <span className="chip high">Waiting for Michael</span>}
      </span>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Instagram Leads</h1>
          <p className="sub">Drafts are written as Michael from the Sales Bible. You copy and send them yourself.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/instagram/bible">Sales Bible</Link>
          <button className="btn primary" onClick={() => { setErr(null); setAdding(true); }}><Icon name="plus" size={16} /> Add lead</button>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="l-q">Search</label>
          <input id="l-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @handle" />
        </div>
        <div className="field">
          <label htmlFor="l-stage">Stage</label>
          <select id="l-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All stages</option>
            {ALL_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="l-show">Show</label>
          <select id="l-show" value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="all">All</option>
            <option value="reply">Needs a reply</option>
            <option value="due">Follow-up due</option>
            <option value="michael">Waiting for Michael</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <section className="card">
        {shown.length === 0 ? (
          <p className="empty">{leads.length === 0 ? "No leads yet. Use “Add lead” when someone comments or replies “peace”, or follows." : "No leads match."}</p>
        ) : (
          <ul className="list">
            {shown.map((l) => (
              <li key={l.id}>
                <Link href={`/instagram/${l.id}`} className={`client-row${previews[l.id]?.unread ? " unread" : ""}`}>
                  <span className="avatar">{l.name.slice(0, 1).toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="task-title">{l.name} {l.handle && <span className="sub" style={{ fontWeight: 400 }}>@{l.handle}</span>}</span>
                    {previews[l.id] ? <span className="preview">{previewLine(previews[l.id])}</span> : l.summary ? <span className="task-desc" style={{ display: "block" }}>{l.summary}</span> : null}
                    {chips(l)}
                  </span>
                  <span className="client-side"><span className="sub" style={{ fontSize: 12 }}>{l.last_inbound_at ? `They wrote ${formatDateTime(l.last_inbound_at, tz)}` : "No reply yet"}</span>{previews[l.id]?.unread && <span className="unread-dot" aria-label="Unread" />}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Add lead">
          <form className="modal" onSubmit={addLead}>
            <h2>Add lead</h2>
            {err && <div className="banner error" role="alert">{err}</div>}
            <div className="two">
              <div className="field"><label htmlFor="a-name">Name</label><input id="a-name" type="text" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="a-handle">Instagram handle</label><input id="a-handle" type="text" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@handle" /></div>
            </div>
            <div className="field">
              <label htmlFor="a-source">How did they find us?</label>
              <select id="a-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Source })}>
                <option value="comment">{SOURCE_LABEL.comment}</option>
                <option value="story_reply">{SOURCE_LABEL.story_reply}</option>
                <option value="new_follow">{SOURCE_LABEL.new_follow}</option>
              </select>
            </div>
            {f.source !== "new_follow" && (
              <div className="field"><label htmlFor="a-when">When did they comment or reply? ({tz}, optional)</label><input id="a-when" type="datetime-local" value={f.engaged} onChange={(e) => setF({ ...f, engaged: e.target.value })} /></div>
            )}
            <label className="checkrow"><input type="checkbox" checked={f.may_know_michael} onChange={(e) => setF({ ...f, may_know_michael: e.target.checked })} /> They might be a friend or someone Michael knows</label>
            <label className="checkrow"><input type="checkbox" checked={f.michael_sent_link} onChange={(e) => setF({ ...f, michael_sent_link: e.target.checked })} /> Michael may already have sent them a link</label>
            <div className="field"><label htmlFor="a-notes">Notes (optional)</label><textarea id="a-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <div className="row">
              <button className="btn primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add lead"}</button>
              <button className="btn" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
