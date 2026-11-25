"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, utcToZonedInput, zonedToUtc } from "@/lib/core";
import { ALL_STAGES, SOURCE_LABEL, followupState, followupText, openerFor, placeholdersIn, whatsappLine } from "@/lib/ig";
import { INSTAGRAM, enqueueAnalysis, useAnalysisState } from "@/lib/analysisQueue";
import type { IgDraft, IgLead, IgMessage } from "@/lib/types";

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const { settings, resources, reloadLeads } = useAppData();
  const supabase = useMemo(() => createClient(), []);
  const tz = settings?.timezone || "Asia/Manila";
  const ai = useAnalysisState(id, INSTAGRAM);

  const [lead, setLead] = useState<IgLead | null>(null);
  const [msgs, setMsgs] = useState<IgMessage[]>([]);
  const [drafts, setDrafts] = useState<IgDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [who, setWho] = useState<"lead" | "erika" | "michael">("lead");
  const [historyOnly, setHistoryOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [notes, setNotes] = useState("");
  const [copiedWa, setCopiedWa] = useState(false);
  const [mOpen, setMOpen] = useState(false);
  const [mText, setMText] = useState("");
  const [mWhen, setMWhen] = useState("");

  const callUrl = resources.find((r) => r.key === "discovery_call" && r.active)?.url || "";

  const load = useCallback(async () => {
    const [l, m, d] = await Promise.all([
      supabase.from("ig_leads").select("*").eq("id", id).maybeSingle(),
      supabase.from("ig_messages").select("*").eq("lead_id", id).order("sent_at", { ascending: true }),
      supabase.from("ig_drafts").select("*").eq("lead_id", id).order("created_at", { ascending: true }),
    ]);
    const e = l.error || m.error || d.error;
    if (e) setErr(e.message);
    setLead((l.data as IgLead) || null);
    setNotes((l.data as IgLead | null)?.notes || "");
    setMsgs((m.data as IgMessage[]) || []);
    setDrafts((d.data as IgDraft[]) || []);
    setLoaded(true);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (ai === "idle") { load(); reloadLeads(); } }, [ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [ed, setEd] = useState({ name: "", handle: "" });
  const deleteLead = async () => {
    if (!window.confirm("Delete this lead and all its messages and drafts? This can't be undone. (Archive keeps them.)")) return;
    const { error } = await supabase.from("ig_leads").delete().eq("id", id);
    if (error) return setErr(error.message);
    await reloadLeads();
    router.push("/instagram");
  };
  const patchLead = async (p: Record<string, unknown>) => {
    const { error } = await supabase.from("ig_leads").update(p).eq("id", id);
    if (error) setErr(error.message);
    await load();
    reloadLeads();
  };

  if (!loaded) return <p className="sub">Loading…</p>;
  if (!lead) return <div className="banner error">Lead not found. <Link href="/instagram">Back to leads</Link></div>;

  const active = [...drafts].reverse().find((d) => d.status === "draft" || d.status === "copied");
  const lastOut = msgs.filter((m) => m.direction === "outgoing" && !m.history_only).reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  const unreplied = msgs.filter((m) => m.direction === "incoming" && !m.history_only && new Date(m.created_at).getTime() > lastOut);
  const failed = unreplied.find((m) => m.analysis_error);
  const needsAnalysis = unreplied.length > 0 && !unreplied.every((m) => m.analyzed) && ai === "idle";
  const fu = followupState(lead, Date.now());
  const holes = active ? placeholdersIn(active.body) : [];

  async function savePaste(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const sentAt = zonedToUtc(when, tz);
    if (!text.trim()) return setErr("Paste the message first.");
    if (!sentAt) return setErr("Enter the date and time it was originally sent.");
    if (sentAt.getTime() > Date.now() + 5 * 60000) return setErr("That date and time is in the future. Check it.");
    const incoming = who === "lead";
    const history = !incoming || historyOnly; // only a lead message saved normally gets a reply written
    setSaving(true);
    const { error } = await supabase.from("ig_messages").insert({
      lead_id: id,
      direction: incoming ? "incoming" : "outgoing",
      sender: incoming ? "erika" : who,
      kind: incoming ? "reply" : who === "michael" ? "michael" : "reply",
      body: text.trim(),
      sent_at: sentAt.toISOString(),
      history_only: history,
      analyzed: history,
    });
    if (error) { setSaving(false); return setErr(error.message); }
    if (incoming) {
      const last = lead!.last_inbound_at && new Date(lead!.last_inbound_at) > sentAt ? lead!.last_inbound_at : sentAt.toISOString();
      await supabase.from("ig_leads").update(history ? { last_inbound_at: last } : { last_inbound_at: last, needs_reply: true }).eq("id", id);
    }
    setText(""); setSaving(false);
    await load();
    if (!history) { setWhen(""); enqueueAnalysis(id, INSTAGRAM); }
    reloadLeads();
  }

  async function saveMichael(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const at = zonedToUtc(mWhen, tz);
    if (!mText.trim()) return setErr("Paste what Michael wrote.");
    if (!at) return setErr("Enter the date and time Michael sent it.");
    if (at.getTime() > Date.now() + 5 * 60000) return setErr("That date and time is in the future. Check it.");
    const { error } = await supabase.from("ig_messages").insert({ lead_id: id, direction: "outgoing", sender: "michael", body: mText.trim(), sent_at: at.toISOString(), kind: "michael", analyzed: true });
    if (error) return setErr(error.message);
    await supabase.from("ig_drafts").update({ status: "superseded" }).eq("lead_id", id).in("status", ["draft", "copied"]);
    // Michael's message starts the follow-up clock, like any message we send.
    await patchLead({ needs_reply: false, needs_michael: false, outreach_sent_at: at.toISOString(), followups_sent: 0 });
    setMText(""); setMWhen(""); setMOpen(false);
  }

  async function deleteMessage(m: IgMessage) {
    const mine = m.direction === "outgoing" && m.sender !== "michael" && m.kind !== "michael";
    if (!window.confirm(`Delete ${m.direction === "incoming" ? "this message from the lead" : m.sender === "michael" ? "Michael's reply" : "your message"}? This can't be undone.${mine ? " The draft it came from goes back to Draft so you can send it again." : ""}`)) return;
    setErr(null);
    const { error } = await supabase.from("ig_messages").delete().eq("id", m.id);
    if (error) return setErr(error.message);
    const p: Record<string, unknown> = {};
    if (mine) {
      const d = drafts.find((x) => x.status === "sent" && x.body === m.body);
      if (d) {
        await supabase.from("ig_drafts").update({ status: "draft" }).eq("id", d.id);
        if (d.kind === "followup") p.followups_sent = Math.max(0, lead!.followups_sent - 1);
      }
    }
    const rest = msgs.filter((x) => x.id !== m.id);
    const real = rest.filter((x) => !x.history_only);
    const outs = real.filter((x) => x.direction === "outgoing");
    const lastOut = outs.reduce((t, x) => Math.max(t, new Date(x.created_at).getTime()), 0);
    p.needs_reply = real.some((x) => x.direction === "incoming" && new Date(x.created_at).getTime() > lastOut);
    p.last_inbound_at = rest.filter((x) => x.direction === "incoming").reduce<string | null>((t, x) => (!t || x.sent_at > t ? x.sent_at : t), null);
    if (m.direction === "outgoing") p.outreach_sent_at = outs.reduce<string | null>((t, x) => (!t || x.sent_at > t ? x.sent_at : t), null);
    await patchLead(p);
  }

  async function copyDraft(d: IgDraft) {
    try { await navigator.clipboard.writeText(d.body); } catch { return setErr("Couldn't copy automatically. Select the text and copy it."); }
    if (d.status === "draft") { await supabase.from("ig_drafts").update({ status: "copied", copied_at: new Date().toISOString() }).eq("id", d.id); await load(); }
  }

  async function markSent(d: IgDraft) {
    if (placeholdersIn(d.body).length) return setErr("Fill in the [bracketed] parts first (check Michael's Calendly for the slot).");
    const now = new Date().toISOString();
    const { error } = await supabase.from("ig_messages").insert({ lead_id: id, direction: "outgoing", body: d.body, sent_at: now, kind: d.kind, analyzed: true });
    if (error) return setErr(error.message);
    await supabase.from("ig_drafts").update({ status: "sent", sent_at: now }).eq("id", d.id);
    const p: Record<string, unknown> = {};
    if (d.kind === "followup") p.followups_sent = lead!.followups_sent + 1;
    else { p.outreach_sent_at = now; p.followups_sent = 0; p.needs_reply = false; }
    if (callUrl && d.body.includes(callUrl)) { p.stage = "Call link sent"; p.link_sent_at = now; }
    await patchLead(p);
  }

  async function saveEdit(d: IgDraft) {
    if (!editText.trim()) return;
    await supabase.from("ig_drafts").update({ body: editText.trim(), edited: true, status: "draft" }).eq("id", d.id);
    setEditing(null);
    await load();
  }

  async function regenerate(d: IgDraft) {
    if (d.kind === "reply") return void enqueueAnalysis(id, INSTAGRAM);
    const body = d.kind === "opener" ? openerFor(lead!.source, lead!.name) : followupText((d.followup_number || 1) as 1 | 2 | 3, lead!.name);
    await supabase.from("ig_drafts").update({ body, edited: false, status: "draft" }).eq("id", d.id);
    await load();
  }

  async function prepareFollowup() {
    if (fu.state !== "due") return;
    await supabase.from("ig_drafts").update({ status: "superseded" }).eq("lead_id", id).in("status", ["draft", "copied"]);
    const { error } = await supabase.from("ig_drafts").insert({ lead_id: id, kind: "followup", followup_number: fu.number, body: followupText(fu.number, lead!.name) });
    if (error) setErr(error.message);
    await load();
  }

  const wa = lead.link_sent_at ? whatsappLine(lead.name, lead.handle) : "";
  const items = [...msgs].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/instagram">← All leads</Link></p>
          <h1>{lead.name}</h1>
          <p className="sub">{lead.handle ? `@${lead.handle} · ` : ""}{SOURCE_LABEL[lead.source]} · {lead.stage}{lead.archived ? " · Archived" : ""}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => { setEd({ name: lead.name, handle: lead.handle || "" }); setEditOpen(true); }}>Edit details</button>
          <button className="btn" onClick={async () => { await patchLead({ archived: !lead.archived }); if (!lead.archived) router.push("/instagram"); }}>{lead.archived ? "Restore" : "Archive"}</button>
          <button className="btn" onClick={deleteLead}>Delete</button>
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {editOpen && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Edit lead">
          <form className="modal" onSubmit={async (e) => {
            e.preventDefault();
            if (!ed.name.trim()) return setErr("The name can't be empty.");
            await patchLead({ name: ed.name.trim(), handle: ed.handle.trim().replace(/^@/, "") });
            setEditOpen(false);
          }}>
            <h2>Edit lead</h2>
            <div className="field"><label htmlFor="e-name">Name</label><input id="e-name" type="text" required value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="e-handle">Instagram username</label><input id="e-handle" type="text" value={ed.handle} onChange={(e) => setEd({ ...ed, handle: e.target.value })} placeholder="@username" /></div>
            <div className="row"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={() => setEditOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      {lead.needs_michael && (
        <div className="banner error">
          <b>Waiting for Michael:</b> {lead.michael_reason}{" "}
          <button className="btn" onClick={() => patchLead({ needs_michael: false })}>Mark Michael responded</button>
        </div>
      )}

      <div className="chatgrid">
        <section className="card">
          <div className="thread" aria-label="Conversation">
            {items.length === 0 && !active && <p className="empty">No messages yet.</p>}
            {items.map((m) => (
              <div key={m.id} className={`bubble ${m.direction === "incoming" ? "in" : m.sender === "michael" ? "out michael" : "out"}`}>
                {m.sender === "michael" && <span className="who">Michael replied personally</span>}
                {m.body}
                <span className="when"><button type="button" className="btn" style={{ padding: "1px 8px", fontSize: 11 }} aria-label="Delete this message" onClick={() => deleteMessage(m)}>Delete message</button></span>
                {m.direction === "incoming" && m.history_only && (
                  <span className="when">
                    Saved to history only ·{" "}
                    <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={ai !== "idle"} onClick={() => enqueueAnalysis(id, INSTAGRAM, m.id)}>Write a reply to this</button>
                  </span>
                )}
                <span className="when">{m.direction === "incoming" ? "They sent " : m.sender === "michael" ? "Michael sent " : "You sent "}{formatDateTime(m.sent_at, tz)}</span>
              </div>
            ))}
            {active && (
              <div className="bubble draft">
                {editing === active.id ? (
                  <>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} style={{ width: "100%" }} aria-label="Edit draft" />
                    <div className="actions"><button className="btn primary" onClick={() => saveEdit(active)}>Save draft</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
                  </>
                ) : (
                  <>
                    {active.body}
                    <span className="when">
                      <span className={`chip ${active.status === "copied" ? "today" : ""}`}>{active.status === "copied" ? "Copied, not sent yet" : active.kind === "followup" ? `Follow-up ${active.followup_number} draft` : active.kind === "opener" ? "Opener draft" : "Draft"}</span>
                      {active.edited && " · edited"}
                      {holes.length > 0 && <span className="chip high" style={{ marginLeft: 6 }}>Fill in {holes.join(" ")}</span>}
                    </span>
                    <div className="actions">
                      <button className="btn" onClick={() => copyDraft(active)}>Copy</button>
                      <button className="btn primary" onClick={() => markSent(active)} disabled={holes.length > 0}>Mark as Sent</button>
                      <button className="btn" onClick={() => { setEditing(active.id); setEditText(active.body); }}>Edit</button>
                      <button className="btn" onClick={() => regenerate(active)} disabled={ai !== "idle" || (active.kind === "reply" && unreplied.length === 0)}>Regenerate</button>
                      <button className="btn" onClick={async () => { if (!window.confirm("Discard this draft? It won't be sent or counted.")) return; await supabase.from("ig_drafts").update({ status: "superseded" }).eq("id", active.id); await load(); reloadLeads(); }}>Discard</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {ai !== "idle" && <p className="sub" role="status">{ai === "queued" ? "Waiting for its turn…" : "Reading the message and writing a draft…"}</p>}
          {ai === "idle" && (failed || needsAnalysis) && (
            <div className="banner error" role="alert">{failed?.analysis_error || "This message hasn't been analysed yet."} <button className="btn" onClick={() => enqueueAnalysis(id, INSTAGRAM)}>Retry</button></div>
          )}
          {ai === "idle" && lead.needs_michael && !active && unreplied.length > 0 && <p className="sub">No draft was written because this one needs Michael.</p>}

          <form onSubmit={savePaste} style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div className="field"><label htmlFor="paste-who">Who wrote it</label>
              <select id="paste-who" value={who} onChange={(e) => setWho(e.target.value as "lead" | "erika" | "michael")}>
                <option value="lead">The lead</option><option value="erika">Me (Erika)</option><option value="michael">Michael</option>
              </select></div>
            <div className="field"><label htmlFor="paste">{who === "lead" ? "Paste their message" : who === "erika" ? "Paste what you replied" : "Paste what Michael replied"}</label><textarea id="paste" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste exactly what was written" /></div>
            {who === "lead" ? (
              <label className="checkrow"><input type="checkbox" checked={historyOnly} onChange={(e) => setHistoryOnly(e.target.checked)} /> Save to history only. Don&apos;t write a reply.</label>
            ) : (
              <p className="sub">Saved to the conversation history only. Nothing is drafted, and follow-up timing isn&apos;t changed.</p>
            )}
            <div className="field"><label htmlFor="paste-when">When it was sent ({tz})</label><input id="paste-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} max={utcToZonedInput(new Date().toISOString(), tz)} /></div>
            <div><button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : who === "lead" && !historyOnly ? "Save and write a reply" : "Save to history"}</button></div>
          </form>

          <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            {!mOpen ? (
              <button className="btn" onClick={() => setMOpen(true)}>Add Michael&apos;s response</button>
            ) : (
              <form onSubmit={saveMichael} style={{ display: "grid", gap: 10 }}>
                <div className="field"><label htmlFor="m-text">What Michael replied to this lead</label><textarea id="m-text" rows={4} value={mText} onChange={(e) => setMText(e.target.value)} placeholder="Paste Michael's reply exactly as he sent it" /></div>
                <div className="field"><label htmlFor="m-when">When Michael sent it ({tz})</label><input id="m-when" type="datetime-local" value={mWhen} onChange={(e) => setMWhen(e.target.value)} max={utcToZonedInput(new Date().toISOString(), tz)} /></div>
                <div className="row"><button className="btn primary" type="submit">Save Michael&apos;s response</button><button className="btn" type="button" onClick={() => setMOpen(false)}>Cancel</button></div>
              </form>
            )}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 16 }}>
          <section className="card">
            <div className="panel-title">Lead</div>
            {lead.summary && <p style={{ marginBottom: 10 }}>{lead.summary}</p>}
            <div className="field"><label htmlFor="g-stage">Stage</label>
              <select id="g-stage" value={lead.stage} onChange={(e) => patchLead({ stage: e.target.value })}>{ALL_STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="g-door">Door</label>
              <select id="g-door" value={lead.door || ""} onChange={(e) => patchLead({ door: e.target.value || null })}>
                <option value="">Not decided</option><option value="dream">1. Dream client</option><option value="okay_fit">2. Okay fit</option><option value="wrong_fit">3. Wrong fit (free resources only)</option></select></div>
            <label className="checkrow"><input type="checkbox" checked={lead.may_know_michael} onChange={(e) => patchLead({ may_know_michael: e.target.checked, ...(e.target.checked ? { needs_michael: true, michael_reason: "This person may know Michael. Ask him before replying." } : {}) })} /> Might know Michael</label>
            <label className="checkrow"><input type="checkbox" checked={lead.michael_sent_link} onChange={(e) => patchLead({ michael_sent_link: e.target.checked, ...(e.target.checked ? { needs_michael: true, michael_reason: "Michael may already have sent this person a link. Check with him first." } : {}) })} /> Michael already sent a link</label>
            <div className="field"><label htmlFor="g-notes">Notes</label><textarea id="g-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== lead.notes && patchLead({ notes })} /></div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => patchLead({ stage: "Booked" })}>Mark booked</button>
              <button className="btn" onClick={() => patchLead({ stage: "Not ready", followups_stopped: true })}>Not ready</button>
            </div>
          </section>

          <section className="card">
            <div className="panel-title">Follow-ups</div>
            {fu.state === "due" && (<><p><b>Follow-up {fu.number} of 3 is due.</b></p><button className="btn primary" disabled={!!active} onClick={prepareFollowup}>Prepare follow-up {fu.number}</button>{active && <p className="sub">Finish or send the current draft first.</p>}</>)}
            {fu.state === "waiting" && <p>Follow-up {fu.number} of 3 is due {formatDateTime(new Date(fu.dueAt).toISOString(), tz)}.</p>}
            {(fu.state === "none" || fu.state === "finished") && <p className="sub">{fu.why}</p>}
            <p className="sub" style={{ marginTop: 6 }}>{lead.followups_sent} of 3 follow-ups sent.</p>
            {lead.source !== "new_follow" && !lead.followups_stopped && lead.followups_sent < 3 && !["Booked", "Not ready"].includes(lead.stage) && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => patchLead({ followups_stopped: true })}>Stop follow-ups (let it go with love)</button>
            )}
          </section>

          <section className="card">
            <div className="panel-title">Call link</div>
            {lead.link_sent_at ? (
              <>
                <p className="sub">Link sent {formatDateTime(lead.link_sent_at, tz)}. Post this in the team WhatsApp group:</p>
                <p style={{ background: "var(--bg)", padding: 10, borderRadius: 10, margin: "8px 0" }}>{wa}</p>
                <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(wa); setCopiedWa(true); } catch { setErr("Couldn't copy automatically."); } }}>{copiedWa ? "Copied" : "Copy WhatsApp message"}</button>
              </>
            ) : (
              <>
                <p className="sub">Sending the Calendly link through a draft here records it automatically. If you sent it another way:</p>
                <button className="btn" style={{ marginTop: 8 }} onClick={() => patchLead({ stage: "Call link sent", link_sent_at: new Date().toISOString() })}>I sent the call link</button>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
