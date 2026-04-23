-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2a — Per-user permission system (data layer only)
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does (high level):
--   • Introduces a canonical `feature_keys` reference list (35 keys).
--   • Adds `permission_templates` + `template_permissions` for seeded and
--     admin-created presets.
--   • Adds `user_permissions` (keyed by user_id + feature) which is the new
--     authoritative source of access levels for every non-admin user.
--   • Seeds four system templates ("Crew default", "Foreman default",
--     "Salesman default", "Office Manager default") with sensible defaults.
--   • Backfills `user_permissions` for every existing non-admin profile from
--     role_permissions (for the 8 features it covered) + the matching
--     template (for the other 27) + profiles.scheduler_access (unified into
--     the new `scheduler` feature key).
--
-- Important notes:
--   • role_permissions is DEPRECATED but intentionally NOT dropped in this
--     migration. It remains as a read-only historical record and will be
--     removed in a later cleanup phase once nothing reads from it.
--   • profiles.scheduler_access is REPLACED by the `scheduler` feature key
--     in user_permissions. The column itself is NOT dropped in this
--     migration — several call sites (useUserRole.ts, UserManagement.tsx,
--     api/list-users, app/scheduler/page.tsx) and the scheduler_weeks RLS
--     policies still reference it. Dropping it is deferred to a later phase
--     that also updates those references. See the commented-out DROP at the
--     end of this file.
--   • Admin users are INTENTIONALLY excluded from user_permissions. Admin
--     access is handled via a shortcut in the usePermissions hook
--     (admin → 'full' for every feature, no DB lookup).
--   • RLS on the new tables is intentionally simple in this phase — the
--     hook enforces access_level in the UI. Stricter server-side enforcement
--     can be added later without schema changes.
-- ════════════════════════════════════════════════════════════════════════════


-- ── a) feature_keys: authoritative list of all feature keys ────────────────
create table if not exists feature_keys (
  feature text primary key,
  category text not null,
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table feature_keys enable row level security;

drop policy if exists "Authenticated users can read feature_keys" on feature_keys;
create policy "Authenticated users can read feature_keys"
  on feature_keys for select
  to authenticated
  using (true);


-- ── b) Seed all 35 feature keys ────────────────────────────────────────────
insert into feature_keys (feature, category, display_name, sort_order) values
  -- Core feature gates (existing)
  ('jobs',                 'core',     'Job Feed',              10),
  ('daily_reports',        'core',     'Daily Reports',         20),
  ('jsa_reports',          'core',     'JSA Reports',           30),
  ('receipts',             'core',     'Receipts',              40),
  ('timesheets',           'core',     'Timesheets',            50),
  ('photos',               'core',     'Photos',                60),
  ('tasks',                'core',     'Tasks',                 70),
  ('calendar',             'core',     'Calendar',              80),
  -- Job Board
  ('job_board',            'job_board','Job Board',            100),
  -- Sales sub-sections
  ('crm',                  'sales',    'CRM',                  200),
  ('dialer',               'sales',    'Dialer',               210),
  ('emailer',              'sales',    'Emailer',              220),
  ('leads',                'sales',    'Leads',                230),
  ('appointments',         'sales',    'Appointments',         240),
  ('estimating',           'sales',    'Estimating',           250),
  ('job_walk',             'sales',    'Job Walk',             260),
  -- Office
  ('office',               'office',   'Office',               300),
  ('office_admin',         'office',   'Office Admin',         310),
  ('command_center',       'office',   'Command Center',       320),
  -- Settings tiles
  ('company_info',         'settings', 'Company Info',         400),
  ('user_management',      'settings', 'User Management',      410),
  ('employee_management',  'settings', 'Employee Management',  420),
  ('sales_management',     'settings', 'Sales Management',     430),
  ('vendor_management',    'settings', 'Vendor Management',    440),
  ('warranty_management',  'settings', 'Warranty Management',  450),
  ('prelien_management',   'settings', 'Pre-lien Management',  460),
  ('material_management',  'settings', 'Material Management',  470),
  ('job_feed_forms',       'settings', 'Job Feed Forms',       480),
  ('job_reports',          'settings', 'Job Reports',          490),
  ('checklist_templates',  'settings', 'Checklist Templates',  500),
  ('data_export',          'settings', 'Data Export',          510),
  ('reports',              'settings', 'Reports',              520),
  ('trash_bin',            'settings', 'Trash Bin',            530),
  -- Other
  ('billing',              'other',    'Billing',              600),
  ('scheduler',            'other',    'Scheduler',            610),
  ('sops',                 'other',    'SOPs',                 620),
  ('bug_reports',          'other',    'Bug Reports',          630)
