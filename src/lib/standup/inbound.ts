import {
  addAssignments,
  addMessage,
  createTask,
  getAssignmentByTaskAndUser,
  getLatestOpenAssignmentForUser,
  getOpenAssignmentsForUser,
  getUserByEmail,
  getUserByOnboardingToken,
  getUserByTelegramChatId,
  linkTelegram,
  listAssignments,
  listUsers,
  updateAssignment,
} from "@/lib/db/queries";
import { User } from "@/lib/db/types";
import { assistantReply } from "@/lib/ai/assistant";
import { getDevActivity } from "@/lib/dev/github";
import { getTransport } from "@/lib/transport";
import { NormalizedInbound, ReplyButton, TransportName } from "@/lib/transport/types";
import { buttonsForTask, parseButtonValue } from "./buttons";
import { applyButtonAction } from "./actions";
import { notifyUserDigest } from "./engine";

export interface InboundResult {
  handled: boolean;
  note: string;
}

// The single entry point every channel's webhook funnels into. Channel-agnostic:
// it only sees NormalizedInbound. Telegram and email both call it; the inbound
// carries its channel so acks go back the same way and the user lookup uses the
// right key.
export async function handleInbound(
  inbound: NormalizedInbound
): Promise<InboundResult> {
  switch (inbound.kind) {
    case "start":
      return handleStart(inbound); // telegram only
    case "button":
      return handleButton(inbound);
    case "text":
      return handleText(inbound);
    default:
      return { handled: false, note: "unknown inbound kind" };
  }
}

// Reply back on whatever channel the message came in on.
async function reply(
  channel: TransportName,
  to: string,
  text: string,
  buttons?: ReplyButton[][]
): Promise<void> {
  await getTransport(channel).send({ to, text, buttons });
}

// Find the user behind an inbound, by the channel-appropriate key.
async function findUser(inbound: NormalizedInbound): Promise<User | null> {
  if (inbound.channel === "email") {
    return getUserByEmail(inbound.from);
  }
  // telegram (and any chat-id channel)
  return getUserByTelegramChatId(Number(inbound.from));
}

// ---- /start <token>: bind a Telegram chat to a user ----------------------

async function handleStart(inbound: NormalizedInbound): Promise<InboundResult> {
  const chatId = Number(inbound.from);

  const existing = await getUserByTelegramChatId(chatId);
  if (existing) {
    await reply(
      "telegram",
      inbound.from,
      `You're already set up, ${existing.name}. I'll message you here when there's a task to check on.`
    );
    return { handled: true, note: "already linked" };
  }

  const token = inbound.payload.trim();
  if (!token) {
    await reply(
      "telegram",
      inbound.from,
      "To connect, please use the personal link your admin shared with you."
    );
    return { handled: true, note: "start without token" };
  }

  const user = await getUserByOnboardingToken(token);
  if (!user) {
    await reply(
      "telegram",
      inbound.from,
      "That link is not valid. Please ask your admin for a new one."
    );
    return { handled: true, note: "invalid token" };
  }

  await linkTelegram(user.id, chatId);
  await reply(
    "telegram",
    inbound.from,
    `Connected, ${user.name}. From now on I'll check in here on your tasks, and you can answer right in this chat. Use the buttons to mark a task Done or Blocked.`
  );
  return { handled: true, note: `linked user ${user.id}` };
}

// ---- Button taps (Telegram) ----------------------------------------------

async function handleButton(inbound: NormalizedInbound): Promise<InboundResult> {
  const parsed = parseButtonValue(inbound.payload);
  if (!parsed) return { handled: false, note: "unparseable button" };

  const user = await findUser(inbound);
  const outcome = await applyButtonAction(parsed, user?.id ?? null);
  // Keep the buttons handy unless the task is now done.
  const buttons =
    outcome.ok && parsed.action !== "done" ? buttonsForTask(parsed.taskId) : undefined;
  await reply(inbound.channel, inbound.from, outcome.message, buttons);
  return { handled: outcome.ok, note: `button ${parsed.action}` };
}

// ---- Free-text replies: route to a task, let the AI update state ----------

async function handleText(inbound: NormalizedInbound): Promise<InboundResult> {
  const user = await findUser(inbound);
  if (!user) {
    await reply(
      inbound.channel,
      inbound.from,
      inbound.channel === "email"
        ? "We could not match your email to a tracked teammate, so there was nothing to update."
        : "I don't recognise this chat yet. Please connect using the personal link from your admin."
    );
    return { handled: true, note: "unknown sender" };
  }

  // The assistant sees the person's tasks, the whole team's tasks, dev activity
  // and the team roster, then answers, records an update, or creates a task.
  const [myTasks, teamTasks, dev, users] = await Promise.all([
    getOpenAssignmentsForUser(user.id),
    listAssignments(),
    getDevActivity(14),
    listUsers(),
  ]);

  const res = await assistantReply({
    user,
    message: inbound.payload,
    myTasks,
    teamTasks,
    dev,
    teamNames: users.map((u) => u.name),
  });

  // CREATE a task straight from chat.
  if (res.action === "create" && res.create) {
    const c = res.create;
    const assignee =
      users.find(
        (u) => u.name.toLowerCase() === (c.assignee || user.name).toLowerCase()
      ) ?? user;
    const { task } = await createTask({
      title: c.title,
      description: c.description,
      track: c.track,
      priority: c.priority || 2,
      created_by: user.name,
    });
    await addAssignments(task.id, [assignee.id]);
    // Tell the assignee about their new task, unless the creator took it themselves.
    if (assignee.id !== user.id) {
      await notifyUserDigest(assignee.id).catch(() => {});
    }
    if (inbound.channel !== "email") {
      await reply(inbound.channel, inbound.from, res.reply, buttonsForTask(task.id));
    }
    return { handled: true, note: `assistant:create ${task.id}` };
  }

  // RECORD an update against the person's current task.
  let currentTaskId: string | null = null;
  if (res.action === "update" && res.update) {
    const target =
      (inbound.threadTaskId
        ? await getAssignmentByTaskAndUser(inbound.threadTaskId, user.id)
        : null) ?? (await getLatestOpenAssignmentForUser(user.id));
    if (target) {
      currentTaskId = target.task_id;
      await addMessage({
        task_id: target.task_id,
        assignment_id: target.id,
        user_id: user.id,
        direction: "inbound",
        channel: inbound.channel === "email" ? "email" : "telegram",
        body: inbound.payload,
        attachments: inbound.attachments,
        provider_msg_id: inbound.providerMessageId ?? null,
      });
      await updateAssignment(target.id, {
        status: res.update.status,
        ai_summary: res.update.summary,
        ai_risk: res.update.risk,
        needs_attention: res.update.needs_attention,
        last_activity_at: new Date().toISOString(),
      });
    }
  }

  // Buttons only when the reply is actually about a task the person just moved
  // (an update). General chat, questions, and greetings get a plain reply.
  // Email stays quiet to avoid reply loops.
  if (inbound.channel !== "email") {
    await reply(
      inbound.channel,
      inbound.from,
      res.reply,
      currentTaskId ? buttonsForTask(currentTaskId) : undefined
    );
  }

  return { handled: true, note: `assistant:${res.action}` };
}
