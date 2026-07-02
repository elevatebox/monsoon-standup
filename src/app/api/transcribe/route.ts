import { NextRequest, NextResponse } from "next/server";
import { verifyAction } from "@/lib/standup/sign";
import { transcribeAudio } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Transcribe a voice note recorded on the reply page. Token-gated, no dashboard
// auth. Returns the transcript so the person can review/edit before sending.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const verified = body?.token ? verifyAction(body.token) : null;
  if (!verified || !verified.value.startsWith("reply:")) {
    return NextResponse.json({ error: "invalid or expired link" }, { status: 401 });
  }
  const data: string = body?.audio?.data ?? "";
  const mime: string = body?.audio?.mime ?? "audio/webm";
  if (!data) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }

  try {
    const text = await transcribeAudio(data, mime);
    if (!text) {
      return NextResponse.json(
        { error: "Could not make out the audio. Please type instead." },
        { status: 422 }
      );
    }
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: "Transcription failed. Please type instead." },
      { status: 502 }
    );
  }
}
