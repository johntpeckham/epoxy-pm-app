-- ─── Published schedules ──────────────────────────────────────────────────
-- Stores a JSONB snapshot of a weekly schedule when the user clicks
-- "Publish Schedule" in the Scheduler. One row per week (keyed on
-- week_start). Re-publishing the same week overwrites the previous
-- snapshot via ON CONFLICT … DO UPDATE.

create table if not exists published_schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  published_by uuid not null references profiles(id) on delete cascade,
  published_at timestamptz not null default now(),
  schedule_data jsonb not null,
  unique (week_start)
);

create index if not exists published_schedules_week_start_idx
  on published_schedules (week_start);

-- RLS — same pattern as scheduler_assignments: admin or scheduler_access
alter table published_schedules enable row level security;

drop policy if exists "published_schedules_select" on published_schedules;
create policy "published_schedules_select"
  on published_schedules for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role in ('admin', 'office_manager', 'salesman') or p.scheduler_access = true)
    )
  );

drop policy if exists "published_schedules_insert" on published_schedules;
create policy "published_schedules_insert"
  on published_schedules for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

drop policy if exists "published_schedules_update" on published_schedules;
create policy "published_schedules_update"
  on published_schedules for update
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

drop policy if exists "published_schedules_delete" on published_schedules;
create policy "published_schedules_delete"
  on published_schedules for delete
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
