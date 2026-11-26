"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX = 4 * 1024 * 1024;

/**
 * Button + small window to turn a voice note into text.
 * Choose the file, drag it in, or paste it (copy the file, then Cmd+V). The audio is never saved. Only the text is returned.
 */
export function VoiceNote({ label = "Add voice message", onText }: { label?: string; onText: (text: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function send(file: File | undefined | null) {
    if (!file) return;
    setErr(null);
    if (file.size > MAX) return setErr("That recording is over 4 MB, which is too big. Voice notes up to about 5 minutes fit.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "voice.ogg");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        setBusy(false);
        return setErr(data?.error || "The transcription didn't work. Try again.");
      }
      await onText(String(data.text));
      setBusy(false);
      setOpen(false);
    } catch {
      setBusy(false);
      setErr("Couldn't reach the app. Check your connection and try again.");
    }
  }

  useEffect(() => {
    if (!open) return;
    const paste = (e: ClipboardEvent) => {
      const f = e.clipboardData?.files?.[0];
      if (f) {
        e.preventDefault();
        void send(f);
      }
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("paste", paste);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  return (
    <>
      <button type="button" className="btn" onClick={() => { setErr(null); setOpen(true); }}>{label}</button>
      {open && createPortal(
        <div className="modal-back" style={{ zIndex: 1000 }} role="dialog" aria-modal="true" aria-label="Add voice message">
          <div className="modal">
            <h2>Add voice message</h2>
            <p className="sub">Choose the voice note file, drop it here, or copy the file and press Cmd+V (Ctrl+V on Windows). It turns into text and the audio is not saved.</p>
            {err && <div className="banner error" role="alert">{err}</div>}
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void send(e.dataTransfer.files?.[0]); }}
            >
              {busy ? <span>Turning it into text… this takes a few seconds.</span> : <span>Drop the voice note here</span>}
            </div>
            <input ref={input} type="file" accept="audio/*,.ogg,.oga,.opus,.m4a,.mp3,.wav,.webm,.aac" hidden onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" disabled={busy} onClick={() => input.current?.click()}>Choose file</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** True for a message that is only the placeholder left by an import, with no words yet. */
export function isBareVoice(body: string): boolean {
  return /^\[voice message\]$/i.test(body.trim());
}
