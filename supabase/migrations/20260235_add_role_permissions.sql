-- Role-based permissions table
-- Controls what each role (salesman, foreman, crew) can access
-- Admin always has full access and bypasses this table

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('salesman', 'foreman', 'crew')),
  feature text not null,
  access_level text not null default 'full' check (access_level in ('full', 'view_only', 'off')),
  updated_at timestamptz not null default now(),
  unique (role, feature)
);

-- Enable RLS
alter table role_permissions enable row level security;

-- All authenticated users can read permissions
create policy "Authenticated users can read role_permissions"
  on role_permissions for select
  to authenticated
  using (true);

-- Only admins can update permissions
create policy "Admins can update role_permissions"
  on role_permissions for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can insert permissions
create policy "Admins can insert role_permissions"
  on role_permissions for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can delete permissions
create policy "Admins can delete role_permissions"
  on role_permissions for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Seed default values: all roles get full access to everything
insert into role_permissions (role, feature, access_level) values
  ('salesman', 'jobs', 'full'),
  ('salesman', 'daily_reports', 'full'),
  ('salesman', 'jsa_reports', 'full'),
  ('salesman', 'photos', 'full'),
  ('salesman', 'tasks', 'full'),
  ('salesman', 'calendar', 'full'),
  ('salesman', 'project_reports', 'full'),
  ('foreman', 'jobs', 'full'),
  ('foreman', 'daily_reports', 'full'),
  ('foreman', 'jsa_reports', 'full'),
  ('foreman', 'photos', 'full'),
  ('foreman', 'tasks', 'full'),
  ('foreman', 'calendar', 'full'),
  ('foreman', 'project_reports', 'full'),
  ('crew', 'jobs', 'full'),
  ('crew', 'daily_reports', 'full'),
  ('crew', 'jsa_reports', 'full'),
  ('crew', 'photos', 'full'),
  ('crew', 'tasks', 'full'),
  ('crew', 'calendar', 'full'),
  ('crew', 'project_reports', 'full')
on conflict (role, feature) do nothing;
