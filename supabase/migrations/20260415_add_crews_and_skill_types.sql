-- ─── Crews and Skill Types ─────────────────────────────────────────────
-- Adds two master lists (crews, skill_types) plus many-to-many join
-- tables that associate employee_profiles with crews and skill types.
-- This is Phase 1 — tables and settings UI only. Employee form
-- assignment and view toggles will come in later phases.

-- Crews master list
create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Skill Types master list
create table if not exists skill_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Employee ↔ Crew junction table
create table if not exists employee_crews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  crew_id uuid not null references crews(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (employee_id, crew_id)
);

create index if not exists employee_crews_employee_id_idx
  on employee_crews (employee_id);
create index if not exists employee_crews_crew_id_idx
  on employee_crews (crew_id);

-- Employee ↔ Skill Type junction table
create table if not exists employee_skill_types (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employee_profiles(id) on delete cascade,
  skill_type_id uuid not null references skill_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (employee_id, skill_type_id)
);

create index if not exists employee_skill_types_employee_id_idx
  on employee_skill_types (employee_id);
create index if not exists employee_skill_types_skill_type_id_idx
  on employee_skill_types (skill_type_id);

-- RLS — match the permissive "authenticated users manage" pattern
-- used by the rest of the employee management tables.
alter table crews enable row level security;
alter table skill_types enable row level security;
alter table employee_crews enable row level security;
alter table employee_skill_types enable row level security;

create policy "Authenticated users can read crews"
  on crews for select
  to authenticated
  using (true);

create policy "Authenticated users can manage crews"
  on crews for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read skill_types"
  on skill_types for select
  to authenticated
  using (true);

create policy "Authenticated users can manage skill_types"
  on skill_types for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read employee_crews"
  on employee_crews for select
  to authenticated
  using (true);

create policy "Authenticated users can manage employee_crews"
  on employee_crews for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can read employee_skill_types"
  on employee_skill_types for select
  to authenticated
  using (true);

create policy "Authenticated users can manage employee_skill_types"
  on employee_skill_types for all
  to authenticated
  using (true)
  with check (true);
