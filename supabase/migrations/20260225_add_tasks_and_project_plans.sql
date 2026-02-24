-- Tasks table for task management
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'unable_to_complete')),
  photo_url text,
  due_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists tasks_project_id_idx on tasks(project_id);
create index if not exists tasks_created_by_idx on tasks(created_by);
create index if not exists tasks_assigned_to_idx on tasks(assigned_to);
create index if not exists tasks_status_idx on tasks(status);

alter table tasks enable row level security;

-- All authenticated users can view tasks
create policy "Authenticated users can view tasks"
  on tasks for select
  to authenticated
  using (true);

-- All authenticated users can create tasks
create policy "Authenticated users can create tasks"
  on tasks for insert
  to authenticated
  with check (auth.uid() = created_by);

-- All authenticated users can update any task (for status changes)
create policy "Authenticated users can update tasks"
  on tasks for update
  to authenticated
  using (true);

-- Task creators can delete their own tasks
create policy "Users can delete own tasks"
  on tasks for delete
  to authenticated
  using (auth.uid() = created_by);

-- Auto-update updated_at on tasks
create or replace function update_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_tasks_updated_at();

-- Project plans table for storing plan documents linked to projects
create table if not exists project_plans (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists project_plans_project_id_idx on project_plans(project_id);

alter table project_plans enable row level security;

-- All authenticated users can view project plans
create policy "Authenticated users can view project plans"
  on project_plans for select
  to authenticated
  using (true);

-- All authenticated users can create project plans
create policy "Authenticated users can create project plans"
  on project_plans for insert
  to authenticated
  with check (auth.uid() = user_id);

-- All authenticated users can update project plans
create policy "Authenticated users can update project plans"
  on project_plans for update
  to authenticated
  using (true);

-- Plan creators can delete their own plans
create policy "Users can delete own project plans"
  on project_plans for delete
  to authenticated
  using (auth.uid() = user_id);
