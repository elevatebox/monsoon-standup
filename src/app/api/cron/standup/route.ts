import { NextRequest, NextResponse } from "next/server";
import { runStandup } from "@/lib/standup/engine";
import { env } from "@/lib/env";

// Vercel Cron hits this on a schedule (see vercel.json). It sends
// Authorization: Bearer <CRON_SECRET>. You can also trigger it manually with
// the same header to test.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds; raise on Pro if you have many tasks

export async function GET(req: NextRequest) {
  // Accept the secret either as a Bearer header (Vercel Cron does this
  // automatically) or as a ?key= query param, so any hosted cron service that
  // only takes a URL can trigger it too.
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  const ok = auth === `Bearer ${env.CRON_SECRET}` || key === env.CRON_SECRET;
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runStandup();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