on conflict (feature) do update set
  category     = excluded.category,
  display_name = excluded.display_name,
  sort_order   = excluded.sort_order;


-- ── c) permission_templates: named presets ─────────────────────────────────
create table if not exists permission_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table permission_templates enable row level security;

drop policy if exists "Authenticated users can read permission_templates" on permission_templates;
create policy "Authenticated users can read permission_templates"
  on permission_templates for select
  to authenticated
  using (true);

drop policy if exists "Admins can insert permission_templates" on permission_templates;
create policy "Admins can insert permission_templates"
  on permission_templates for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can update permission_templates" on permission_templates;
create policy "Admins can update permission_templates"
  on permission_templates for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can delete permission_templates" on permission_templates;
create policy "Admins can delete permission_templates"
  on permission_templates for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ── d) template_permissions: (template_id, feature) → access_level ────────
create table if not exists template_permissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references permission_templates(id) on delete cascade,
  feature text not null,
  access_level text not null default 'off'
    check (access_level in ('full','create','view_only','off')),
  created_at timestamptz not null default now(),
  unique (template_id, feature)
);

create index if not exists template_permissions_template_id_idx
  on template_permissions (template_id);

alter table template_permissions enable row level security;

drop policy if exists "Authenticated users can read template_permissions" on template_permissions;
create policy "Authenticated users can read template_permissions"
  on template_permissions for select
  to authenticated
  using (true);

drop policy if exists "Admins can insert template_permissions" on template_permissions;
create policy "Admins can insert template_permissions"
  on template_permissions for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can update template_permissions" on template_permissions;
create policy "Admins can update template_permissions"
  on template_permissions for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can delete template_permissions" on template_permissions;
create policy "Admins can delete template_permissions"
  on template_permissions for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ── e) user_permissions: (user_id, feature) → access_level ────────────────
create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  feature text not null,
  access_level text not null default 'off'
    check (access_level in ('full','create','view_only','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature)
);

create index if not exists user_permissions_user_id_idx
  on user_permissions (user_id);

alter table user_permissions enable row level security;

-- Users can read their own rows; admins can read all.
drop policy if exists "Users can read own user_permissions" on user_permissions;
create policy "Users can read own user_permissions"
  on user_permissions for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can insert user_permissions" on user_permissions;
create policy "Admins can insert user_permissions"
  on user_permissions for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can update user_permissions" on user_permissions;
create policy "Admins can update user_permissions"
  on user_permissions for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admins can delete user_permissions" on user_permissions;
create policy "Admins can delete user_permissions"
  on user_permissions for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ── f) Seed four system templates ──────────────────────────────────────────
insert into permission_templates (name, description, is_system) values
  ('Crew default',           'Default permissions for Crew role',           true),
  ('Foreman default',        'Default permissions for Foreman role',        true),
  ('Salesman default',       'Default permissions for Salesman role',       true),
  ('Office Manager default', 'Default permissions for Office Manager role', true)
on conflict (name) do nothing;


-- ── g) Seed template_permissions: 35 rows per template ─────────────────────
-- Recommended defaults per the Phase 2a spec. Uses CTEs so we can reference
-- each template's id by name without hard-coding UUIDs.
with
  crew as (select id from permission_templates where name = 'Crew default'),
  foreman as (select id from permission_templates where name = 'Foreman default'),
  salesman as (select id from permission_templates where name = 'Salesman default'),
  office_mgr as (select id from permission_templates where name = 'Office Manager default'),
  defaults (feature, crew_lvl, foreman_lvl, salesman_lvl, office_mgr_lvl) as (
    values
      ('jobs',                'full', 'full', 'full', 'full'),
      ('daily_reports',       'full', 'full', 'full', 'full'),
      ('jsa_reports',         'full', 'full', 'full', 'full'),
      ('receipts',            'full', 'full', 'full', 'full'),
      ('timesheets',          'full', 'full', 'full', 'full'),
      ('photos',              'full', 'full', 'full', 'full'),
      ('tasks',               'full', 'full', 'full', 'full'),
      ('calendar',            'full', 'full', 'full', 'full'),
      ('job_board',           'off',  'full', 'full', 'full'),
      ('crm',                 'off',  'off',  'full', 'full'),
      ('dialer',              'off',  'off',  'full', 'full'),
      ('emailer',             'off',  'off',  'full', 'full'),
      ('leads',               'off',  'off',  'full', 'full'),
      ('appointments',        'off',  'off',  'full', 'full'),
      ('estimating',          'off',  'off',  'full', 'full'),
      ('job_walk',            'off',  'off',  'full', 'full'),
      ('office',              'off',  'off',  'off',  'full'),
      ('office_admin',        'off',  'off',  'off',  'off'),
      ('command_center',      'off',  'off',  'off',  'off'),
      ('company_info',        'off',  'off',  'off',  'off'),
      ('user_management',     'off',  'off',  'off',  'off'),
      ('employee_management', 'off',  'off',  'off',  'full'),
      ('sales_management',    'off',  'off',  'off',  'full'),
      ('vendor_management',   'off',  'off',  'off',  'full'),
      ('warranty_management', 'off',  'off',  'off',  'full'),
      ('prelien_management',  'off',  'off',  'off',  'full'),
      ('material_management', 'off',  'off',  'off',  'full'),
      ('job_feed_forms',      'off',  'off',  'off',  'full'),
      ('job_reports',         'off',  'off',  'off',  'full'),
      ('checklist_templates', 'off',  'off',  'off',  'full'),
      ('data_export',         'off',  'off',  'off',  'full'),
      ('reports',             'off',  'off',  'off',  'full'),
      ('trash_bin',           'off',  'off',  'off',  'off'),
      ('billing',             'off',  'off',  'off',  'full'),
      ('scheduler',           'off',  'off',  'off',  'off'),
      ('sops',                'off',  'off',  'off',  'full'),
      ('bug_reports',         'off',  'off',  'off',  'full')
  )
