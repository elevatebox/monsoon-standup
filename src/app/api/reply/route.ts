import { NextRequest, NextResponse } from "next/server";
import { verifyAction } from "@/lib/standup/sign";
import {
  addMessage,
  getAssignment,
  getThreadForAssignment,
  updateAssignment,
  updateTask,
} from "@/lib/db/queries";
import { processReply } from "@/lib/ai/agent";
import { TaskRisk, TaskStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

// Maps a quick-reply chip to a status + risk. These are the "low-risk" actions
// that auto-apply with no founder approval.
const CHIPS: Record<
  string,
  { status?: TaskStatus; risk: TaskRisk; needs_attention: boolean; note: string }
> = {
  on_track: { status: "in_progress", risk: "on_track", needs_attention: false, note: "On track" },
  slipping: { risk: "slipping", needs_attention: false, note: "Slipping" },
  blocked: { status: "blocked", risk: "blocked", needs_attention: true, note: "Blocked" },
  done: { status: "done", risk: "on_track", needs_attention: false, note: "Done" },
};

// The no-login reply endpoint. Auth is the signed token, not the dashboard cookie.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const verified = body?.token ? verifyAction(body.token) : null;
  if (!verified || !verified.value.startsWith("reply:")) {
    return NextResponse.json({ error: "invalid or expired link" }, { status: 401 });
  }
  const assignmentId = verified.value.slice("reply:".length);
  const a = await getAssignment(assignmentId);
  if (!a || a.user_id !== verified.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const text: string = (body.text ?? "").trim();
  const chip: string | undefined = body.chip;
  const dueAt: string | null = body.due_at ?? null;

  // ETA: shared task deadline (low-risk, auto-apply).
  if (dueAt) await updateTask(a.task_id, { due_at: dueAt });

  // Free text (typed or transcribed): the AI reads it and updates this person's
  // state. Low-risk fields auto-apply.
  if (text) {
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: a.user_id,
      direction: "inbound",
      channel: "email",
      body: text,
    });
    const thread = await getThreadForAssignment(a.id);
    const update = await processReply(a, thread, text);
    // If they also tapped a status chip, their explicit pick wins over the AI's
    // inference; the AI still writes the summary from their remark.
    const c = chip && CHIPS[chip] ? CHIPS[chip] : null;
    const status = c?.status ?? update.status;
    await updateAssignment(a.id, {
      status,
      ai_summary: update.summary,
      ai_risk: c ? c.risk : update.risk,
      needs_attention: c ? c.needs_attention : update.needs_attention,
      last_activity_at: now,
    });
    return NextResponse.json({ ok: true, status, summary: update.summary });
  }

  // Chip only (no text): apply the mapping directly.
  if (chip && CHIPS[chip]) {
    const c = CHIPS[chip];
    await updateAssignment(a.id, {
      ...(c.status ? { status: c.status } : {}),
      ai_risk: c.risk,
      needs_attention: c.needs_attention,
      last_activity_at: now,
    });
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: a.user_id,
      direction: "system",
      channel: "email",
      body: `Tapped "${c.note}".`,
    });
    return NextResponse.json({ ok: true, status: c.status ?? a.status, note: c.note });
  }

  if (dueAt) {
    return NextResponse.json({ ok: true, note: "ETA updated" });
  }
  return NextResponse.json({ error: "nothing to record" }, { status: 400 });
}
