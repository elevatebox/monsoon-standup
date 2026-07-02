// Row types mirroring supabase/schema.sql.
// Kept hand written and small. If you prefer, regenerate with the Supabase CLI:
//   supabase gen types typescript --project-id <ref> > src/lib/db/generated.ts

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done"
  | "cancelled";

export const OPEN_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "in_review",
];

export type TaskRisk = "on_track" | "slipping" | "blocked" | "unknown";

// Which function of the company a task belongs to. Dev tasks map to work in the
// product repo; the rest are founder-run.
export type TaskTrack = "product" | "sales" | "gtm" | "dev";
export const TASK_TRACKS: TaskTrack[] = ["product", "sales", "gtm", "dev"];

export type Channel = "telegram" | "whatsapp" | "email";

export type MsgDirection = "outbound" | "inbound" | "system";

export type AiDecision = "ask" | "skip";

export type ChannelPref = "auto" | "telegram" | "email";

export interface User {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  preferred_channel: ChannelPref;
  telegram_chat_id: number | null;
  onboarding_token: string | null;
  telegram_linked_at: string | null;
  whatsapp_number: string | null;
  active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  priority: number;
  track: TaskTrack;
  due_at: string | null;
  ai_summary: string | null;
  ai_risk: TaskRisk;
  needs_attention: boolean;
  agent_enabled: boolean;
  snoozed_until: string | null;
  last_activity_at: string;
  last_asked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// One person's assignment to a task: their own agent state lives here, so a
// task assigned to several people tracks each person independently.
export interface TaskAssignment {
  id: string;
  task_id: string;
  user_id: string;
  status: TaskStatus;
  ai_summary: string | null;
  ai_risk: TaskRisk;
  needs_attention: boolean;
  agent_enabled: boolean;
  snoozed_until: string | null;
  last_activity_at: string;
  last_asked_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  task_id: string;
  assignment_id: string | null;
  user_id: string | null;
  direction: MsgDirection;
  channel: Channel;
  body: string | null;
  attachments: Attachment[];
  provider_msg_id: string | null;
  created_at: string;
}

export interface Attachment {
  kind: "link" | "file" | "photo";
  url?: string;
  file_id?: string; // Telegram file_id, resolve later with getFile if you want the bytes
  name?: string;
  caption?: string;
}

export interface AiRun {
  id: string;
  task_id: string;
  decision: AiDecision;
  question: string | null;
  reasoning: string | null;
  model: string | null;
  created_at: string;
}

// A task plus its assignee, the common shape the engine and dashboard pass around.
export interface TaskWithAssignee extends Task {
  assignee: User | null;
}

// An assignment joined to its task and the person, the unit the per-person
// engine, inbound handler, and board all operate on. One of these is a "card".
export interface AssignmentContext extends TaskAssignment {
  task: Task;
  user: User;
}

// A task with all of its assignments (each carrying its person + state). The
// dashboard detail page and the board build from this.
export interface TaskWithAssignments extends Task {
  assignments: (TaskAssignment & { user: User })[];
}
