"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Knowledge } from "@/lib/types";

export default function BiblePage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Knowledge[]>([]);
  const [text, setText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("knowledge").select("*").order("position", { ascending: true }).then(({ data, error }) => {
      if (error) return setErr(error.message);
      const list = (data as Knowledge[]) || [];
      setRows(list);
      setText(Object.fromEntries(list.map((r) => [r.id, r.body])));
    });
  }, [supabase]);

  async function save(r: Knowledge) {
    setErr(null);
    setSaved(null);
    const { error } = await supabase.from("knowledge").update({ body: text[r.id] }).eq("id", r.id);
    if (error) return setErr(error.message);
    setSaved(r.title);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/instagram">← Instagram leads</Link></p>
          <h1>Sales Bible</h1>
          <p className="sub">The version of the Reborn DM Sales Bible dated 23 Nov 2026. Drafts are written from this text. When Michael adds a new answer, add it here.</p>
        </div>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {saved && <div className="banner" role="status">Saved “{saved}”.</div>}
      {rows.length === 0 && !err && <p className="sub">Loading…</p>}
      {rows.map((r) => (
        <section className="card" key={r.id} style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>{r.title}</h2></div>
          <textarea aria-label={r.title} rows={8} style={{ width: "100%", fontFamily: "inherit" }} value={text[r.id] ?? ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={text[r.id] === r.body} onClick={() => save(r)}>Save</button>
          </div>
        </section>
      ))}
    </>
  );
}
