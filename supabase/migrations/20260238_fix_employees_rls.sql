-- Fix employees RLS policies: allow all authenticated users to manage employees
-- (matching the pattern used by jsa_task_templates)
-- The original migration restricted insert/update/delete to admin-only,
-- which prevents non-admin users from managing the employee roster.

-- Drop the admin-only policies
drop policy if exists "Admins can insert employees" on employees;
drop policy if exists "Admins can update employees" on employees;
drop policy if exists "Admins can delete employees" on employees;

-- Create permissive policies for all authenticated users
create policy "Authenticated users can insert employees"
  on employees for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update employees"
  on employees for update
  to authenticated
  using (true);

create policy "Authenticated users can delete employees"
  on employees for delete
  to authenticated
  using (true);
