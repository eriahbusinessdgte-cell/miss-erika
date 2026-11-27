"use client";
import { useSyncExternalStore } from "react";

// Runs AI analyses one at a time so a burst of pasted messages doesn't hit Groq's free per-minute limit.
type Result = { ok: boolean; error?: string; usedTemplate?: boolean };

let chain: Promise<unknown> = Promise.resolve();
const queued = new Map<string, Promise<Result>>();
const running = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

async function run(clientId: string, endpoint: string, messageId?: string, summaryOnly?: boolean, forceReply?: boolean): Promise<Result> {
  queued.delete(key(endpoint, clientId)); // anything pasted from now on needs a fresh run
  running.add(key(endpoint, clientId));
  notify();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, messageId, summaryOnly, forceReply }),
    });
    if (res.status === 401) return { ok: false, error: "Your session has expired. Please sign in again." };
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: "The server didn't answer properly. Press Retry." };
    return data as Result;
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and press Retry." };
  } finally {
    running.delete(key(endpoint, clientId));
    notify();
  }
}

const key = (endpoint: string, id: string) => `${endpoint}:${id}`;
export const TELEGRAM = "/api/telegram/analyze";
export const INSTAGRAM = "/api/instagram/analyze";
export const CHECKIN = "/api/telegram/checkin";

/** summaryOnly: write the summary and tags for the report but no reply draft and no change to the needs-a-reply flag. */
export function enqueueAnalysis(clientId: string, endpoint: string = TELEGRAM, messageId?: string, summaryOnly?: boolean, forceReply?: boolean): Promise<Result> {
  const k = key(endpoint, clientId);
  const existing = queued.get(k);
  if (existing) return existing; // a run for this client hasn't started yet and will include the new message
  const p = chain.then(() => run(clientId, endpoint, messageId, summaryOnly, forceReply));
  queued.set(k, p);
  chain = p.catch(() => undefined);
  notify();
  return p;
}

export function useAnalysisState(clientId: string, endpoint: string = TELEGRAM): "idle" | "queued" | "running" {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0
  );
  const k = key(endpoint, clientId);
  if (running.has(k)) return "running";
  if (queued.has(k)) return "queued";
  return "idle";
}
