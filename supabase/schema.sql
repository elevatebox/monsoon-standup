-- ============================================================================
-- Standup Agent schema
-- Run this in the Supabase SQL editor (or via the Supabase CLI) once.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- Enums ---------------------------------------------------------------------
do $$ begin
  create type task_status as enum ('todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_risk as enum ('on_track', 'slipping', 'blocked', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type channel as enum ('telegram', 'whatsapp', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msg_direction as enum ('outbound', 'inbound', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_decision as enum ('ask', 'skip');
exception when duplicate_object then null; end $$;

-- How a teammate should be reached. 'auto' = Telegram if linked, else email.
do $$ begin
  create type channel_pref as enum ('auto', 'telegram', 'email');
exception when duplicate_object then null; end $$;

-- Team members (assignees) --------------------------------------------------
create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text,
  role              text,                       -- free text, e.g. "Backend", "Mobile"
  -- Which channel the agent uses for this person.
  preferred_channel channel_pref not null default 'auto',
  -- Telegram link. Null until the person taps Start on the bot.
  telegram_chat_id  bigint unique,
  -- One-time token used to bind a Telegram chat to this user via the /start deep link.
  onboarding_token  text unique default encode(gen_random_bytes(12), 'hex'),
  telegram_linked_at timestamptz,
  -- WhatsApp (future channel). Kept here so the same row serves both transports.
  whatsapp_number   text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- If the users table already existed from an earlier run, add the new column.
alter table users add column if not exists preferred_channel channel_pref not null default 'auto';

-- Tasks ---------------------------------------------------------------------
create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,                       -- the brief the AI grounds its questions in
  assignee_id       uuid references users(id) on delete set null,
  status            task_status not null default 'todo',
  priority          smallint not null default 2, -- 1 high, 2 normal, 3 low
  track             text not null default 'product', -- product | sales | gtm | dev
  due_at            timestamptz,

  -- Running AI state, refreshed whenever the assignee replies.
  ai_summary        text,                        -- 1 to 3 sentence rolling summary of progress
  ai_risk           task_risk not null default 'unknown',
  needs_attention   boolean not null default false, -- AI raised a flag for the founder

  -- Agent control per task.
  agent_enabled     boolean not null default true,
  snoozed_until     timestamptz,                 -- agent stays silent until this time

  -- Bookkeeping for the cadence engine.
  last_activity_at  timestamptz not null default now(), -- any inbound or status change
  last_asked_at     timestamptz,                 -- last time the agent sent a question

  created_by        text default 'founder',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists tasks_open_idx
  on tasks (status)
  where status in ('todo', 'in_progress', 'blocked', 'in_review');
create index if not exists tasks_assignee_idx on tasks (assignee_id);

-- Conversation log: every question out and every reply in -------------------
create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  user_id           uuid references users(id) on delete set null,
  direction         msg_direction not null,
  channel           channel not null default 'telegram',
  body              text,
  -- Links or files the person sent back (Telegram file_id, urls, captions).
  attachments       jsonb not null default '[]'::jsonb,
  -- Provider message id, lets us thread and avoid double processing.
  provider_msg_id   text,
  created_at        timestamptz not null default now()
);

create index if not exists messages_task_idx on messages (task_id, created_at);

-- Audit of what the hourly agent decided, every run -------------------------
create table if not exists ai_runs (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  decision          ai_decision not null,
  question          text,                        -- the question sent, if decision = ask
  reasoning         text,                        -- why the agent decided this (for your trust)
  model             text,
  created_at        timestamptz not null default now()
);

create index if not exists ai_runs_task_idx on ai_runs (task_id, created_at);

-- Keep updated_at fresh -----------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
  for each row execute function touch_updated_at();

-- Per-person assignments ----------------------------------------------------
-- Each (task, user) pair carries its own agent state, so one task assigned to
-- several people tracks each person independently. The task row holds the shared
-- brief (title, description, due, priority); the agent state lives here.
create table if not exists task_assignments (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  status            task_status not null default 'todo',
  ai_summary        text,
  ai_risk           task_risk not null default 'unknown',
  needs_attention   boolean not null default false,
  agent_enabled     boolean not null default true,
  snoozed_until     timestamptz,
  last_activity_at  timestamptz not null default now(),
  last_asked_at     timestamptz,
  notified_at       timestamptz,            -- when the creation notice was sent
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists ta_task_idx on task_assignments (task_id);
create index if not exists ta_user_status_idx on task_assignments (user_id, status);

drop trigger if exists ta_touch on task_assignments;
create trigger ta_touch before update on task_assignments
  for each row execute function touch_updated_at();

-- A person's conversation and audit are scoped to their assignment.
alter table messages add column if not exists assignment_id uuid
  references task_assignments(id) on delete cascade;
alter table ai_runs  add column if not exists assignment_id uuid
  references task_assignments(id) on delete cascade;
create index if not exists messages_assignment_idx on messages (assignment_id, created_at);
create index if not exists ai_runs_assignment_idx on ai_runs (assignment_id, created_at);

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- The backend (cron engine, Telegram webhook, dashboard server actions) talks
-- to Supabase with the SERVICE ROLE key, which bypasses RLS. That is correct
-- for this app: there is a single trusted admin (you) and no end users hitting
-- the database directly from a browser.
--
-- We still enable RLS and add NO permissive policies, so that if the anon or
-- authenticated keys ever leak, they can read/write nothing.
-- ============================================================================
alter table users            enable row level security;
alter table tasks            enable row level security;
alter table task_assignments enable row level security;
alter table messages         enable row level security;
alter table ai_runs          enable row level security;
-- (Intentionally no policies. Service role bypasses RLS.)
