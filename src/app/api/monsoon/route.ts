import { NextRequest, NextResponse } from "next/server";
import { runStandup } from "@/lib/standup/engine";
import { env } from "@/lib/env";

// The Monsoon trigger. Point any scheduler (cron-job.org, etc.) at this every 6
// hours to send each teammate their reminder:
//   https://monsoon-standup.vercel.app/api/monsoon?key=<CRON_SECRET>
// Auth is the same CRON_SECRET, as a ?key= query param or a Bearer header.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function trigger(req: NextRequest) {
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

// Accept GET (what most URL-only schedulers send) and POST alike.
export const GET = trigger;
export const POST = trigger;
