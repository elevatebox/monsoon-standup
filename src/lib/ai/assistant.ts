import { askJson } from "./anthropic";
import { AssignmentContext, TaskRisk, TaskStatus, User } from "@/lib/db/types";
import { DevActivity } from "@/lib/dev/github";

// The conversational brain behind the Telegram bot. On any message it decides
// whether the person is giving a status update on their own task, or asking a
// question (about their tasks, the team, dev activity, or anything at all), and
// responds accordingly. Grounded in the live board + GitHub so answers are real.

export interface AssistantResult {
  action: "update" | "answer" | "create";
  reply: string;
  update: {
    status: TaskStatus;
    summary: string;
    risk: TaskRisk;
    needs_attention: boolean;
  } | null;
  create: {
    title: string;
    description: string;
    track: string;
    priority: number;
    assignee: string;
  } | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function myTasksBlock(rows: AssignmentContext[]): string {
  if (rows.length === 0) return "(none right now)";
  return rows
    .map((a) => {
      const due = a.task.due_at ? `, due ${fmtDate(a.task.due_at)}` : "";
      const note = a.ai_summary ? ` — ${a.ai_summary}` : "";
      return `- [${a.task.track}] ${a.task.title} (${a.status}${due})${note}`;
    })
    .join("\n");
}

function teamTasksBlock(rows: AssignmentContext[]): string {
  if (rows.length === 0) return "(no tasks yet)";
  return rows
    .slice(0, 60)
    .map((a) => {
      const due = a.task.due_at ? `, due ${fmtDate(a.task.due_at)}` : "";
      return `- ${a.task.title} — ${a.user?.name ?? "?"}, ${a.task.track}, ${a.status}${due}`;
    })
    .join("\n");
}

function devBlock(dev: DevActivity): string {
  if (!dev.connected) return "(GitHub not connected)";
  if (dev.authors.length === 0) return `no commits in ${dev.repo} in the last ${dev.days} days`;
  return dev.authors
    .map((d) => {
      const recent = d.recent.map((r) => r.message).join("; ");
      return `${d.name}: ${d.commits} commits in ${dev.days}d (last ${new Date(d.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}). Recent: ${recent}`;
    })
    .join("\n");
}

export async function assistantReply(args: {
  user: User;
  message: string;
  myTasks: AssignmentContext[];
  teamTasks: AssignmentContext[];
  dev: DevActivity;
  teamNames: string[];
}): Promise<AssistantResult> {
  const { user, message } = args;

  const system = `You are the assistant for Monsoon Standup, chatting on Telegram with ${user.name}.

Monsoon is the company: an AI accounting + GST platform for Indian cement dealers, that pushes a clean GST database into Zoho Books. Monsoon Standup is the internal tracker for the founding team: Charan and Abhishek (product, sales, GTM) and Manikanta (developer, ships the product code on GitHub).

You do three things:
1) ANSWER questions — about tasks, the team, developer activity, deadlines, or any general question. Be genuinely helpful.
2) RECORD an update — when ${user.name} tells you progress on their own task.
3) CREATE a task — when ${user.name} asks to create/add a new task or assign work to someone.

Use ONLY the context below for facts about existing tasks and dev work; do not invent tasks or commits. For general knowledge questions, answer from what you know.

=== TEAM MEMBERS ===
${args.teamNames.join(", ")}

=== ${user.name}'S OPEN TASKS ===
${myTasksBlock(args.myTasks)}

=== WHOLE TEAM'S TASKS ===
${teamTasksBlock(args.teamTasks)}

=== DEVELOPER ACTIVITY (from GitHub) ===
${devBlock(args.dev)}

Reply style: short and clear for Telegram. No markdown headings, no tables. A few sentences or a tight list at most. Do not use em dashes.

Decide the action:
- CREATE: if they ask to create/add a task or assign work (e.g. "create a task for Manikanta to add GSTR export", "add a task: call 5 dealers"), set action="create" and fill create.title (concise), create.description (a short clear spec: what to do and what done looks like), create.track (product|sales|gtm|dev), create.priority (1 high | 2 normal | 3 low), create.assignee (a name from TEAM MEMBERS; if they did not say who, use "${user.name}"). Reply confirming what you created and to whom.
- UPDATE: if the message is progress/status on one of ${user.name}'s OWN tasks (e.g. "done with X", "blocked on Y", "started the mapper"), set action="update": fill update.status (todo|in_progress|blocked|in_review|done|cancelled), update.summary (1-2 sentences), update.risk (on_track|slipping|blocked|unknown), update.needs_attention (true only if a founder must step in). Reply confirming.
- ANSWER: otherwise set action="answer" and put your answer in reply.

Set the fields you are not using to null.

Return ONLY JSON, no prose, no code fences:
{ "action": "update" | "answer" | "create", "reply": string, "update": { "status": string, "summary": string, "risk": string, "needs_attention": boolean } | null, "create": { "title": string, "description": string, "track": "product"|"sales"|"gtm"|"dev", "priority": 1|2|3, "assignee": string } | null }`;

  const result = await askJson<AssistantResult>({
    system,
    user: message,
    maxTokens: 900,
  });

  // Be defensive about the shape.
  if (result.action !== "update") result.update = null;
  if (result.action !== "create") result.create = null;
  if (!result.reply) result.reply = "Got it.";
  return result;
}
