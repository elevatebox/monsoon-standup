import { NextRequest, NextResponse } from "next/server";
import { createUser, listUsers } from "@/lib/db/queries";
import { requireActor, requireDashboardAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireDashboardAuth(req);
  if (denied) return denied;
  const users = await listUsers();
  return NextResponse.json({ users });
}

// Any teammate (via their /u link) or the admin can add a new team member.
export async function POST(req: NextRequest) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const user = await createUser({
    name: body.name,
    email: body.email,
    role: body.role,
  });
  return NextResponse.json({ user });
}
