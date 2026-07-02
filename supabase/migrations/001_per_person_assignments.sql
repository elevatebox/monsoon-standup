-- ============================================================================
-- Per-person assignments
-- Each (task, user) pair carries its own agent state, so one task assigned to
-- several people tracks each person independently. Additive and idempotent:
-- existing single-assignee tasks are backfilled into one assignment each.
-- ============================================================================

create table if not exists task_assignments (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,

  -- Per-person agent state (was on tasks; now lives here, one row per person).
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

alter table task_assignments enable row level security;

-- Scope a person's conversation and audit to their assignment.
alter table messages add column if not exists assignment_id uuid
  references task_assignments(id) on delete cascade;
alter table ai_runs  add column if not exists assignment_id uuid
  references task_assignments(id) on delete cascade;

create index if not exists messages_assignment_idx on messages (assignment_id, created_at);
create index if not exists ai_runs_assignment_idx on ai_runs (assignment_id, created_at);

-- Backfill: one assignment per existing assigned task, carrying its state.
insert into task_assignments
  (task_id, user_id, status, ai_summary, ai_risk, needs_attention,
   agent_enabled, snoozed_until, last_activity_at, last_asked_at)
select id, assignee_id, status, ai_summary, ai_risk, needs_attention,
       agent_enabled, snoozed_until, last_activity_at, last_asked_at
from tasks
where assignee_id is not null
on conflict (task_id, user_id) do nothing;

-- Link existing messages / ai_runs to the right assignment (single-assignee era,
-- so one assignment per task makes this unambiguous).
update messages m set assignment_id = ta.id
from task_assignments ta
where m.task_id = ta.task_id
  and (m.user_id = ta.user_id or m.user_id is null)
  and m.assignment_id is null;

update ai_runs r set assignment_id = ta.id
from task_assignments ta
where r.task_id = ta.task_id
  and r.assignment_id is null;
