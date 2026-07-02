import { env } from "@/lib/env";
import { User } from "@/lib/db/types";
import { OutboundTransport, TransportName } from "./types";
import { TelegramTransport } from "./telegram";
import { WhatsAppTransport } from "./whatsapp";
import { EmailTransport } from "./email";

// One cached instance per channel.
const cache: Partial<Record<TransportName, OutboundTransport>> = {};

export function getTransport(name: TransportName): OutboundTransport {
  if (cache[name]) return cache[name]!;
  const made: OutboundTransport =
    name === "email"
      ? new EmailTransport()
      : name === "whatsapp"
      ? new WhatsAppTransport()
      : new TelegramTransport();
  cache[name] = made;
  return made;
}

// Resolve which channel to use for a person. 'auto' prefers Telegram when it is
// linked (richer, free, instant), otherwise falls back to email.
export function channelForUser(user: User): TransportName {
  if (user.preferred_channel === "telegram") return "telegram";
  if (user.preferred_channel === "email") return "email";
  // auto
  if (user.telegram_chat_id) return "telegram";
  if (user.email) return "email";
  return env.ACTIVE_TRANSPORT; // last resort default
}

// Can the agent actually reach this person on their resolved channel right now?
export function isReachable(user: User): boolean {
  const channel = channelForUser(user);
  if (channel === "telegram") return !!user.telegram_chat_id;
  if (channel === "email") return !!user.email;
  return false;
}

// The channel-native recipient id for a person on a given channel.
export function recipientFor(user: User, channel: TransportName): string {
  if (channel === "telegram") return String(user.telegram_chat_id ?? "");
  if (channel === "email") return user.email ?? "";
  return "";
}

export * from "./types";
