import { env } from "@/lib/env";
import { Attachment } from "@/lib/db/types";
import {
  NormalizedInbound,
  OutboundMessage,
  OutboundTransport,
  ReplyButton,
  SendResult,
} from "./types";

function inlineKeyboard(buttons?: ReplyButton[][]) {
  return buttons
    ? {
        inline_keyboard: buttons.map((row) =>
          row.map((b) => ({ text: b.label, callback_data: b.value }))
        ),
      }
    : undefined;
}

const API = (method: string) =>
  `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

// ---- Outbound -------------------------------------------------------------

export class TelegramTransport implements OutboundTransport {
  name = "telegram" as const;

  async send(msg: OutboundMessage): Promise<SendResult> {
    const reply_markup = inlineKeyboard(msg.buttons);

    try {
      const res = await fetch(API("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: msg.to,
          text: msg.text,
          parse_mode: "HTML",
          reply_markup,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        return { ok: false, error: data.description ?? "telegram send failed" };
      }
      return { ok: true, providerMessageId: String(data.result.message_id) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// Edit a message in place (used on a button tap so the tapped message updates
// instead of a new message being sent for every tap). Plain text, since the
// confirmations are prose. Ignores Telegram's "not modified" on a repeat tap.
export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  buttons?: ReplyButton[][]
): Promise<void> {
  try {
    const res = await fetch(API("editMessageText"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: inlineKeyboard(buttons),
      }),
    });
    const data = await res.json();
    if (!data.ok && !String(data.description ?? "").includes("not modified")) {
      console.error("editMessageText failed:", data.description);
    }
  } catch (e) {
    console.error("editMessageText error:", (e as Error).message);
  }
}

// Acknowledge a tapped inline button so the loading spinner on the user's side
// stops. Telegram requires this within a few seconds.
export async function answerCallback(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    await fetch(API("answerCallbackQuery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {
    // best effort, not worth failing the request over
  }
}

// ---- Webhook management (run once during setup) ---------------------------

export async function setTelegramWebhook(url: string): Promise<unknown> {
  const res = await fetch(API("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "callback_query"],
    }),
  });
  return res.json();
}

// ---- Inbound parsing ------------------------------------------------------

// Turn a raw Telegram update into our channel-agnostic NormalizedInbound.
// Returns null for updates we do not handle.
export function parseTelegramUpdate(update: any): {
  inbound: NormalizedInbound | null;
  callbackQueryId?: string;
} {
  // Button tap
  if (update.callback_query) {
    const cq = update.callback_query;
    return {
      callbackQueryId: cq.id,
      inbound: {
        kind: "button",
        channel: "telegram",
        from: String(cq.from.id),
        payload: cq.data ?? "",
        attachments: [],
      },
    };
  }

  // Handle both fresh messages and edits (press up in Telegram to edit).
  const message = update.message ?? update.edited_message;
  if (!message) return { inbound: null };

  const from = String(message.chat.id);
  const text: string = message.text ?? message.caption ?? "";

  // /start <token>  ->  onboarding
  if (text.startsWith("/start")) {
    const token = text.split(/\s+/)[1] ?? "";
    return {
      inbound: {
        kind: "start",
        channel: "telegram",
        from,
        payload: token,
        attachments: [],
        providerMessageId: String(message.message_id),
      },
    };
  }

  // A normal reply, possibly with a document, photo, or urls in the text.
  const attachments = extractAttachments(message, text);

  return {
    inbound: {
      kind: "text",
      channel: "telegram",
      from,
      payload: text,
      attachments,
      providerMessageId: String(message.message_id),
    },
  };
}

function extractAttachments(message: any, text: string): Attachment[] {
  const out: Attachment[] = [];

  if (message.document) {
    out.push({
      kind: "file",
      file_id: message.document.file_id,
      name: message.document.file_name,
      caption: message.caption,
    });
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    // photo is an array of sizes, last is the largest
    const largest = message.photo[message.photo.length - 1];
    out.push({ kind: "photo", file_id: largest.file_id, caption: message.caption });
  }

  // Pull any urls out of the text so links to PRs, docs, builds get captured.
  const urls = text.match(/https?:\/\/[^\s]+/g) ?? [];
  for (const url of urls) out.push({ kind: "link", url });

  return out;
}
