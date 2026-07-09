import { NextRequest, NextResponse } from "next/server";
import { updateUser } from "@/lib/db/queries";
import { requireDashboardAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireDashboardAuth(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (body.preferred_channel !== undefined)
    patch.preferred_channel = body.preferred_channel;
  if (body.email !== undefined) patch.email = body.email || null;
  if (body.role !== undefined) patch.role = body.role || null;
  if (body.name !== undefined) patch.name = body.name;
  if (body.active !== undefined) patch.active = body.active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const user = await updateUser(id, patch as never);
  return NextResponse.json({ user });
}
