import { NextRequest, NextResponse } from "next/server";
import { setTelegramWebhook } from "@/lib/transport/telegram";
import { requireDashboardAuth } from "@/lib/auth";
import { env } from "@/lib/env";

// One-time (idempotent) setup: point Telegram at our webhook. Call this after
// deploying, or whenever APP_URL changes. Visit while logged in, or POST with
// the dashboard cookie.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireDashboardAuth(req);
  if (denied) return denied;

  const webhookUrl = `${env.APP_URL.replace(/\/$/, "")}/api/telegram/webhook`;
  const result = await setTelegramWebhook(webhookUrl);
  return NextResponse.json({ webhookUrl, result });
}
