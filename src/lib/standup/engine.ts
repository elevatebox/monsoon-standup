import {
  addMessage,
  getDueAssignments,
  getOpenAssignmentsForUser,
  recordAiRun,
  updateAssignment,
} from "@/lib/db/queries";
import { AssignmentContext } from "@/lib/db/types";
import {
  channelForUser,
  getTransport,
  isReachable,
  recipientFor,
} from "@/lib/transport";
import { signAction } from "./sign";
import { buttonsForTask } from "./buttons";
import { askText } from "@/lib/ai/anthropic";
import { REMINDER_SYSTEM, reminderUser } from "@/lib/ai/prompts";
import { env } from "@/lib/env";

// The cadence. Each person gets one reminder covering all their open tasks every
// 6 hours. An external scheduler fires the cron on that cadence; this floor just
// guards against an accidental double-fire (we won't re-remind within ~5.5h).
const REMINDER_MS = 5.5 * 60 * 60 * 1000;

export interface StandupSummary {
  considered: number; // people considered
  asked: number; // digests sent
  skipped: number; // people not yet due
  unreachable: number;
  errors: { userId: string; error: string }[];
}

// A long-lived signed link to the no-login reply page for one assignment.
function replyUrlFor(assignmentId: string, userId: string): string {
  const token = signAction(`reply:${assignmentId}`, userId, 60 * 60 * 24 * 30);
  return `${env.APP_URL.replace(/\/$/, "")}/r/${encodeURIComponent(token)}`;
}

// Is this person due for a reminder, given all their eligible (open, agent-on,
// un-snoozed) assignments? Anchored on their MOST RECENT ask, so the whole person
// has one 6-hour rhythm rather than one timer per task.
function personDue(group: AssignmentContext[], now: number): boolean {
  const lastAsked = Math.max(
    ...group.map((a) => (a.last_asked_at ? new Date(a.last_asked_at).getTime() : 0))
  );
  if (lastAsked === 0) return true; // never asked
  return now - lastAsked >= REMINDER_MS;
}

function personReason(group: AssignmentContext[]): string {
  const lastAsked = Math.max(
    ...group.map((a) => (a.last_asked_at ? new Date(a.last_asked_at).getTime() : 0))
  );
  return lastAsked === 0 ? "first reminder" : "6-hour reminder";
}

// Run one standup pass. The trigger (cron/GitHub Action) calls this. Operates per
// person: each due person gets ONE digest covering all their open tasks.
export async function runStandup(): Promise<StandupSummary> {
  const assignments = await getDueAssignments();

  // Group eligible assignments by person.
  const byUser = new Map<string, AssignmentContext[]>();
  for (const a of assignments) {
    if (!a.user) continue;
    const g = byUser.get(a.user_id) ?? [];
    g.push(a);
    byUser.set(a.user_id, g);
  }

  const summary: StandupSummary = {
    considered: byUser.size,
    asked: 0,
    skipped: 0,
    unreachable: 0,
    errors: [],
  };

  const now = Date.now();
  for (const [userId, group] of byUser) {
    try {
      if (!isReachable(group[0].user)) {
        summary.unreachable++;
        continue;
      }
      if (!personDue(group, now)) {
        summary.skipped++;
        continue;
      }

      const reason = personReason(group);
      const sent = await sendDigest(group);
      for (const a of group) {
        await recordAiRun({
          task_id: a.task_id,
          assignment_id: a.id,
          decision: "ask",
          question: `(digest of ${group.length} task${group.length === 1 ? "" : "s"})`,
          reasoning: reason,
          model: env.AGENT_MODEL,
        });
      }
      if (!sent.ok) {
        summary.errors.push({ userId, error: sent.error! });
        continue;
      }
      summary.asked++;
    } catch (e) {
      summary.errors.push({ userId, error: (e as Error).message });
    }
  }

  return summary;
}

// Send the first digest the moment a person is assigned work. One email covering
// all their open tasks, not one per task. Called on task creation / assignment.
export async function notifyUserDigest(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const all = await getOpenAssignmentsForUser(userId);
  const eligible = all.filter(
    (a) =>
      a.agent_enabled &&
      !(a.snoozed_until && new Date(a.snoozed_until) > new Date())
  );
  if (eligible.length === 0) return { ok: false, error: "no eligible tasks" };
  if (!isReachable(eligible[0].user)) {
    return { ok: false, error: "assignee not reachable on any channel" };
  }
  return sendDigest(eligible);
}

// One message to one person covering all the given tasks. Each task carries its
// own update link. Logs one outbound per task and stamps the cadence clock.
async function sendDigest(
  group: AssignmentContext[]
): Promise<{ ok: boolean; error?: string }> {
  const user = group[0].user;
  const channel = channelForUser(user);
  const transport = getTransport(channel);
  const to = recipientFor(user, channel);

  // Claude writes the check-in from the person's actual open tasks.
  const header = await composeReminder(user.name, group);

  const tasks = group.map((a) => ({
    title: a.task.title,
    status: a.status,
    url: replyUrlFor(a.id, user.id),
  }));

  // Telegram caps messages at 4096 chars, so a person with many open tasks would
  // blow the limit if we inlined a signed link per task. List the titles (capped)
  // and point at their board instead. Email renders meta.tasks itself.
  const MAX_LIST = 10;
  const boardUrl = `${env.APP_URL.replace(/\/$/, "")}/u/${user.onboarding_token}`;
  const list = group
    .slice(0, MAX_LIST)
    .map((a) => `• ${escapeHtml(a.task.title)}`)
    .join("\n");
  const more =
    group.length > MAX_LIST ? `\n…and ${group.length - MAX_LIST} more` : "";
  const text =
    channel === "telegram"
      ? `${escapeHtml(header)}\n\n${list}${more}\n\nReply here with an update, or open your board:\n${boardUrl}`
      : header;

  const result = await transport.send({
    to,
    text,
    // A single-task check-in gets tap-to-update buttons.
    buttons: group.length === 1 ? buttonsForTask(group[0].task_id) : undefined,
    meta: { userId: user.id, title: "your tasks", tasks },
  });

  const now = new Date().toISOString();
  for (const a of group) {
    await addMessage({
      task_id: a.task_id,
      assignment_id: a.id,
      user_id: user.id,
      direction: "outbound",
      channel,
      body: header,
    });
    await updateAssignment(a.id, { last_asked_at: now });
  }

  if (!result.ok) {
    return { ok: false, error: `digest send failed on ${channel}: ${result.error}` };
  }
  return { ok: true };
}

// Ask Claude to write the check-in from the person's real tasks. Falls back to a
// plain line if the model call fails, so a reminder always goes out.
async function composeReminder(
  name: string,
  group: AssignmentContext[]
): Promise<string> {
  const tasks = group.map((a) => ({ title: a.task.title, status: a.status }));
  try {
    const text = await askText({
      system: REMINDER_SYSTEM,
      user: reminderUser(name, tasks),
      maxTokens: 300,
    });
    if (text) return text;
  } catch (e) {
    console.error("reminder compose failed:", (e as Error).message);
  }
  const first = name.split(/\s+/)[0];
  return group.length === 1
    ? `Hi ${first}, quick check on your task, where does it stand and what's your ETA?`
    : `Hi ${first}, quick check on your ${group.length} tasks, where does each stand and what's the ETA?`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
