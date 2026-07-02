import { Attachment } from "@/lib/db/types";

// ============================================================================
// The transport seam.
//
// Everything above the transport (the standup engine, the inbound processor)
// speaks ONLY this interface. Telegram is the implementation today. WhatsApp,
// Slack, or anything else can be added later by writing another class that
// implements OutboundTransport and a webhook that normalizes inbound events
// into NormalizedInbound. Nothing else has to change.
// ============================================================================

export type TransportName = "telegram" | "whatsapp" | "email";

// One reply button shown under a question. value is what comes back when tapped.
export interface ReplyButton {
  label: string;
  value: string; // e.g. "done:<taskId>" or "snooze:<taskId>:120"
}

export interface OutboundMessage {
  // Channel-native recipient id. For Telegram this is the chat_id, for email
  // it is the recipient address.
  to: string;
  text: string;
  buttons?: ReplyButton[][]; // rows of buttons, optional
  // Extra context some channels need. Telegram ignores this; email uses it to
  // sign per-user action links and to set a useful subject.
  meta?: {
    userId?: string;
    title?: string;
    // A link to the no-login reply page, where the person can add a richer
    // update (chips, ETA, free text, voice). Rendered as a primary button.
    replyUrl?: string;
    // For a per-person digest: every open task for this person in one message,
    // each with its own update link. When present, the email renders this list.
    tasks?: { title: string; status: string; url: string }[];
  };
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface OutboundTransport {
  name: TransportName;
  send(msg: OutboundMessage): Promise<SendResult>;
}

// A channel-agnostic inbound event. Each webhook converts its provider payload
// into this, then hands it to the shared inbound processor.
export type InboundKind = "text" | "button" | "start";

export interface NormalizedInbound {
  kind: InboundKind;
  // Which channel this arrived on, so acks go back the same way and the user
  // lookup uses the right key (chat id for telegram, email address for email).
  channel: TransportName;
  // Channel-native sender id (Telegram chat_id as string, or email address).
  from: string;
  // For kind = "text": the message body. For "button": the button value.
  // For "start": the onboarding token from the deep link, if present.
  payload: string;
  attachments: Attachment[];
  providerMessageId?: string;
  // Optional task this message is about, when the channel can tell us directly
  // (for example an email reply to a plus-addressed task+<id>@... address).
  threadTaskId?: string;
}
