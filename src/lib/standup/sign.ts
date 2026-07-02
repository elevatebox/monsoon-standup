import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

// Signs the payloads behind one-click email links so a Done or Snooze cannot be
// forged. A token is "<base64url(payload)>.<base64url(hmac)>". Payloads carry an
// expiry so an old email link cannot be replayed forever.

interface ActionPayload {
  v: string; // the button value, e.g. "done:<taskId>" or "snooze:<taskId>:120"
  u: string; // user id, so we can attribute and ack
  exp: number; // unix seconds
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function secret(): string {
  if (!env.ACTION_SECRET) {
    throw new Error("ACTION_SECRET is not set, required to sign email links.");
  }
  return env.ACTION_SECRET;
}

export function signAction(
  value: string,
  userId: string,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const payload: ActionPayload = {
    v: value,
    u: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

export function verifyAction(
  token: string
): { value: string; userId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret()).update(body).digest();
  const got = fromB64url(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromB64url(body).toString()) as ActionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { value: payload.v, userId: payload.u };
  } catch {
    return null;
  }
}
