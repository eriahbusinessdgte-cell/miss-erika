"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Preview } from "@/lib/inbox";

type Row = { client_id?: string; lead_id?: string; direction: "incoming" | "outgoing"; sender: string; body: string; sent_at: string; unread: boolean };

/** Latest message and unread flag for every client (or Instagram lead), keyed by id. Refreshes when `dep` changes. */
export function usePreviews(kind: "client" | "lead", dep: unknown) {
  const [map, setMap] = useState<Record<string, Preview>>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    createClient()
      .rpc(kind === "client" ? "client_previews" : "ig_lead_previews")
      .then(({ data }) => {
        if (!alive || !Array.isArray(data)) return;
        const out: Record<string, Preview> = {};
        for (const r of data as Row[]) out[(kind === "client" ? r.client_id : r.lead_id) as string] = { direction: r.direction, sender: r.sender, body: r.body, sent_at: r.sent_at, unread: r.unread };
        setMap(out);
      });
    return () => {
      alive = false;
    };
  }, [kind, dep, tick]);
  return [map, reload] as const;
}
