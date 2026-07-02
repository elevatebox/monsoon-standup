import { env } from "@/lib/env";
import {
  OutboundMessage,
  OutboundTransport,
  SendResult,
} from "./types";
import { signAction } from "@/lib/standup/sign";

// ============================================================================
// Email transport.
//
// Sends the hourly question as an email. Email has no inline buttons, so the
// Done / Blocked / Snooze buttons become one-click signed links that hit
// /api/email/action. Replies come back through /api/email/inbound once the
// provider's inbound parse is pointed at it.
//
// The recipient id (OutboundMessage.to) is the teammate's email address. We set
// a plus-addressed Reply-To so an email reply can be threaded to the right task.
// ============================================================================

export class EmailTransport implements OutboundTransport {
  name = "email" as const;

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
      return {
        ok: false,
        error:
          "Email is not configured. Set EMAIL_API_KEY and EMAIL_FROM (and ACTION_SECRET for buttons).",
      };
    }

    // Pull the user id and task id out of the button values so we can build
    // signed links and a plus-addressed reply target. Button values look like
    // "done:<taskId>" and carry the task; we attach the user via the engine.
    const userId = msg.meta?.userId ?? "";
    const taskId = firstTaskId(msg);

    const replyTo =
      env.EMAIL_REPLY_DOMAIN && taskId
        ? `task+${taskId}@${env.EMAIL_REPLY_DOMAIN}`
        : undefined;

    const html = renderHtml(msg, userId);
    const text = renderText(msg, userId);

    try {
      if (env.EMAIL_PROVIDER === "sendgrid") {
        return await sendViaSendgrid({
          to: msg.to,
          subject: subjectFor(msg),
          html,
          text,
          replyTo,
        });
      }
      return await sendViaResend({
        to: msg.to,
        subject: subjectFor(msg),
        html,
        text,
        replyTo,
      });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}

// ---- Rendering ------------------------------------------------------------

function subjectFor(msg: OutboundMessage): string {
  // The first line of the text is the task title (set by the engine).
  const title = msg.meta?.title ?? "Quick check-in";
  return `Monsoon: ${title}`;
}

function actionUrl(value: string, userId: string): string {
  const token = signAction(value, userId);
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/api/email/action?t=${encodeURIComponent(token)}`;
}

function renderHtml(msg: OutboundMessage, userId: string): string {
  const buttons = (msg.buttons ?? [])
    .flat()
    .map(
      (b) =>
        `<a href="${actionUrl(b.value, userId)}" style="display:inline-block;padding:9px 14px;margin:4px 6px 4px 0;border:1px solid #d8dce2;border-radius:10px;color:#16181d;text-decoration:none;font-size:14px;">${escapeHtml(
          b.label
        )}</a>`
    )
    .join("");

  const body = escapeHtml(msg.text).replace(/\n/g, "<br>");

  // Per-person digest: one row per task, each with its own update link.
  const tasks = msg.meta?.tasks;
  if (tasks && tasks.length) {
    const rows = tasks
      .map(
        (t) => `<tr>
      <td style="padding:10px 0;border-top:1px solid #e5e8ec;font-size:15px;color:#16181d;">${escapeHtml(
        t.title
      )}<br><span style="font-size:12px;color:#8a92a0;">${escapeHtml(
          t.status.replace("_", " ")
        )}</span></td>
      <td style="padding:10px 0;border-top:1px solid #e5e8ec;text-align:right;white-space:nowrap;"><a href="${t.url}" style="color:#1F5C3D;text-decoration:none;font-weight:500;font-size:14px;">Update &rarr;</a></td>
    </tr>`
      )
      .join("");
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#16181d;line-height:1.5;">
  <p style="font-size:15px;">${body}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>
  <p style="margin-top:14px;font-size:13px;color:#5b6472;">Tap a task to send a status, an ETA, a note, or a voice update.</p>
</div>`;
  }

  const replyUrl = msg.meta?.replyUrl;
  const replyCta = replyUrl
    ? `<div style="margin-top:16px;"><a href="${replyUrl}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#1F5C3D;color:#fff;text-decoration:none;font-size:15px;font-weight:500;">Add an update</a></div>
  <p style="margin-top:8px;font-size:13px;color:#5b6472;">Tap to reply with a quick status, an ETA, a note, or a voice message.</p>`
    : `<p style="margin-top:18px;font-size:13px;color:#5b6472;">Just reply to this email with an update and it will be logged.</p>`;

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#16181d;line-height:1.5;">
  <p style="font-size:15px;">${body}</p>
  ${replyCta}
  ${buttons ? `<div style="margin-top:14px;">${buttons}</div>` : ""}
</div>`;
}

function renderText(msg: OutboundMessage, userId: string): string {
  const lines = [msg.text, ""];
  const tasks = msg.meta?.tasks;
  if (tasks && tasks.length) {
    for (const t of tasks) {
      lines.push(`- ${t.title} (${t.status.replace("_", " ")})`);
      lines.push(`  Update: ${t.url}`);
    }
    return lines.join("\n");
  }
  if (msg.meta?.replyUrl) {
    lines.push(`Add an update (status, ETA, note, or voice): ${msg.meta.replyUrl}`, "");
  }
  for (const b of (msg.buttons ?? []).flat()) {
    lines.push(`${b.label}: ${actionUrl(b.value, userId)}`);
  }
  return lines.join("\n");
}

function firstTaskId(msg: OutboundMessage): string | undefined {
  for (const b of (msg.buttons ?? []).flat()) {
    const parts = b.value.split(":");
    if (parts.length >= 2) return parts[1];
  }
  return undefined;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- Providers ------------------------------------------------------------

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.message ?? `resend ${res.status}` };
  }
  return { ok: true, providerMessageId: data?.id };
}

async function sendViaSendgrid(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }] }],
      from: parseFrom(env.EMAIL_FROM),
      reply_to: args.replyTo ? { email: args.replyTo } : undefined,
      subject: args.subject,
      content: [
        { type: "text/plain", value: args.text },
        { type: "text/html", value: args.html },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `sendgrid ${res.status} ${t}`.trim() };
  }
  // SendGrid returns the id in a header.
  return { ok: true, providerMessageId: res.headers.get("x-message-id") ?? undefined };
}

function parseFrom(from: string): { email: string; name?: string } {
  // Accepts "Name <email@domain>" or "email@domain".
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: from.trim() };
}
