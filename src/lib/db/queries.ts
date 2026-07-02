import { db } from "./client";
import {
  AssignmentContext,
  Attachment,
  Message,
  MsgDirection,
  OPEN_STATUSES,
  Task,
  TaskAssignment,
  TaskRisk,
  TaskStatus,
  TaskWithAssignments,
  User,
} from "./types";

// ---- Tasks ----------------------------------------------------------------

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await db()
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Task) ?? null;
}

// A task with all of its per-person assignments (each carrying its user + state).
// Powers the task detail page.
export async function getTaskWithAssignments(
  id: string
): Promise<TaskWithAssignments | null> {
  const { data, error } = await db()
    .from("tasks")
    .select("*, assignments:task_assignments(*, user:users(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const t = data as unknown as TaskWithAssignments;
  t.assignments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return t;
}

export async function createTask(input: {
  title: string;
  description?: string;
  assignee_ids?: string[];
  priority?: number;
  track?: string; // product | sales | gtm | dev
  due_at?: string | null;
  created_by?: string; // who created/assigned it: a person's name
}): Promise<{ task: Task; assignments: (TaskAssignment & { user: User })[] }> {
  const base = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 2,
    due_at: input.due_at ?? null,
    created_by: input.created_by ?? "Charan",
  };
  let { data, error } = await db()
    .from("tasks")
    .insert({ ...base, track: input.track ?? "product" })
    .select("*")
    .single();
  // Tolerate the migration not being applied yet: if the track column doesn't
  // exist, create the task without it (it defaults to "product" on read).
  if (error && (error.code === "42703" || /track/i.test(error.message))) {
    ({ data, error } = await db().from("tasks").insert(base).select("*").single());
  }
  if (error) throw error;
  const task = data as Task;

  const assignments = await addAssignments(
    task.id,
    (input.assignee_ids ?? []).filter(Boolean)
  );
  return { task, assignments };
}

// Shared-brief fields only. Per-person agent state is updated via updateAssignment.
export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    priority: number;
    due_at: string | null;
  }>
): Promise<Task> {
  const { data, error } = await db()
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

// ---- Assignments (the per-person unit) ------------------------------------

// Add one assignment per user to a task. Idempotent on (task_id, user_id).
export async function addAssignments(
  taskId: string,
  userIds: string[]
): Promise<(TaskAssignment & { user: User })[]> {
  if (userIds.length === 0) return [];
  const rows = userIds.map((user_id) => ({ task_id: taskId, user_id }));
  const { error } = await db()
    .from("task_assignments")
    .upsert(rows, { onConflict: "task_id,user_id", ignoreDuplicates: true });
  if (error) throw error;

  const { data, error: e2 } = await db()
    .from("task_assignments")
    .select("*, user:users(*)")
    .eq("task_id", taskId)
    .in("user_id", userIds);
  if (e2) throw e2;
  return (data ?? []) as unknown as (TaskAssignment & { user: User })[];
}

export async function removeAssignment(id: string): Promise<void> {
  const { error } = await db().from("task_assignments").delete().eq("id", id);
  if (error) throw error;
}

// Every assignment the agent may speak on right now: open status, agent on,
// active user, not snoozed. Reachability on the resolved channel is the engine's
// call (it owns channel resolution).
export async function getDueAssignments(
  now = new Date()
): Promise<AssignmentContext[]> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .in("status", OPEN_STATUSES)
    .eq("agent_enabled", true);
  if (error) throw error;

  const rows = (data ?? []) as unknown as AssignmentContext[];
  return rows.filter((a) => {
    if (!a.user || !a.user.active) return false;
    if (a.snoozed_until && new Date(a.snoozed_until) > now) return false;
    return true;
  });
}

// Every assignment with its task + person, newest first. Each is a board card.
export async function listAssignments(): Promise<AssignmentContext[]> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AssignmentContext[];
}

// All open assignments for one person, with task + user. Powers the per-person
// digest (one email listing everything they owe).
export async function getOpenAssignmentsForUser(
  userId: string
): Promise<AssignmentContext[]> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .eq("user_id", userId)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AssignmentContext[];
}

