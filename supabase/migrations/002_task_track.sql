-- Add a "track" to every task: which side of the company it belongs to.
-- product | sales | gtm | dev. Additive and idempotent.
alter table tasks
  add column if not exists track text not null default 'product';
