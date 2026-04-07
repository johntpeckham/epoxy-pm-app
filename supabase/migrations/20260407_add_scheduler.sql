-- ─── Scheduler feature (Phase 1) ─────────────────────────────────────────────
-- Adds scheduler_access flag to profiles (auth-linked users) and a
-- scheduler_weeks table for storing saved crew week schedules.

-- 1) Flag on profiles — controls sidebar link + page access
alter table profiles
  add column if not exists scheduler_access boolean not null default false;

-- 2) Saved week schedules
create table if not exists scheduler_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  schedule_data jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduler_weeks_week_start_idx
  on scheduler_weeks (week_start desc);

-- 3) RLS
alter table scheduler_weeks enable row level security;

-- Read: any authenticated user who is admin OR has scheduler_access
drop policy if exists "scheduler_weeks_select" on scheduler_weeks;
create policy "scheduler_weeks_select"
  on scheduler_weeks for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

-- Insert: same group
drop policy if exists "scheduler_weeks_insert" on scheduler_weeks;
create policy "scheduler_weeks_insert"
  on scheduler_weeks for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

-- Update: same group
drop policy if exists "scheduler_weeks_update" on scheduler_weeks;
create policy "scheduler_weeks_update"
  on scheduler_weeks for update
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

-- Delete: admin only (Phase 2 may refine)
drop policy if exists "scheduler_weeks_delete" on scheduler_weeks;
create policy "scheduler_weeks_delete"
  on scheduler_weeks for delete
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- updated_at trigger
create or replace function scheduler_weeks_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists scheduler_weeks_updated_at on scheduler_weeks;
create trigger scheduler_weeks_updated_at
  before update on scheduler_weeks
  for each row execute function scheduler_weeks_set_updated_at();
