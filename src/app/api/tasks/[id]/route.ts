import { NextRequest, NextResponse } from "next/server";
import { getTaskWithAssignments, updateTask } from "@/lib/db/queries";
import { requireActor, requireDashboardAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireDashboardAuth(req);
  if (denied) return denied;
  const { id } = await params;
  const task = await getTaskWithAssignments(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task });
}

// Edits the shared brief only. Per-person state (status, agent, snooze) is
// changed via /api/assignments/[id].
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.due_at !== undefined) patch.due_at = body.due_at || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const task = await updateTask(id, patch as never);
  return NextResponse.json({ task });
}
