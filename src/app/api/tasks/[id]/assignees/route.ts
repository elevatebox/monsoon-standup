import { NextRequest, NextResponse } from "next/server";
import { addAssignments } from "@/lib/db/queries";
import { notifyUserDigest } from "@/lib/standup/engine";
import { requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Add one or more people to an existing task. Each newly added person gets the
// same immediate assignment notice a creation-time assignee would.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.user_ids)
    ? body.user_ids
    : body.user_id
    ? [body.user_id]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "user_ids required" }, { status: 400 });
  }

  const assignments = await addAssignments(id, ids);
  // One digest per newly-added person, covering all their open tasks.
  const userIds = [...new Set(assignments.map((a) => a.user_id))];
  await Promise.all(userIds.map((uid) => notifyUserDigest(uid)));

  return NextResponse.json({ assignments });
}
