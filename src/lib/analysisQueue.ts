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

async function run(clientId: string): Promise<Result> {
  queued.delete(clientId); // anything pasted from now on needs a fresh run
  running.add(clientId);
  notify();
  try {
    const res = await fetch("/api/telegram/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    if (res.status === 401) return { ok: false, error: "Your session has expired. Please sign in again." };
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: "The server didn't answer properly. Press Retry." };
    return data as Result;
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and press Retry." };
  } finally {
    running.delete(clientId);
    notify();
  }
}

export function enqueueAnalysis(clientId: string): Promise<Result> {
  const existing = queued.get(clientId);
  if (existing) return existing; // a run for this client hasn't started yet and will include the new message
  const p = chain.then(() => run(clientId));
  queued.set(clientId, p);
  chain = p.catch(() => undefined);
  notify();
  return p;
}

export function useAnalysisState(clientId: string): "idle" | "queued" | "running" {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0
  );
  if (running.has(clientId)) return "running";
  if (queued.has(clientId)) return "queued";
  return "idle";
}
