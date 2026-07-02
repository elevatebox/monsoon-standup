import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  answerCallback,
  editMessageText,
  parseTelegramUpdate,
} from "@/lib/transport/telegram";
import { handleInbound } from "@/lib/standup/inbound";
import { buttonsForTask, parseButtonValue } from "@/lib/standup/buttons";
import { applyButtonAction } from "@/lib/standup/actions";
import { getUserByTelegramChatId } from "@/lib/db/queries";

// Telegram posts every update here. Registered once via the setup endpoint.
export const dynamic = "force-dynamic";

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

  try {
    await handleInbound(inbound);
  } catch (e) {
    console.error("inbound handling error:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