export async function getAssignment(
  id: string
): Promise<AssignmentContext | null> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AssignmentContext) ?? null;
}

export async function getAssignmentByTaskAndUser(
  taskId: string,
  userId: string
): Promise<AssignmentContext | null> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AssignmentContext) ?? null;
}

// The person's most recently poked open assignment, used to route a free-text
// reply that did not carry an explicit task hint.
export async function getLatestOpenAssignmentForUser(
  userId: string
): Promise<AssignmentContext | null> {
  const { data, error } = await db()
    .from("task_assignments")
    .select("*, task:tasks(*), user:users(*)")
    .eq("user_id", userId)
    .in("status", OPEN_STATUSES)
    .order("last_asked_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AssignmentContext) ?? null;
}

export async function updateAssignment(
  id: string,
  patch: Partial<{
    status: TaskStatus;
    ai_summary: string | null;
    ai_risk: TaskRisk;
    needs_attention: boolean;
    agent_enabled: boolean;
    snoozed_until: string | null;
    last_activity_at: string;
    last_asked_at: string;
    notified_at: string;
  }>
): Promise<TaskAssignment> {
  const { data, error } = await db()
    .from("task_assignments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TaskAssignment;
}

// ---- Messages -------------------------------------------------------------

export async function getThreadForAssignment(
  assignmentId: string
): Promise<Message[]> {
  const { data, error } = await db()
    .from("messages")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function addMessage(input: {
  task_id: string;
  assignment_id?: string | null;
  user_id?: string | null;
  direction: MsgDirection;
  channel?: "telegram" | "whatsapp" | "email";
  body?: string | null;
  attachments?: Attachment[];
  provider_msg_id?: string | null;
}): Promise<Message> {
  const { data, error } = await db()
    .from("messages")
    .insert({
      task_id: input.task_id,
      assignment_id: input.assignment_id ?? null,
      user_id: input.user_id ?? null,
      direction: input.direction,
      channel: input.channel ?? "telegram",
      body: input.body ?? null,
      attachments: input.attachments ?? [],
      provider_msg_id: input.provider_msg_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Message;
}

// ---- AI runs (audit) ------------------------------------------------------

export async function recordAiRun(input: {
  task_id: string;
  assignment_id?: string | null;
  decision: "ask" | "skip";
  question?: string | null;
  reasoning?: string | null;
  model?: string | null;
}): Promise<void> {
  const { error } = await db().from("ai_runs").insert({
    task_id: input.task_id,
    assignment_id: input.assignment_id ?? null,
    decision: input.decision,
    question: input.question ?? null,
    reasoning: input.reasoning ?? null,
    model: input.model ?? null,
  });
  if (error) throw error;
}

// ---- Users ----------------------------------------------------------------

export async function listUsers(): Promise<User[]> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as User[];
}

export async function createUser(input: {
  name: string;
  email?: string;
  role?: string;
}): Promise<User> {
  const { data, error } = await db()
    .from("users")
    .insert({
      name: input.name,
      email: input.email ?? null,
      role: input.role ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as User;
}

export async function getUserByOnboardingToken(
  token: string
): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .eq("onboarding_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as User) ?? null;
}

export async function getUserByTelegramChatId(
  chatId: number
): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (error) throw error;
  return (data as User) ?? null;
}

// Case-insensitive email lookup, used to route inbound email replies to a user.
export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .ilike("email", email.trim())
    .maybeSingle();
  if (error) throw error;
  return (data as User) ?? null;
}

export async function updateUser(
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    role: string | null;
    preferred_channel: "auto" | "telegram" | "email";
    active: boolean;
  }>
): Promise<User> {
  const { data, error } = await db()
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as User;
}

export async function linkTelegram(
  userId: string,
  chatId: number
): Promise<void> {
  const { error } = await db()
    .from("users")
    .update({
      telegram_chat_id: chatId,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}
