"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/AppData";
import type { Resource } from "@/lib/types";

type Draft = Omit<Resource, "id" | "key"> & { id?: string };
const EMPTY: Draft = { name: "", url: "", category: "Booking", purpose: "", notes: "", active: true };

export default function ResourcesPage() {
  const { resources, saveResource, deleteResource } = useAppData();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setEditing({ ...EMPTY });
      window.history.replaceState(null, "", "/resources");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    if (!/^https:\/\/\S+$/i.test(editing.url.trim())) {
      setErr("The link must start with https:// and contain no spaces.");
      return;
    }
    setBusy(true);
    const ok = await saveResource(editing);
    setBusy(false);
    if (ok) setEditing(null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resources & Booking Links</h1>
          <p className="sub">Saved permanently in your database. The AI will only ever use links from this list.</p>
        </div>
        <button className="btn primary" onClick={() => { setErr(null); setEditing({ ...EMPTY }); }}>Add link</button>
      </div>

      <section className="card scroll-x">
        {resources.length === 0 ? (
          <p className="empty">No links saved yet.</p>
        ) : (
          <table className="simple">
            <thead><tr><th>Name</th><th>Link</th><th>Category</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><div className="sub" style={{ fontSize: 13 }}>{r.purpose}</div></td>
                  <td className="url"><a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a></td>
                  <td>{r.category}</td>
                  <td><span className={`chip ${r.active ? "ok" : ""}`}>{r.active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="row">
                      <button className="btn small" onClick={() => { setErr(null); setEditing({ ...r }); }}>Edit</button>
                      <button className="btn small" onClick={() => saveResource({ ...r, active: !r.active })}>
                        {r.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => { if (window.confirm(`Delete "${r.name}"? This can't be undone.`)) deleteResource(r.id); }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Link details">
          <form className="modal" onSubmit={submit}>
            <h2>{editing.id ? "Edit link" : "Add link"}</h2>
            {err && <div className="banner error" role="alert">{err}</div>}
            <div className="field">
              <label htmlFor="r-name">Resource name</label>
              <input id="r-name" type="text" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="r-url">URL</label>
              <input id="r-url" type="url" required value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://" />
            </div>
            <div className="two">
              <div className="field">
                <label htmlFor="r-cat">Category</label>
                <input id="r-cat" type="text" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} list="cat-list" />
                <datalist id="cat-list"><option value="Booking" /><option value="Information" /><option value="Paid option" /><option value="Free resource" /></datalist>
              </div>
              <div className="field">
                <label htmlFor="r-active">Status</label>
                <select id="r-active" value={editing.active ? "1" : "0"} onChange={(e) => setEditing({ ...editing, active: e.target.value === "1" })}>
                  <option value="1">Active</option><option value="0">Inactive</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="r-purpose">Purpose</label>
              <textarea id="r-purpose" value={editing.purpose} onChange={(e) => setEditing({ ...editing, purpose: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="r-notes">Notes</label>
              <textarea id="r-notes" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
            <div className="row">
              <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save link"}</button>
              <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
