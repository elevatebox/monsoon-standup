import { NextRequest, NextResponse } from "next/server";
import { removeAssignment, updateAssignment } from "@/lib/db/queries";
import { requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Per-person controls: drag-drop status change, agent on/off, snooze, attention.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.agent_enabled !== undefined) patch.agent_enabled = body.agent_enabled;
  if (body.needs_attention !== undefined)
    patch.needs_attention = body.needs_attention;
  if (body.snoozed_until !== undefined) patch.snoozed_until = body.snoozed_until;
  // A manual status change counts as activity, so the agent honours the quiet
  // window after a drag instead of immediately re-pinging.
  if (body.status !== undefined) patch.last_activity_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const assignment = await updateAssignment(id, patch as never);
  return NextResponse.json({ assignment });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  await removeAssignment(id);
  return NextResponse.json({ ok: true });
}
