"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppData } from "@/components/AppData";
import { Icon } from "@/components/Icon";
import { usePreviews } from "@/components/usePreviews";
import { previewLine } from "@/lib/inbox";
import { waitingForReply } from "@/lib/respond";
import { formatDateTime } from "@/lib/core";

/** Dashboard list of the chats that are waiting for Erika's reply. The name opens the chat. */
export function RespondCard({ kind }: { kind: "telegram" | "instagram" }) {
  const { clients, leads, settings } = useAppData();
  const isTg = kind === "telegram";
  const rows = isTg ? clients : leads;
  const [previews] = usePreviews(isTg ? "client" : "lead", rows);
  const tz = settings?.timezone || "Asia/Manila";
  const items = useMemo(() => waitingForReply(rows as never, previews), [rows, previews]);
  const base = isTg ? "/telegram" : "/instagram";

  return (
    <section className="card">
      <div className="card-head">
        <h2><Icon name={isTg ? "telegram" : "instagram"} /> {isTg ? "Telegram: need to respond" : "Instagram: need to respond"}</h2>
        <span className={`count ${items.length ? "danger" : ""}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">{isTg ? "No Telegram chats are waiting for you." : "No Instagram chats are waiting for you."}</p>
      ) : (
        <ul className="list">
          {items.slice(0, 10).map((i) => (
            <li key={i.id}>
              <Link href={`${base}/${i.id}`} className="client-row">
                <span className="avatar">{i.name.slice(0, 1).toUpperCase()}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="task-title">{i.name}</span>
                  <span className="preview">{previewLine({ direction: "incoming", sender: i.sender, body: i.body }, 70)}</span>
                </span>
                <span className="client-side"><span className="sub" style={{ fontSize: 12 }}>{formatDateTime(i.sent_at, tz)}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 10 && <div className="row" style={{ marginTop: 10 }}><Link href={base} className="btn">See all {items.length}</Link></div>}
    </section>
  );
}
