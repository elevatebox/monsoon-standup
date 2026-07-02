import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// One shared client. The SDK retries 429/5xx with backoff, which matters for the
// unattended 6-hour cron, so we prefer it over a hand-rolled fetch.
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// The model that writes the check-in questions and the reminders. Opus 4.8 is the
// current top model; override with ANTHROPIC_MODEL if you want a cheaper tier.
const MODEL = env.ANTHROPIC_MODEL;

// Pull the plain-text answer out of a response, ignoring any non-text blocks.
function textOf(msg: Anthropic.Message): string {
  return msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

// Calls Claude and returns parsed JSON. The prompts already instruct the model to
// return a bare JSON object; extractJson is a defensive fallback for the rare
// case it wraps the object in prose or a code fence.
export async function askJson<T>(args: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const msg = await client.messages.create({
    model: args.model ?? MODEL,
    max_tokens: args.maxTokens ?? 600,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });

  const text = textOf(msg);
  if (!text) {
    throw new Error("Claude returned no text: " + JSON.stringify(msg.usage));
  }
  return extractJson<T>(text);
}

// Calls Claude and returns the plain text answer. Used for the human-facing
// reminder copy, where we want prose, not JSON.
export async function askText(args: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const msg = await client.messages.create({
    model: args.model ?? MODEL,
    max_tokens: args.maxTokens ?? 400,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  return textOf(msg);
}

export const AGENT_MODEL = MODEL;

function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  // Fast path: the whole thing is clean JSON.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the first complete, brace-balanced object, ignoring any
    // trailing prose the model might append.
    const obj = firstBalancedObject(cleaned);
    if (obj) {
      try {
        return JSON.parse(obj) as T;
      } catch {
        /* fall through to the error below */
      }
    }
    throw new Error("Model did not return parseable JSON: " + text.slice(0, 200));
  }
}

// Returns the first complete, brace-balanced JSON object in the string, ignoring
// braces inside string literals. Null if there is no complete object.
function firstBalancedObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
