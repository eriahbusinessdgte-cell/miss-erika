import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { MAX_AUDIO_BYTES, transcribe } from "@/lib/transcribe";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Receives one voice note, returns its text. The audio is never stored.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* handled below */
  }
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "No audio file was received." }, { status: 400 });
  if (file.size > MAX_AUDIO_BYTES) return NextResponse.json({ ok: false, error: "That recording is over 4 MB, which is too big to send. Voice notes up to about 5 minutes fit." }, { status: 413 });

  const r = await transcribe(file);
  return NextResponse.json(r);
}
