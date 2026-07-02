# Standup Agent

An AI standup agent for a small tech team. You assign tasks. Every hour it looks
at each open task, and if there is something specific worth asking, it sends one
grounded question to the assignee. Their reply updates the task: a running
summary, a status, and a risk read. Everything lands in one dashboard, so you
never chase anyone for an update again.

It reaches people on two channels, chosen per person: Telegram (free, instant,
inline buttons) and email (no setup on their side, one-click action links). A
teammate not on Telegram is still fully covered by email.

Built to be handed to Claude Code to finish wiring and deploy. The core is done:
schema, the hourly engine, both channels (Telegram and email, send plus inbound),
the AI brain, and the founder dashboard. What is left is mostly creating accounts
and pasting keys.

---

## How it works

Three moving parts.

1. The hourly engine (`src/lib/standup/engine.ts`). A Vercel cron hits
   `/api/cron/standup` once an hour. It pulls every open task whose agent is on,
   whose assignee is reachable, and that is not snoozed. For each one it sends
   the task and the recent thread to the model, which decides ask or skip and,
   if asking, writes one specific question. A generic question is suppressed on
   purpose, silence beats nagging. The question goes out on the assignee's
   resolved channel (Telegram or email).

2. Inbound. Telegram replies and button taps hit
   `/api/telegram/webhook`. Email replies hit `/api/email/inbound`, and the
   one-click Done / Blocked / Snooze links in an email hit `/api/email/action`.
   All of them normalize into one shape and run through the same
   `handleInbound()`. A free text reply goes to the model, which updates the task
   status, the rolling summary, and the risk. Buttons and links update the task
   directly.

3. The dashboard (`src/app/(dashboard)`). Tasks sorted with the ones that need
   you first, then in flight by risk, then closed. Each task opens to its full
   conversation, the AI summary, and controls to change status, reassign, snooze,
   or switch the agent off.

### Channels (Telegram and email)

Each teammate has a channel preference: Telegram, email, or auto. Auto uses
Telegram when it is linked, otherwise email. The engine resolves this per person
(`channelForUser` in `src/lib/transport/index.ts`) and sends through the matching
transport. Everything above the channel speaks one `OutboundTransport` interface,
so the engine, the prompts, and the dashboard do not care which channel a given
question went out on.

- Telegram: free, instant, native two way, inline Done / Blocked / Snooze
  buttons. Costs one thing, each teammate taps Start once via a personal link.
- Email: nothing to install on their side, just an address. Buttons become
  one-click signed links (email has no inline buttons). Replies thread back to
  the right task through a plus-addressed Reply-To. Outbound works immediately
  once the provider keys are set, inbound replies need the provider's inbound
  parse pointed at the webhook (below).

WhatsApp is still stubbed behind the same interface (`whatsapp.ts`) for later.

---

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind. Supabase (Postgres) for
data. Google Gemini for the agent. Telegram Bot API for messaging. Vercel for hosting
and cron. No paid messaging tier, runs on the Supabase and Vercel free tiers at
this scale, the only real cost is a few cents of model usage.

---

## Setup (for Claude Code)

### 1. Install

```bash
npm install
```

### 2. Supabase

Create a project at supabase.com. Open the SQL editor and run the whole of
`supabase/schema.sql`. Then from Project Settings, API, copy:

- the Project URL into `SUPABASE_URL`
- the service_role key into `SUPABASE_SERVICE_ROLE_KEY` (server only, never ship
  this to a browser)

### 3. Telegram bot

In Telegram, message @BotFather, send `/newbot`, follow the prompts. You get:

- a bot token, into `TELEGRAM_BOT_TOKEN`
- the bot username (without the @), into `TELEGRAM_BOT_USERNAME`, this builds the
  connect links

Pick any random string for `TELEGRAM_WEBHOOK_SECRET` (run `openssl rand -hex 24`).
Telegram echoes it back on every call so the webhook can reject anything else.

### 3b. Email (optional, the second channel)

Skip this if you only want Telegram. To reach people by email:

1. Pick a provider (Resend is simplest) and set `EMAIL_PROVIDER`, `EMAIL_API_KEY`,
   and `EMAIL_FROM` (a verified sender on a domain you control). Set
   `ACTION_SECRET` to a random string, it signs the one-click links.
2. Sending works now. The Done / Blocked / Snooze links and replies that thread
   to a task both depend on a couple more things:
   - Set `EMAIL_REPLY_DOMAIN` (for example `inbox.yourdomain.com`). Outgoing mail
     then uses a Reply-To of `task+<taskId>@inbox.yourdomain.com` so a reply maps
     straight to the task.
   - Point your provider's inbound parse at `https://YOUR-APP-URL/api/email/inbound`.
     Resend and Postmark post JSON, SendGrid Inbound Parse posts form data, the
     webhook handles all three. Set `EMAIL_INBOUND_SECRET` and configure the
     provider to send it (header `X-Inbound-Secret` or `?secret=`) to reject
     forged posts.
3. The one-click action links work as soon as `ACTION_SECRET` and `APP_URL` are
   set, no inbound parse needed. So even before you wire inbound email, an email
   teammate can mark a task Done or Blocked from the buttons.

