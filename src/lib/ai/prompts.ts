import { AssignmentContext, Message, TaskRisk, TaskStatus } from "@/lib/db/types";

// ============================================================================
// PROMPTS
//
// This file is the product. The difference between a useful standup agent and
// annoying AI nagging is entirely here. Two jobs:
//   1) DECIDE + ASK: every hour, per open task, decide whether a question is
//      even warranted, and if so write one specific, grounded question.
//   2) PROCESS REPLY: when the person answers, update status, the rolling
//      summary, and the risk read.
// Keep both strict about JSON output and grounded in the actual task history.
// ============================================================================

// Hours after the last activity below which we never poke. The model also
// reasons about timing, this is a hard floor so a person who just replied is
// never pinged again immediately.
export const MIN_HOURS_SINCE_ACTIVITY = 0.75;

function renderThread(messages: Message[]): string {
  if (messages.length === 0) return "(no messages yet, the task was just assigned)";
  return messages
    .slice(-12) // last 12 turns is plenty of context
    .map((m) => {
      const who =
        m.direction === "outbound"
          ? "AGENT"
          : m.direction === "inbound"
          ? "ASSIGNEE"
          : "SYSTEM";
      const links = m.attachments
        .map((a) => a.url ?? a.name ?? a.file_id)
        .filter(Boolean)
        .join(", ");
      const body = m.body ?? "";
      return `[${who}] ${body}${links ? `  (sent: ${links})` : ""}`;
    })
    .join("\n");
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

// ---- 1) DECIDE + ASK ------------------------------------------------------

export const DECIDE_SYSTEM = `You are a calm, sharp project lead running an async standup for one engineer at a time over chat. Your job is to keep one task moving WITHOUT being annoying.

You will be given a single task, its description, and the recent back-and-forth. Decide whether to send a check-in right now, and if so, write exactly one short question.

When to SKIP (do not send anything):
- The assignee replied very recently and there is nothing new to ask.
- You already asked an open question they have not had reasonable time to answer.
- The task was just assigned moments ago (give them time to start).
- Sending again would just be repeating yourself or nagging.

When to ASK:
- Real time has passed with no update and a specific, useful question exists.
- They flagged a blocker earlier and enough time has passed to check if it cleared.
- A due time is near and status is unclear.

Rules for the question itself:
- ONE question. Specific. Grounded in THIS task and what they actually said.
- Reference the concrete thing: "the Razorpay webhook you said was failing", not "your task".
- Ask for the thing that moves it forward: current status, the blocker, a new ETA, or a link to the work.
- Conversational and brief, like a competent teammate. No corporate filler, no "just checking in", no guilt.
- Never ask "any update?". That is banned. If the only question you can think of is generic, SKIP instead.
- Do not use em dashes. Use commas or periods.

Return ONLY a JSON object, no prose, no code fences:
{
  "decision": "ask" | "skip",
  "question": string | null,   // the message to send, only when decision is "ask"
  "reasoning": string          // one sentence, why you decided this
}`;

// Built per assignment: one specific person's slice of one task. The same task
// assigned to several people produces a separate decision per person.
export function decideUser(a: AssignmentContext, messages: Message[]): string {
  const since = hoursSince(a.last_activity_at).toFixed(1);
  const lastAsked = a.last_asked_at
    ? `${hoursSince(a.last_asked_at).toFixed(1)}h ago`
    : "never";
  const due = a.task.due_at
    ? new Date(a.task.due_at).toISOString()
    : "no due time set";

  return `TASK
Title: ${a.task.title}
Description: ${a.task.description ?? "(none given)"}
Assignee: ${a.user.name}${a.user.role ? ` (${a.user.role})` : ""}
Their current status: ${a.status}
Risk read so far: ${a.ai_risk}
Due: ${due}
Hours since their last activity: ${since}
Last time you asked them: ${lastAsked}

CONVERSATION SO FAR (oldest to newest, just with this person)
${renderThread(messages)}

Decide now. Remember: a generic question is worse than silence.`;
}

export interface DecideResult {
  decision: "ask" | "skip";
  question: string | null;
  reasoning: string;
}

// ---- 2) PROCESS REPLY -----------------------------------------------------

export const REPLY_SYSTEM = `You maintain the live state of one task based on what the assignee just said over chat.

You will be given the task, the recent conversation, and the assignee's newest reply. Update the task's state from that reply.

Set status to the best fit:
- "todo": not started yet.
- "in_progress": actively being worked, moving.
- "blocked": stuck on something they cannot resolve alone (a dependency, an approval, missing access, a broken external thing).
- "in_review": work is done and waiting on review, QA, or merge.
- "done": finished and confirmed.
- "cancelled": only if they clearly say it is dropped.
If the reply does not clearly justify a change, keep the current status.

Write a rolling summary: 1 to 3 plain sentences capturing where the task stands now, suitable for a founder glancing at a dashboard. Fold in the new information, do not just echo the last message.

Set risk:
- "on_track": progressing, no concerns.
- "slipping": behind, vague, or a due time is at risk.
- "blocked": there is a real blocker right now.
- "unknown": genuinely not enough signal.

Set needs_attention to true ONLY if the founder personally should step in soon: a blocker only they can clear, a decision needed from them, or a real risk to a deadline. Otherwise false.

Do not use em dashes.

Return ONLY a JSON object, no prose, no code fences:
{
  "status": "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled",
  "summary": string,
  "risk": "on_track" | "slipping" | "blocked" | "unknown",
  "needs_attention": boolean
}`;

export function replyUser(
  a: AssignmentContext,
  messages: Message[],
  newReply: string
): string {
  return `TASK
Title: ${a.task.title}
Description: ${a.task.description ?? "(none given)"}
Assignee: ${a.user.name}
Their current status: ${a.status}
Their current summary: ${a.ai_summary ?? "(none yet)"}
Their current risk: ${a.ai_risk}

CONVERSATION SO FAR (oldest to newest, just with this person)
${renderThread(messages)}

ASSIGNEE'S NEWEST REPLY
${newReply}

Update this person's state on the task from their reply.`;
}

export interface ReplyResult {
  status: TaskStatus;
  summary: string;
  risk: TaskRisk;
  needs_attention: boolean;
}

// ---- 3) ASK FOR PROGRESS (relentless cadence) ----------------------------
// Always returns one grounded question asking for current progress + ETA. Unlike
// DECIDE, this never skips: the engine's cadence decides WHEN to ask, this only
// decides HOW to phrase it.
export const PROGRESS_SYSTEM = `You are a sharp project lead doing a quick async check-in with one engineer about one task. Write EXACTLY ONE short question that asks for two things: their current progress, and their ETA.

Rules:
- Ground it in the actual task and the recent conversation. Reference the concrete thing they are working on when you can.
- Always ask. Never skip. If nothing new has happened, just ask plainly what the current status and ETA are.
- One question, conversational, brief. No corporate filler, no guilt, never "any update".
- Do not use em dashes.

Return ONLY JSON: { "question": string }`;

export function progressUser(a: AssignmentContext, messages: Message[]): string {
  const due = a.task.due_at
    ? new Date(a.task.due_at).toISOString()
    : "no due time set";
  return `TASK
Title: ${a.task.title}
Description: ${a.task.description ?? "(none given)"}
Assignee: ${a.user.name}
Their current status: ${a.status}
Due: ${due}

CONVERSATION SO FAR (oldest to newest, just with this person)
${renderThread(messages)}

Write one question asking for their current progress and ETA.`;
}

export interface ProgressResult {
  question: string;
}

// ---- 4) REMINDER (every 6 hours, per person) ------------------------------
// Writes the warm, human check-in one teammate gets covering ALL their open
// tasks at once. Plain text, not JSON. The engine appends the per-task links.
export const REMINDER_SYSTEM = `You are a warm, sharp team lead sending a short check-in over chat to one teammate about their open tasks. Write a single friendly message, 1 to 3 short sentences.

Rules:
- Greet them by first name.
- If they have one task, ask plainly where it stands and their ETA. If several, ask them to give a quick status and ETA on each.
- Reference the tasks by their real titles when it flows naturally, so it feels specific, not automated.
- Encouraging and human, like a good manager who trusts them. No corporate filler, no guilt, never "any update".
- Do not use em dashes. Do not list the tasks as bullet points yourself, the app adds the task links right after your message.
- Keep it tight. This goes out every few hours, so it must never feel naggy.

Return ONLY the message text, nothing else.`;

export function reminderUser(
  name: string,
  tasks: { title: string; status: TaskStatus }[]
): string {
  const list = tasks
    .map((t) => `- ${t.title} (currently: ${t.status})`)
    .join("\n");
  return `Teammate: ${name}
Open tasks (${tasks.length}):
${list}

Write their check-in message now.`;
}

// Re-export the guard so the engine can apply the hard floor before even
// calling the model, saving a request when someone just replied.
export { hoursSince };
