-- Create employees table for timesheet roster
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enable RLS on employees table
alter table employees enable row level security;

-- All authenticated users can read employees
create policy "Authenticated users can read employees"
  on employees for select
  to authenticated
  using (true);

-- Only admins can insert employees
create policy "Admins can insert employees"
  on employees for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can update employees
create policy "Admins can update employees"
  on employees for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can delete employees
create policy "Admins can delete employees"
  on employees for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Add 'timecard' to the post_type CHECK constraint on feed_posts
alter table feed_posts drop constraint if exists feed_posts_post_type_check;
alter table feed_posts add constraint feed_posts_post_type_check
  check (post_type in ('text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report', 'receipt', 'timecard'));

-- Seed 'timesheets' into role_permissions for all non-admin roles (default full access)
insert into role_permissions (role, feature, access_level) values
  ('salesman', 'timesheets', 'full'),
  ('foreman', 'timesheets', 'full'),
  ('crew', 'timesheets', 'full')
on conflict (role, feature) do nothing;
