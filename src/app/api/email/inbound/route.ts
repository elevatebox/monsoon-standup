import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleInbound } from "@/lib/standup/inbound";
import { NormalizedInbound } from "@/lib/transport/types";

// Where email replies land. Point your provider's inbound parse / inbound route
// at this URL. Works with JSON providers (Resend, Postmark) and form-encoded
// ones (SendGrid Inbound Parse). See README for provider setup.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Optional shared-secret check. Set EMAIL_INBOUND_SECRET and configure the
  // provider to include it (header X-Inbound-Secret, or ?secret= on the URL).
  if (env.EMAIL_INBOUND_SECRET) {
    const provided =
      req.headers.get("x-inbound-secret") ??
      req.nextUrl.searchParams.get("secret") ??
      "";
    if (provided !== env.EMAIL_INBOUND_SECRET) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let parsed: ParsedEmail | null = null;
  try {
    parsed = await parseInbound(req);
  } catch (e) {
    console.error("inbound email parse error:", (e as Error).message);
  }

  if (!parsed || !parsed.from) {
    // Always 200 so the provider does not retry forever on something we cannot use.
    return NextResponse.json({ ok: true, note: "nothing usable" });
  }

  const inbound: NormalizedInbound = {
    kind: "text",
    channel: "email",
    from: parsed.from,
    payload: stripQuotedReply(parsed.text ?? ""),
    attachments: [],
    threadTaskId: taskIdFromRecipients(parsed.to),
  };

  try {
    await handleInbound(inbound);
  } catch (e) {
    console.error("inbound email handling error:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}

// ---- Provider-agnostic parsing -------------------------------------------

interface ParsedEmail {
  from: string;
  to: string[];
  subject?: string;
  text?: string;
}

async function parseInbound(req: NextRequest): Promise<ParsedEmail> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const body = await req.json();
    return fromJson(body);
  }

  // SendGrid Inbound Parse and some others post form data.
  const form = await req.formData();
  const get = (k: string) => (form.get(k)?.toString() ?? "").trim();
  return {
    from: extractAddress(get("from")),
    to: splitAddresses(get("to") || get("envelope")),
    subject: get("subject"),
    text: get("text"),
  };
}

function fromJson(body: any): ParsedEmail {
  // Handle the common JSON shapes: Resend (data.*) and Postmark (FromFull etc).
  const data = body?.data ?? body;

  const from =
    extractAddress(addr(data?.from)) ||
    extractAddress(data?.FromFull?.Email ?? data?.From ?? "");

  const toList: string[] = [];
  const rawTo = data?.to ?? data?.ToFull ?? data?.To;
  if (Array.isArray(rawTo)) {
    for (const t of rawTo) toList.push(extractAddress(addr(t)));
  } else if (typeof rawTo === "string") {
    toList.push(...splitAddresses(rawTo));
  }

  return {
    from,
    to: toList.filter(Boolean),
    subject: data?.subject ?? data?.Subject ?? "",
    text: data?.text ?? data?.TextBody ?? data?.["body-plain"] ?? "",
  };
}

// A single address may be a string or an object like { address } / { Email }.
function addr(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.address ?? v.Email ?? v.email ?? "";
}

function extractAddress(s: string): string {
  if (!s) return "";
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

function splitAddresses(s: string): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => extractAddress(x))
    .filter(Boolean);
}

// Read the task id out of a plus-addressed recipient: task+<id>@domain.
function taskIdFromRecipients(to: string[]): string | undefined {
  for (const addrStr of to) {
    const m = addrStr.match(/task\+([^@]+)@/i);
    if (m) return m[1];
  }
  return undefined;
}

// Best-effort trim of the quoted thread below a reply, so the AI sees only the
// new text. Cuts at common reply markers.
function stripQuotedReply(text: string): string {
  const markers = [
    /\n>.*/s, // quoted lines
    /\nOn .* wrote:/s, // "On <date>, <name> wrote:"
    /\n-----Original Message-----/s,
    /\n________________________________/s,
  ];
  let cut = text;
  for (const m of markers) {
    const idx = cut.search(m);
    if (idx > 0) cut = cut.slice(0, idx);
  }
  return cut.trim() || text.trim();
}
