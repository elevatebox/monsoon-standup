// Central place to read environment variables. Throws early with a clear
// message if a required one is missing, so misconfiguration fails loudly at
// boot instead of silently at 2am during a cron run.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  // Supabase
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Anthropic (Claude). Writes the check-in questions and the reminder copy.
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  // The Claude model. Opus 4.8 is the current top model; override to a cheaper
  // tier (e.g. claude-haiku-4-5) for lower cost/latency.
  ANTHROPIC_MODEL: optional("ANTHROPIC_MODEL", "claude-opus-4-8"),

  // Gemini (Google AI Studio). Only used to transcribe voice notes, which Claude
  // cannot take as audio. Optional: leave unset if no one sends voice replies.
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),
  // Legacy label kept for the ai_runs log; the active model is ANTHROPIC_MODEL.
  AGENT_MODEL: optional("AGENT_MODEL", "claude-opus-4-8"),

  // Telegram. Optional: only needed if any teammate is reached by Telegram. The
  // transport reads the token lazily at send time, so the app boots fine without
  // it (email-only mode). The webhook/setup routes return an error if hit unset.
  TELEGRAM_BOT_TOKEN: optional("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_BOT_USERNAME: optional("TELEGRAM_BOT_USERNAME"), // without the @, for deep links
  // Secret echoed by Telegram in the X-Telegram-Bot-Api-Secret-Token header so
  // we can reject anything that did not come from Telegram.
  TELEGRAM_WEBHOOK_SECRET: optional("TELEGRAM_WEBHOOK_SECRET"),

  // Email. Optional: only needed if any teammate is reached by email. The email
  // transport validates these at send time and returns a clear error if unset.
  EMAIL_PROVIDER: optional("EMAIL_PROVIDER", "resend") as "resend" | "sendgrid",
  EMAIL_API_KEY: optional("EMAIL_API_KEY"),
  // The from address, e.g. "Standup <standup@yourdomain.com>". Must be a domain
  // you have verified with the provider.
  EMAIL_FROM: optional("EMAIL_FROM"),
  // Domain used to build plus-addressed Reply-To addresses for inbound threading,
  // e.g. "inbox.yourdomain.com" produces reply targets like task+<id>@inbox.yourdomain.com.
  EMAIL_REPLY_DOMAIN: optional("EMAIL_REPLY_DOMAIN"),
  // Optional shared secret a provider sends with inbound webhooks (set it in the
  // provider dashboard and here) so we can reject forged inbound email posts.
  EMAIL_INBOUND_SECRET: optional("EMAIL_INBOUND_SECRET"),

  // Secret used to sign one-click email action links (Done / Blocked / Snooze).
  // Required if email is used. Generate: openssl rand -hex 24
  ACTION_SECRET: optional("ACTION_SECRET"),

  // Cron protection. Vercel Cron sends this as a Bearer token.
  CRON_SECRET: required("CRON_SECRET"),

  // Dashboard gate (simple shared password for the founder).
  DASHBOARD_PASSWORD: required("DASHBOARD_PASSWORD"),

  // Public base url, used to build Telegram deep links and webhook urls.
  APP_URL: optional("APP_URL", "http://localhost:3000"),

  // GitHub (Dev lane). Read-only token; the app only ever reads GITHUB_REPO.
  GITHUB_TOKEN: optional("GITHUB_TOKEN"),
  GITHUB_REPO: optional("GITHUB_REPO", "elevatebox/heymonsoon"),

  // Default channel used when a user's preference is 'auto' and the agent cannot
  // infer one (no Telegram link and no email). Rarely hit; per-user preference
  // and 'auto' resolution decide the channel in almost all cases.
  ACTIVE_TRANSPORT: optional("ACTIVE_TRANSPORT", "telegram") as
    | "telegram"
    | "email",
};
