import { env } from "@/lib/env";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Headroom added on top of the caller's answer budget so the model's hidden
// "thinking" tokens don't eat into the JSON answer and truncate it. Gemini 3 pro
// models think mandatorily (~500 tokens here), so the budget must cover both.
const THINKING_HEADROOM = 2048;

// Calls Gemini and returns parsed JSON. We force JSON output with
// responseMimeType. We do NOT disable thinking: the pro models require it
// ("This model only works in thinking mode"), so instead we size the token
// budget to cover thinking plus the answer. extractJson is a defensive fallback.
export async function askJson<T>(args: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const model = args.model ?? env.AGENT_MODEL;
  const res = await fetch(
    `${API_BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          maxOutputTokens: (args.maxTokens ?? 600) + THINKING_HEADROOM,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error(
      "Gemini returned no text: " + JSON.stringify(data).slice(0, 200)
    );
  }

  return extractJson<T>(text);
}

// Transcribe a voice note. Gemini is multimodal, so we hand it the audio bytes
// inline and ask for a plain transcript. Uses flash (solid audio support, cheap,
// fast) regardless of the configured agent model. Best-effort: returns "" if the
// model gives nothing, so the caller can fall back to asking the person to type.
export async function transcribeAudio(
  base64: string,
  mimeType: string
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this voice note verbatim. Return only the spoken words, no commentary.",
              },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return ((data.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  // Fast path: the whole thing is clean JSON.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Some models (notably gemini-3 pro) occasionally append extra prose or a
    // second object after the JSON. Extract just the first BALANCED {...} object
    // rather than first-brace-to-last-brace, which would swallow the trailing junk.
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
