import { AssignmentContext, Message } from "@/lib/db/types";
import { askJson } from "./anthropic";
import { env } from "@/lib/env";
import {
  DECIDE_SYSTEM,
  DecideResult,
  PROGRESS_SYSTEM,
  ProgressResult,
  REPLY_SYSTEM,
  ReplyResult,
  decideUser,
  progressUser,
  replyUser,
} from "./prompts";

// Always produce one grounded progress + ETA question (never skips). The engine
// decides the cadence; this just phrases the ask.
export async function askProgress(
  assignment: AssignmentContext,
  thread: Message[]
): Promise<string> {
  const r = await askJson<ProgressResult>({
    system: PROGRESS_SYSTEM,
    user: progressUser(assignment, thread),
    maxTokens: 200,
  });
  return (
    (r.question ?? "").trim() ||
    `Quick check on "${assignment.task.title}": where are you now, and what's your ETA?`
  );
}

// Decide whether to poke this person on this task now, and if so the question.
export async function decideAndAsk(
  assignment: AssignmentContext,
  thread: Message[]
): Promise<DecideResult> {
  const result = await askJson<DecideResult>({
    system: DECIDE_SYSTEM,
    user: decideUser(assignment, thread),
    maxTokens: 400,
  });

  // Guard against the model asking the banned generic question anyway.
  if (
    result.decision === "ask" &&
    result.question &&
    /^\s*(any update|status\??|update\??)\s*[?.!]*\s*$/i.test(result.question)
  ) {
    return {
      decision: "skip",
      question: null,
      reasoning: "Suppressed a generic question; nothing specific to ask.",
    };
  }
  return result;
}

// Update this person's state on the task from their latest reply.
export async function processReply(
  assignment: AssignmentContext,
  thread: Message[],
  newReply: string
): Promise<ReplyResult> {
  return askJson<ReplyResult>({
    system: REPLY_SYSTEM,
    user: replyUser(assignment, thread, newReply),
    maxTokens: 500,
  });
}

export const AGENT_MODEL = env.AGENT_MODEL;
