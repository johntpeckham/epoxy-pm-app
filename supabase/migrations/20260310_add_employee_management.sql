-- Employee Roles table
create table if not exists employee_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Seed default roles
insert into employee_roles (name) values ('Foreman'), ('Finisher'), ('Laborer')
on conflict (name) do nothing;

-- Employee Custom Field Definitions table
create table if not exists employee_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  field_type text default 'text',
  created_at timestamptz default now()
);

-- Employees table (new full employee management table)
create table if not exists employee_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  role text,
  notes text,
  custom_fields jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS policies
alter table employee_roles enable row level security;
alter table employee_custom_field_definitions enable row level security;
alter table employee_profiles enable row level security;

-- Allow authenticated users to read all employee data
create policy "Authenticated users can read employee_roles"
  on employee_roles for select
  to authenticated
  using (true);

create policy "Authenticated users can manage employee_roles"
  on employee_roles for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read employee_custom_field_definitions"
  on employee_custom_field_definitions for select
  to authenticated
  using (true);

create policy "Authenticated users can manage employee_custom_field_definitions"
  on employee_custom_field_definitions for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read employee_profiles"
  on employee_profiles for select
  to authenticated
  using (true);

create policy "Authenticated users can manage employee_profiles"
  on employee_profiles for all
  to authenticated
  using (true)
  with check (true);

-- Storage bucket for employee photos
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', true)
on conflict (id) do nothing;

-- Storage policy: allow authenticated users to upload to employee-photos
create policy "Authenticated users can upload employee photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'employee-photos');

create policy "Authenticated users can update employee photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'employee-photos');

create policy "Anyone can view employee photos"
  on storage.objects for select
  to public
  using (bucket_id = 'employee-photos');