insert into template_permissions (template_id, feature, access_level)
select crew.id, d.feature, d.crew_lvl from defaults d, crew
union all
select foreman.id, d.feature, d.foreman_lvl from defaults d, foreman
union all
select salesman.id, d.feature, d.salesman_lvl from defaults d, salesman
union all
select office_mgr.id, d.feature, d.office_mgr_lvl from defaults d, office_mgr
on conflict (template_id, feature) do nothing;


-- ── h) Backfill user_permissions for every existing non-admin profile ──────
-- Precedence for each (user, feature) row:
--   1) If role_permissions has a matching (role, feature) row → use that
--      access_level (preserves any admin-customized values from the old
--      matrix).
--   2) Else use the matching template's access_level.
--   3) Special-case `scheduler`: use 'full' if profiles.scheduler_access is
--      true, otherwise 'off' — ignoring the template.
-- Admin profiles are skipped entirely (handled via hook shortcut).

with
  role_to_template (role, template_name) as (
    values
      ('crew',           'Crew default'),
      ('foreman',        'Foreman default'),
      ('salesman',       'Salesman default'),
      ('office_manager', 'Office Manager default')
  ),
  user_feature_matrix as (
    select
      p.id              as user_id,
      p.role            as role,
      coalesce(p.scheduler_access, false) as scheduler_access,
      fk.feature        as feature
    from profiles p
    cross join feature_keys fk
    where p.role in ('crew','foreman','salesman','office_manager')
  )
insert into user_permissions (user_id, feature, access_level)
select
  ufm.user_id,
  ufm.feature,
  case
    when ufm.feature = 'scheduler' then
      case when ufm.scheduler_access then 'full' else 'off' end
    when rp.access_level is not null then rp.access_level
    else coalesce(tp.access_level, 'off')
  end as access_level
from user_feature_matrix ufm
left join role_permissions rp
  on rp.role = ufm.role and rp.feature = ufm.feature
left join role_to_template r2t
  on r2t.role = ufm.role
left join permission_templates pt
  on pt.name = r2t.template_name
left join template_permissions tp
  on tp.template_id = pt.id and tp.feature = ufm.feature
on conflict (user_id, feature) do nothing;


-- ── i) Drop profiles.scheduler_access — DEFERRED ───────────────────────────
-- The column is the authoritative source for the following live references
-- that cannot be edited in Phase 2a (guard rail):
--
--   • src/lib/useUserRole.ts            (reads role + scheduler_access)
--   • src/components/profile/UserManagement.tsx (reads + writes it)
--   • src/app/api/list-users/route.ts   (selects + returns it)
--   • src/app/(dashboard)/scheduler/page.tsx (server-side access check)
--   • supabase migration 20260407_add_scheduler.sql — scheduler_weeks RLS
--     policies reference profiles.scheduler_access in USING/WITH CHECK; a
--     DROP would leave those policies pointing at a nonexistent column.
--
-- Step (h) above has already copied every user's scheduler_access value into
-- user_permissions as the `scheduler` feature, so no data is lost. Run the
-- statement below only after the above sites + RLS policies have been
-- updated to read from user_permissions in a later phase.
--
-- alter table profiles drop column if exists scheduler_access;


-- ── k) role_permissions is intentionally preserved (deprecated, unused) ────
-- No action taken here. Cleanup in a later phase.
