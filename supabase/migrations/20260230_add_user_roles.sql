-- Add role-based access control to profiles
-- Roles: admin, salesman, foreman, crew (default)

alter table profiles
  add column if not exists role text default 'crew'
  check (role in ('admin', 'salesman', 'foreman', 'crew'));

-- Update RLS policies: only admins can update other users' roles
-- Drop existing update policy if it exists, then create a new one
drop policy if exists "Users can update own profile" on profiles;

-- Allow users to update their own profile (but not their role)
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow admins to update any profile (including role changes)
create policy "Admins can update any profile"
  on profiles for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow all authenticated users to read all profiles (needed for user management)
drop policy if exists "Users can read all profiles" on profiles;
create policy "Users can read all profiles"
  on profiles for select
  using (auth.role() = 'authenticated');

-- To set a user as admin, run:
-- update profiles set role = 'admin' where id = '<user-uuid>';
