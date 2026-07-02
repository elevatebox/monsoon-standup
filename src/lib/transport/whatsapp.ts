import {
  OutboundMessage,
  OutboundTransport,
  SendResult,
} from "./types";

// ============================================================================
// WhatsApp transport (NOT WIRED YET).
//
// This is a placeholder that implements the same OutboundTransport interface
// as Telegram. When you are ready to add WhatsApp (for example to reuse the
// Monsoon Cloud API number, or to message people outside Telegram), implement
// send() against your provider and add an inbound webhook at
//   src/app/api/whatsapp/webhook/route.ts
// that normalizes provider payloads into NormalizedInbound and calls the same
// handleInbound() in src/lib/standup/inbound.ts. Nothing else changes.
//
// Notes that bite you on WhatsApp but not Telegram:
//   - The first message to a user outside the 24h window must be an approved
//     template. After any user reply you have a 24h free-form window.
//     So map question.text to a template when the window is closed, and to a
//     plain text message when it is open.
//   - Inline buttons exist as interactive "reply buttons" (max 3) on Cloud API.
//     Map ReplyButton -> interactive button objects, keep button values inside
//     your own id field so the webhook can read them back.
//   - Provider options: Cloud API direct, or AiSensy / Interakt / Twilio on top.
// ============================================================================

export class WhatsAppTransport implements OutboundTransport {
  name = "whatsapp" as const;

  async send(_msg: OutboundMessage): Promise<SendResult> {
    return {
      ok: false,
      error:
        "WhatsApp transport not implemented. Set ACTIVE_TRANSPORT=telegram, or implement WhatsAppTransport.send().",
    };
  }
}
