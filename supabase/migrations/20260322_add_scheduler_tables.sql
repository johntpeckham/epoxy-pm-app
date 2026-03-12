-- Scheduler assignments: tracks which employee is assigned to which job on which day
create table if not exists scheduler_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  assigned_date date not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_scheduler_assignments_project on scheduler_assignments(project_id);
create index if not exists idx_scheduler_assignments_employee on scheduler_assignments(employee_id);
create index if not exists idx_scheduler_assignments_date on scheduler_assignments(assigned_date);
create unique index if not exists idx_scheduler_assignments_unique on scheduler_assignments(project_id, employee_id, assigned_date);

-- Scheduler bucket positions: persists where job buckets are placed on the grid
create table if not exists scheduler_bucket_positions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade unique,
  position_x integer not null default 0,
  position_y integer not null default 0,
  updated_at timestamptz default now() not null
);

-- RLS policies
alter table scheduler_assignments enable row level security;
alter table scheduler_bucket_positions enable row level security;

create policy "Authenticated users can view scheduler_assignments"
  on scheduler_assignments for select to authenticated using (true);
create policy "Authenticated users can insert scheduler_assignments"
  on scheduler_assignments for insert to authenticated with check (true);
create policy "Authenticated users can update scheduler_assignments"
  on scheduler_assignments for update to authenticated using (true);
create policy "Authenticated users can delete scheduler_assignments"
  on scheduler_assignments for delete to authenticated using (true);

create policy "Authenticated users can view scheduler_bucket_positions"
  on scheduler_bucket_positions for select to authenticated using (true);
create policy "Authenticated users can insert scheduler_bucket_positions"
  on scheduler_bucket_positions for insert to authenticated with check (true);
create policy "Authenticated users can update scheduler_bucket_positions"
  on scheduler_bucket_positions for update to authenticated using (true);
create policy "Authenticated users can delete scheduler_bucket_positions"
  on scheduler_bucket_positions for delete to authenticated using (true);
