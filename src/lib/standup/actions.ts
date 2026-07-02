import {
  addMessage,
  getAssignmentByTaskAndUser,
  updateAssignment,
} from "@/lib/db/queries";
import { ButtonAction } from "./buttons";

export interface ActionOutcome {
  ok: boolean;
  message: string; // human-readable confirmation, channel agnostic
  taskTitle?: string;
}

// Apply a Done / Blocked / Snooze action to one person's assignment. Same effect
// whether it came from a Telegram button tap or an email one-click link. The
// action only moves that person's slice of the task, not everyone else's.
export async function applyButtonAction(
  action: ButtonAction,
  userId?: string | null
): Promise<ActionOutcome> {
  if (!userId) {
    return { ok: false, message: "We could not tell who this action is from." };
  }
  const a = await getAssignmentByTaskAndUser(action.taskId, userId);
  if (!a) {
    return { ok: false, message: "That task is no longer assigned to you." };
  }

  const now = new Date().toISOString();
  const title = a.task.title;

  if (action.action === "progress") {
    await updateAssignment(a.id, {
      status: "in_progress",
      ai_risk: "on_track",
      last_activity_at: now,
    });
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: userId,
      direction: "system",
      body: "Assignee marked their part in progress.",
    });
    return {
      ok: true,
      taskTitle: title,
      message: `Got it, "${title}" is in progress. Keep it moving.`,
    };
  }

  if (action.action === "done") {
    await updateAssignment(a.id, {
      status: "done",
      ai_risk: "on_track",
      needs_attention: false,
      ai_summary: "Marked done by the assignee.",
      last_activity_at: now,
    });
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: userId,
      direction: "system",
      body: "Assignee marked their part done.",
    });
    return {
      ok: true,
      taskTitle: title,
      message: `"${title}" is marked done for you. The agent will stop checking with you on it.`,
    };
  }

  if (action.action === "blocked") {
    await updateAssignment(a.id, {
      status: "blocked",
      ai_risk: "blocked",
      needs_attention: true,
      last_activity_at: now,
    });
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: userId,
      direction: "system",
      body: "Assignee flagged their part as blocked.",
    });
    return {
      ok: true,
      taskTitle: title,
      message: `"${title}" is flagged as blocked and raised for attention. Reply with what is blocking you and it will be passed on.`,
    };
  }

  // snooze
  const until = new Date(Date.now() + action.minutes * 60000).toISOString();
  await updateAssignment(a.id, { snoozed_until: until, last_activity_at: now });
  await addMessage({
    task_id: a.task_id,
    assignment_id: a.id,
    user_id: userId,
    direction: "system",
    body: `Assignee snoozed for ${action.minutes} min.`,
  });
  return {
    ok: true,
    taskTitle: title,
    message: `The agent will go quiet on "${title}" for a while and check back later.`,
  };
}
