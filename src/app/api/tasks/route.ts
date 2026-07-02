import { NextRequest, NextResponse } from "next/server";
import { createTask, listAssignments } from "@/lib/db/queries";
import { notifyUserDigest } from "@/lib/standup/engine";
import { requireActor, requireDashboardAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireDashboardAuth(req);
  if (denied) return denied;
  const assignments = await listAssignments();
  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Accept one or many assignees. assignee_ids is preferred; assignee_id kept
  // for backward compatibility.
  const ids: string[] = Array.isArray(body.assignee_ids)
    ? body.assignee_ids
    : body.assignee_id
    ? [body.assignee_id]
    : [];

  // Record who assigned it: a teammate by name, or "Charan" (admin/owner).
  const createdBy = actor.kind === "user" ? actor.user.name : "Charan";

  const { task, assignments } = await createTask({
    title: body.title,
    description: body.description,
    assignee_ids: ids,
    priority: body.priority,
    track: body.track,
    due_at: body.due_at || null,
    created_by: createdBy,
  });

  // Fire one digest per assignee immediately, covering ALL their open tasks (not
  // one email per task). Dedupe in case the same person was added twice.
  const userIds = [...new Set(assignments.map((a) => a.user_id))];
  const notified = await Promise.all(
    userIds.map(async (uid) => ({ user: uid, ...(await notifyUserDigest(uid)) }))
  );

  return NextResponse.json({ task, assignments, notified });
}
