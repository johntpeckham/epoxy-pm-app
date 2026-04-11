-- ─── Scheduler per-week employee assignments ────────────────────────────
-- Adds a normalized table that ties each employee-to-job assignment to a
-- specific week (identified by the Monday of that week). This replaces the
-- previous "all-in-one JSON blob per week_start" approach for bucket
-- assignments so that switching weeks in the scheduler can filter the
-- employees shown in each bucket.

create table if not exists scheduler_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  week_start date not null,
  day_mon boolean not null default false,
  day_tue boolean not null default false,
  day_wed boolean not null default false,
  day_thu boolean not null default false,
  day_fri boolean not null default false,
  day_sat boolean not null default false,
  day_sun boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, employee_id, week_start)
);

create index if not exists scheduler_assignments_week_start_idx
  on scheduler_assignments (week_start);

create index if not exists scheduler_assignments_job_id_idx
  on scheduler_assignments (job_id);

create index if not exists scheduler_assignments_employee_id_idx
  on scheduler_assignments (employee_id);

-- RLS matching scheduler_weeks pattern: admins and users with
-- scheduler_access can read/write. Deletes also allowed for those users
-- (X button on a bucket entry).
alter table scheduler_assignments enable row level security;

drop policy if exists "scheduler_assignments_select" on scheduler_assignments;
create policy "scheduler_assignments_select"
  on scheduler_assignments for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

drop policy if exists "scheduler_assignments_insert" on scheduler_assignments;
create policy "scheduler_assignments_insert"
  on scheduler_assignments for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );

drop policy if exists "scheduler_assignments_update" on scheduler_assignments;
create policy "scheduler_assignments_update"
  on scheduler_assignments for update
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

drop policy if exists "scheduler_assignments_delete" on scheduler_assignments;
create policy "scheduler_assignments_delete"
  on scheduler_assignments for delete
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.scheduler_access = true)
    )
  );