In the dashboard Team page, set a person's channel to Email (or leave Auto, which
uses email when they have no Telegram link).

### 4. Environment

Copy `.env.example` to `.env.local` and fill every value. Also set a
`CRON_SECRET` and a `DASHBOARD_PASSWORD` (both just strings you choose).

```bash
cp .env.example .env.local
```

### 5. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with `DASHBOARD_PASSWORD`. To exercise the
bot locally you need a public url for the webhook, use a tunnel (ngrok or the
Vercel preview), set `APP_URL` to it, then do step 7.

### 6. Deploy to Vercel

Push to a repo and import it in Vercel, or run `vercel`. Add every variable from
`.env.local` into the Vercel project settings (Production). Set `APP_URL` to the
deployed url.

Note on cron: `vercel.json` already declares the hourly job. Because you set a
`CRON_SECRET` env var, Vercel automatically sends it as a Bearer token on every
cron run, which is exactly what `/api/cron/standup` checks. Nothing else to wire.

### 7. Register the Telegram webhook

Once deployed (and signed in), visit:

```
https://YOUR-APP-URL/api/setup/telegram-webhook
```

That points Telegram at your inbound route. Re-run it any time `APP_URL` changes.

### 8. Add the team

Open Team in the dashboard and add each person. Choose how to reach them:

- Telegram: send the connect link shown on their card, they tap it and press
  Start, the card flips to ready.
- Email: just give them an email address (Auto picks email when there is no
  Telegram link). Nothing for them to do.

Then assign tasks and the agent takes it from there.

---

## Trying it end to end

1. Add yourself as a teammate. Either connect your Telegram via the link, or set
   your channel to Email with your address.
2. Create a task assigned to yourself with a specific description.
3. Trigger a run without waiting for the hour:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP-URL/api/cron/standup
```

You get the question on your channel. Reply (or tap a Telegram button, or click
an email action link) and watch the task update on the dashboard.

---

## Cadence and tuning

- Hourly is set in `vercel.json` (`0 * * * *`). Change the schedule there.
- There is a hard quiet window so nobody is pinged right after they reply,
  `MIN_HOURS_SINCE_ACTIVITY` in `src/lib/ai/prompts.ts` (default 0.75h).
- The decision logic and the tone of questions live entirely in the prompts in
  `src/lib/ai/prompts.ts`. That file is the product, tune it there.
- The model is `AGENT_MODEL` in env, default `gemini-3.1-pro-preview`. Drop to
  `gemini-2.5-flash` to cut cost and latency.

---

## Auth note

The dashboard is gated by a single shared password behind an httpOnly cookie
(`src/lib/auth.ts`, `src/middleware.ts`). That is deliberate for a founder only
tool. The cron and webhook routes are protected by their own secrets, not the
cookie. If you ever open this to multiple real users, swap the password gate for
Supabase Auth.

---

## File map

```
supabase/schema.sql              Postgres schema, enums, indexes, RLS
src/lib/env.ts                   Validated environment loader
src/lib/db/                      Types, Supabase client, queries
src/lib/transport/               The channel seam
  types.ts                       OutboundTransport + NormalizedInbound
  telegram.ts                    Telegram send, parse, webhook helper
  email.ts                       Email send, buttons as one-click links
  whatsapp.ts                    Stub for later, same interface
  index.ts                       getTransport(channel), channelForUser resolver
src/lib/ai/                      The brain
  prompts.ts                     Decide+ask and process-reply prompts
  agent.ts                       decideAndAsk(), processReply()
  gemini.ts                      Client + JSON helper
src/lib/standup/                 Orchestration
  engine.ts                      The hourly loop, sends on the resolved channel
  inbound.ts                     Shared inbound processor (channel agnostic)
  actions.ts                     Done/Blocked/Snooze, shared by buttons and links
  buttons.ts                     Button definitions and parsing
  sign.ts                        Signs and verifies one-click email links
src/app/api/                     Routes:
  cron/standup                   Hourly engine trigger
  telegram/webhook               Telegram inbound
  email/inbound                  Email reply inbound
  email/action                   One-click email Done/Blocked/Snooze
  tasks, tasks/[id]              Task CRUD
  team, team/[id]                Team CRUD and channel preference
  auth, setup/telegram-webhook   Login, webhook registration
src/app/(dashboard)/             Dashboard pages
src/components/                  UI pieces
src/middleware.ts                Dashboard auth gate
vercel.json                      Hourly cron declaration
```

---

## Adding WhatsApp later

1. Implement `send()` in `src/lib/transport/whatsapp.ts` against your provider
   (Cloud API direct, or AiSensy / Interakt / Twilio).
2. Add `src/app/api/whatsapp/webhook/route.ts` that converts provider payloads
   into `NormalizedInbound` and calls the same `handleInbound()`.
3. Set `ACTIVE_TRANSPORT=whatsapp`.

The dashboard, the engine, the prompts, and the data model do not change. Watch
the WhatsApp specifics noted at the top of `whatsapp.ts` (the 24h window, the
template requirement for the first message, and the 3 button limit).
