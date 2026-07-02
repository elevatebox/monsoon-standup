import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  answerCallback,
  downloadTelegramFile,
  editMessageText,
  parseTelegramUpdate,
} from "@/lib/transport/telegram";
import { getTransport } from "@/lib/transport";
import { transcribeAudio } from "@/lib/ai/gemini";
import { handleInbound } from "@/lib/standup/inbound";
import { buttonsForTask, parseButtonValue } from "@/lib/standup/buttons";
import { applyButtonAction } from "@/lib/standup/actions";
import { getUserByTelegramChatId } from "@/lib/db/queries";

// Telegram posts every update here. Registered once via the setup endpoint.
export const dynamic = "force-dynamic";
// Voice notes add a download + transcription hop before the assistant runs.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Reject anything not signed with our secret token.
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed, tell Telegram OK
  }

  // Button tap: EDIT the tapped message in place. This is idempotent, so a
  // double tap or a Telegram retry updates the one message instead of spamming
  // a new reply (with a fresh button set) every time.
  const cq = update.callback_query;
  if (cq) {
    await answerCallback(cq.id);
    try {
      const parsed = parseButtonValue(cq.data ?? "");
      const chatId = String(cq.message?.chat?.id ?? cq.from.id);
      const messageId = cq.message?.message_id;
      if (parsed && messageId) {
        const user = await getUserByTelegramChatId(Number(chatId));
        const outcome = await applyButtonAction(parsed, user?.id ?? null);
        // Keep the buttons unless the task is now done, so they can change it
        // again, editing the same message rather than adding new ones.
        const buttons =
          outcome.ok && parsed.action !== "done"
            ? buttonsForTask(parsed.taskId)
            : undefined;
        await editMessageText(chatId, messageId, outcome.message, buttons);
      }
    } catch (e) {
      // Never 500 back to Telegram or it will retry the update forever.
      console.error("button handling error:", (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  }

  const { inbound } = parseTelegramUpdate(update);
  if (!inbound) return NextResponse.json({ ok: true });

  // Voice note: transcribe it so the assistant handles it like typed text. If we
  // can't make it out, say so rather than staying silent.
  const voice = (update.message ?? update.edited_message)?.voice;
  if (inbound.kind === "text" && voice?.file_id) {
    let transcript = "";
    try {
      const audio = await downloadTelegramFile(voice.file_id);
      if (audio) {
        transcript = await transcribeAudio(audio, voice.mime_type ?? "audio/ogg");
      }
    } catch (e) {
      console.error("voice transcription error:", (e as Error).message);
    }
    if (!transcript) {
      await getTransport("telegram").send({
        to: inbound.from,
        text: "I couldn't make out that voice note. Mind typing it instead?",
      });
      return NextResponse.json({ ok: true });
    }
    inbound.payload = transcript;
  }

  try {
    await handleInbound(inbound);
  } catch (e) {
    console.error("inbound handling error:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
