"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/components/AppData";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, zonedToUtc, utcToZonedInput } from "@/lib/core";
import { extractScores } from "@/lib/erika";
import { CHECKIN, enqueueAnalysis, useAnalysisState } from "@/lib/analysisQueue";
import { VoiceNote, isBareVoice } from "@/components/VoiceNote";
import type { Client, ClientMessage, ReplyDraft, ScoreRow } from "@/lib/types";

export default function ClientChat() {
  const { id } = useParams<{ id: string }>();
  const { settings, reloadClients } = useAppData();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [ed, setEd] = useState({ name: "", telegram_username: "", status: "Active", notes: "" });
  const tz = settings?.timezone || "Asia/Manila";
  const aiState = useAnalysisState(id);

  const [client, setClient] = useState<Client | null>(null);
  const [msgs, setMsgs] = useState<ClientMessage[]>([]);
  const [drafts, setDrafts] = useState<ReplyDraft[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [who, setWho] = useState<"client" | "erika" | "michael">("client");
  const [historyOnly, setHistoryOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [mOpen, setMOpen] = useState(false);
  const [mText, setMText] = useState("");
  const [mWhen, setMWhen] = useState("");

  const load = useCallback(async () => {
    const [c, m, d, s] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("client_messages").select("*").eq("client_id", id).order("sent_at", { ascending: true }),
      supabase.from("reply_drafts").select("*").eq("client_id", id).order("created_at", { ascending: true }),
      supabase.from("score_history").select("*").eq("client_id", id).order("recorded_at", { ascending: false }),
    ]);
    const e = c.error || m.error || d.error || s.error;
    if (e) setErr(e.message);
    setClient((c.data as Client) || null);
    if (c.data) await supabase.from("clients").update({ last_opened_at: new Date().toISOString(), marked_unread: false }).eq("id", id); // opening the chat marks it read
    setMsgs((m.data as ClientMessage[]) || []);
    setDrafts((d.data as ReplyDraft[]) || []);
    setScores((s.data as ScoreRow[]) || []);
    setLoaded(true);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (aiState === "idle") load();
  }, [aiState, load]);

  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight; // open at the newest message
  }, [loaded, msgs.length, drafts.length]);

  const activeDraft = [...drafts].reverse().find((d) => d.status === "draft" || d.status === "copied");
  const lastOut = msgs.filter((m) => m.direction === "outgoing" && !m.history_only).reduce((t, m) => Math.max(t, new Date(m.created_at).getTime()), 0);
  const unreplied = msgs.filter((m) => m.direction === "incoming" && !m.history_only && new Date(m.created_at).getTime() > lastOut);
  const failed = unreplied.find((m) => m.analysis_error);
  const needsAnalysis = unreplied.length > 0 && !unreplied.every((m) => m.analyzed) && aiState === "idle";

  /** Puts the words of a voice note into a message that was saved as just "[voice message]". */
  async function addVoiceText(m: ClientMessage, spoken: string) {
    setErr(null);
    const { error } = await supabase.from("client_messages").update({ body: `[Voice message] ${spoken}` }).eq("id", m.id);
    if (error) return setErr(error.message);
    await load();
    // A client's voice note is summarised right away so it can go in the next report.
    if (m.direction === "incoming") enqueueAnalysis(id, undefined, m.id);
  }

  async function savePaste(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const sentAt = zonedToUtc(when, tz);
    if (!text.trim()) return setErr("Paste the message first.");
    if (!sentAt) return setErr("Enter the date and time it was originally sent.");
    if (sentAt.getTime() > Date.now() + 5 * 60000) return setErr("That date and time is in the future. Check it.");
    const incoming = who === "client";
    const history = !incoming || historyOnly; // only a client message saved normally gets a reply written
    setSaving(true);
    const { error } = await supabase.from("client_messages").insert({
      client_id: id,
      direction: incoming ? "incoming" : "outgoing",
      sender: incoming ? "erika" : who,
      body: text.trim(),
      sent_at: sentAt.toISOString(),
      session_date: when.slice(0, 10),
      history_only: history,
      analyzed: history ? true : false,
    });
    if (error) {
      setSaving(false);
      return setErr(error.message);
    }
    const patch: Record<string, unknown> = {};
    if (incoming) {
      // Scores: only what the client wrote, exactly as written.
      const sc = extractScores(text);
      if (Object.keys(sc).length) {
        await supabase.from("score_history").insert({ client_id: id, peace: sc.peace ?? null, life: sc.life ?? null, body: sc.body ?? null, recorded_at: sentAt.toISOString() });
        const newest = scores.every((r) => new Date(r.recorded_at).getTime() <= sentAt.getTime());
        if (!history || newest) {
          if (sc.peace !== undefined) patch.peace_score = sc.peace;
          if (sc.life !== undefined) patch.life_score = sc.life;
          if (sc.body !== undefined) patch.body_score = sc.body;
        }
      }
      if (!history) patch.needs_reply = true;
      if (!client?.last_message_at || sentAt.getTime() > new Date(client.last_message_at).getTime()) patch.last_message_at = sentAt.toISOString();
    } else if (!client?.last_response_at || sentAt.getTime() > new Date(client.last_response_at).getTime()) {
      patch.last_response_at = sentAt.toISOString();
    }
    if (Object.keys(patch).length) await supabase.from("clients").update(patch).eq("id", id);
    setText("");
    setSaving(false);
    await load();
    if (!history) { setWhen(""); enqueueAnalysis(id); }
    reloadClients();
  }

  async function deleteMessage(m: ClientMessage) {
    const what = m.direction === "incoming" ? "this client message" : m.sender === "michael" ? "Michael's reply" : "your reply";
    if (!window.confirm(`Delete ${what} from the conversation? This can't be undone.${m.direction === "outgoing" && m.sender !== "michael" ? " The draft it came from goes back to Draft so you can send it again." : ""}`)) return;
    setErr(null);
    const { error } = await supabase.from("client_messages").delete().eq("id", m.id);
    if (error) return setErr(error.message);
    if (m.direction === "outgoing" && m.sender !== "michael") {
      const d = drafts.find((x) => x.status === "sent" && x.body === m.body);
      if (d) await supabase.from("reply_drafts").update({ status: "draft", sent_at: null }).eq("id", d.id);
    }
    if (m.direction === "incoming") {
      await supabase.from("reply_drafts").update({ status: "superseded" }).eq("client_id", id).in("status", ["draft", "copied"]).contains("source_message_ids", [m.id]);
      await supabase.from("score_history").delete().eq("client_id", id).eq("recorded_at", m.sent_at);
    }
    // Work the client's status out again from what is left.
    const rest = msgs.filter((x) => x.id !== m.id);
    const real = (x: ClientMessage) => !x.history_only;
    const lastOut = rest.filter((x) => x.direction === "outgoing" && real(x)).reduce((t, x) => Math.max(t, new Date(x.created_at).getTime()), 0);
    const waiting = rest.some((x) => x.direction === "incoming" && real(x) && new Date(x.created_at).getTime() > lastOut);
    const latest = (dir: string) => rest.filter((x) => x.direction === dir).reduce<string | null>((t, x) => (!t || x.sent_at > t ? x.sent_at : t), null);
    const left = scores.filter((s) => s.recorded_at !== m.sent_at).sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0];
    const patch: Record<string, unknown> = { needs_reply: waiting, last_message_at: latest("incoming"), last_response_at: latest("outgoing") };
    if (m.direction === "incoming") Object.assign(patch, { peace_score: left?.peace ?? null, life_score: left?.life ?? null, body_score: left?.body ?? null });
    await supabase.from("clients").update(patch).eq("id", id);
    await load();
    reloadClients();
  }

  async function copyDraft(d: ReplyDraft) {
    try {
      await navigator.clipboard.writeText(d.body);
    } catch {
      setErr("Couldn't copy automatically. Select the text and copy it.");
      return;
    }
    if (d.status === "draft") {
      await supabase.from("reply_drafts").update({ status: "copied", copied_at: new Date().toISOString() }).eq("id", d.id);
      await load();
    }
  }

  async function markSent(d: ReplyDraft) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("client_messages").insert({ client_id: id, direction: "outgoing", body: d.body, sent_at: now, session_date: now.slice(0, 10), analyzed: true });
    if (error) return setErr(error.message);
    await supabase.from("reply_drafts").update({ status: "sent", sent_at: now }).eq("id", d.id);
    await supabase.from("clients").update({ needs_reply: false, last_response_at: now }).eq("id", id);
    await load();
    reloadClients();
  }

  async function saveEdit(d: ReplyDraft) {
    if (!editText.trim()) return;
    await supabase.from("reply_drafts").update({ body: editText.trim(), edited: true, status: "draft" }).eq("id", d.id);
    setEditing(null);
    await load();
  }

  async function saveMichael(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const at = zonedToUtc(mWhen, tz);
    if (!mText.trim()) return setErr("Paste what Michael wrote.");
    if (!at) return setErr("Enter the date and time Michael sent it.");
    if (at.getTime() > Date.now() + 5 * 60000) return setErr("That date and time is in the future. Check it.");
    const { error } = await supabase.from("client_messages").insert({
      client_id: id, direction: "outgoing", sender: "michael", body: mText.trim(), sent_at: at.toISOString(), session_date: mWhen.slice(0, 10), analyzed: true,
    });
    if (error) return setErr(error.message);
    // Michael has answered personally: older unsent drafts are no longer needed and the flag is cleared.
    await supabase.from("reply_drafts").update({ status: "superseded" }).eq("client_id", id).in("status", ["draft", "copied"]);
    await supabase.from("clients").update({ needs_reply: false, needs_michael: false, michael_resolved_at: new Date().toISOString(), last_response_at: at.toISOString() }).eq("id", id);
    setMText(""); setMWhen(""); setMOpen(false);
    await load();
    reloadClients();
  }

  async function michaelResponded() {
    await supabase.from("clients").update({ needs_michael: false, michael_resolved_at: new Date().toISOString() }).eq("id", id);
    await load();
    reloadClients();
  }

  if (!loaded) return <p className="sub">Loading…</p>;
  if (!client) return <div className="banner error">Client not found. <Link href="/telegram">Back to clients</Link></div>;

  const latest = [...msgs].reverse().find((m) => m.analysis)?.analysis || null;
  const items = [
    ...msgs.map((m) => ({ t: new Date(m.sent_at).getTime(), kind: "msg" as const, m })),
  ].sort((a, b) => a.t - b.t);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/telegram">← All clients</Link></p>
          <h1>{client.name}</h1>
          <p className="sub">{client.telegram_username ? `@${client.telegram_username} · ` : ""}{client.status}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => { setEd({ name: client.name, telegram_username: client.telegram_username || "", status: client.status, notes: (client as Client & { notes?: string }).notes || "" }); setEditOpen(true); }}>Edit details</button>
          <button className="btn" onClick={async () => {
            const archiving = client.status !== "Archived";
            const { error } = await supabase.from("clients").update({ status: archiving ? "Archived" : "Active" }).eq("id", id);
            if (error) return setErr(error.message);
            await reloadClients();
            if (archiving) router.push("/telegram"); else await load();
          }}>{client.status === "Archived" ? "Restore" : "Archive"}</button>
          <button className="btn" onClick={async () => {
            if (!window.confirm("Delete this client and all their messages, drafts and check-ins? This can't be undone. (Archive keeps them.)")) return;
            const { error } = await supabase.from("clients").delete().eq("id", id);
            if (error) return setErr(error.message);
            await reloadClients();
            router.push("/telegram");
          }}>Delete</button>
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {editOpen && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Edit client">
          <form className="modal" onSubmit={async (e) => {
            e.preventDefault();
            if (!ed.name.trim()) return setErr("The name can't be empty.");
            const { error } = await supabase.from("clients").update({ name: ed.name.trim(), telegram_username: ed.telegram_username.trim().replace(/^@/, ""), status: ed.status, notes: ed.notes }).eq("id", id);
            if (error) return setErr(error.message);
            setEditOpen(false); await load(); reloadClients();
          }}>
            <h2>Edit client</h2>
            <div className="field"><label htmlFor="e-name">Name</label><input id="e-name" type="text" required value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div className="two">
              <div className="field"><label htmlFor="e-user">Telegram username</label><input id="e-user" type="text" value={ed.telegram_username} onChange={(e) => setEd({ ...ed, telegram_username: e.target.value })} placeholder="@username" /></div>
              <div className="field"><label htmlFor="e-status">Status</label>
                <select id="e-status" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}><option>Active</option><option>Paused</option><option>Inactive</option><option>Archived</option></select></div>
            </div>
            <div className="field"><label htmlFor="e-notes">Notes</label><textarea id="e-notes" value={ed.notes} onChange={(e) => setEd({ ...ed, notes: e.target.value })} /></div>
            <div className="row"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={() => setEditOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}

      {client.needs_michael && (
        <div className="banner error">
          <b>Waiting for Michael:</b> {client.michael_reason}{" "}
          <button className="btn" onClick={michaelResponded}>Mark Michael responded</button>
        </div>
      )}

      <div className="chatgrid">
        <section className="card">
          <div className="thread" aria-label="Conversation" ref={threadRef}>
            {items.length === 0 && !activeDraft && <p className="empty">No messages yet. Paste the client&apos;s first message below.</p>}
            {items.map(({ m }) => (
              <div key={m.id} className={`bubble ${m.direction === "incoming" ? "in" : m.sender === "michael" ? "out michael" : "out"}`}>
                {m.sender === "michael" && <span className="who">Michael replied personally</span>}
                {m.body}
                <span className="when"><button type="button" className="btn" style={{ padding: "1px 8px", fontSize: 11 }} aria-label="Delete this message" onClick={() => deleteMessage(m)}>Delete message</button>{isBareVoice(m.body) && <> <VoiceNote label="Add voice message text" onText={(t) => addVoiceText(m, t)} /></>}</span>
                {m.direction === "incoming" && m.history_only && (
                  <span className="when">
                    Saved to history only ·{" "}
                    <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={aiState !== "idle"} onClick={() => enqueueAnalysis(id, undefined, m.id)}>Write a reply to this</button>
                  </span>
                )}
                <span className="when">
                  {m.direction === "incoming" ? "Sent " : m.sender === "michael" ? "Sent " : "Replied "}{formatDateTime(m.sent_at, tz)}
                  {m.direction === "incoming" && ` · pasted ${formatDateTime(m.created_at, tz)}`}
                </span>
              </div>
            ))}
            {activeDraft && (
              <div className="bubble draft">
                {editing === activeDraft.id ? (
                  <>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} style={{ width: "100%" }} aria-label="Edit draft" />
                    <div className="actions">
                      <button className="btn primary" onClick={() => saveEdit(activeDraft)}>Save draft</button>
                      <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    {activeDraft.body}
                    <span className="when">
                      <span className={`chip ${activeDraft.status === "copied" ? "today" : ""}`}>{activeDraft.status === "copied" ? "Copied, not sent yet" : activeDraft.kind === "checkin" ? "Monday check-in draft" : "Draft"}</span>
                      {activeDraft.edited && " · edited"}
                      {activeDraft.ai_flags.includes("template_fallback") && " · standard wording used"}
                    </span>
                    <div className="actions">
                      <button className="btn" onClick={() => copyDraft(activeDraft)}>Copy</button>
                      <button className="btn primary" onClick={() => markSent(activeDraft)}>Mark as Sent</button>
                      <button className="btn" onClick={() => { setEditing(activeDraft.id); setEditText(activeDraft.body); }}>Edit</button>
                      <button className="btn" onClick={async () => { if (!window.confirm("Discard this draft? It won't be sent or counted.")) return; await supabase.from("reply_drafts").update({ status: "superseded" }).eq("id", activeDraft.id); await load(); reloadClients(); }}>Discard</button>
                      <button className="btn" onClick={() => enqueueAnalysis(id, activeDraft.kind === "checkin" ? CHECKIN : undefined, activeDraft.kind === "checkin" ? undefined : msgs.find((m) => m.history_only && m.direction === "incoming" && activeDraft.source_message_ids?.includes(m.id))?.id)} disabled={aiState !== "idle" && activeDraft.kind !== "checkin"}>Regenerate</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {aiState !== "idle" && <p className="sub" role="status">{aiState === "queued" ? "Waiting for its turn…" : "Reading the message and writing a draft…"}</p>}
          {aiState === "idle" && (failed || needsAnalysis) && (
            <div className="banner error" role="alert">
              {failed?.analysis_error || "This message hasn't been analysed yet."}{" "}
              <button className="btn" onClick={() => enqueueAnalysis(id)}>Retry</button>
            </div>
          )}

          <form onSubmit={savePaste} style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div className="field">
              <label htmlFor="paste-who">Who wrote it</label>
              <select id="paste-who" value={who} onChange={(e) => setWho(e.target.value as "client" | "erika" | "michael")}>
                <option value="client">The client</option>
                <option value="erika">Me (Erika)</option>
                <option value="michael">Michael</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="paste">{who === "client" ? "Paste the client's message" : who === "erika" ? "Paste what you replied" : "Paste what Michael replied"}</label>
              <div><VoiceNote label="Add voice message" onText={(t) => setText((x) => (x.trim() ? x.trim() + "\n" : "") + `[Voice message] ${t}`)} /></div>
              <textarea id="paste" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste exactly what was written" />
            </div>
            {who === "client" ? (
              <label className="checkrow"><input type="checkbox" checked={historyOnly} onChange={(e) => setHistoryOnly(e.target.checked)} /> Save to history only. Don&apos;t write a reply.</label>
            ) : (
              <p className="sub">Saved to the conversation history only. Nothing is drafted.</p>
            )}
            <div className="field">
              <label htmlFor="paste-when">When it was sent ({tz})</label>
              <input id="paste-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} max={utcToZonedInput(new Date().toISOString(), tz)} />
            </div>
            <div><button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : who === "client" && !historyOnly ? "Save and write a reply" : "Save to history"}</button></div>
          </form>

          <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            {!mOpen ? (
              <button className="btn" onClick={() => setMOpen(true)}>Add Michael&apos;s response</button>
            ) : (
              <form onSubmit={saveMichael} style={{ display: "grid", gap: 10 }}>
                <div className="field"><label htmlFor="m-text">What Michael replied to this client</label><div><VoiceNote label="Add voice message" onText={(t) => setMText((x) => (x.trim() ? x.trim() + "\n" : "") + `[Voice message] ${t}`)} /></div><textarea id="m-text" rows={4} value={mText} onChange={(e) => setMText(e.target.value)} placeholder="Paste Michael's reply exactly as he sent it" /></div>
                <div className="field"><label htmlFor="m-when">When Michael sent it ({tz})</label><input id="m-when" type="datetime-local" value={mWhen} onChange={(e) => setMWhen(e.target.value)} max={utcToZonedInput(new Date().toISOString(), tz)} /></div>
                <div className="row"><button className="btn primary" type="submit">Save Michael&apos;s response</button><button className="btn" type="button" onClick={() => setMOpen(false)}>Cancel</button></div>
              </form>
            )}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 16 }}>
          <section className="card">
            <div className="panel-title">Latest analysis</div>
            {latest ? (
              <div className="kv">
                <div className="meta">
                  <span className={`chip ${latest.urgency === "URGENT" ? "high" : latest.urgency === "MEDIUM PRIORITY" ? "today" : "ok"}`}>{latest.urgency}</span>
                  {latest.tags.map((t) => <span key={t} className="chip auto">{t}</span>)}
                </div>
                <p>{latest.summary}</p>
                <p className="sub"><b>For Michael:</b> {latest.internal_report}</p>
              </div>
            ) : <p className="sub">Analysis appears here after a message is saved.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
