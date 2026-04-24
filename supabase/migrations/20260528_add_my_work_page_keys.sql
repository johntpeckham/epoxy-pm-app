-- ════════════════════════════════════════════════════════════════════════════
-- Add 5 new feature keys for the My Work page
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   • Inserts 5 new rows into feature_keys (category 'my_work_page').
--   • Inserts template_permissions rows for the 4 system templates × 5 new
--     features with the agreed defaults.
--   • Backfills user_permissions for every existing non-admin profile from
--     role → access_level mapping (same pattern as Phase 2a).
--
-- Admin users are INTENTIONALLY excluded (matches Phase 2a pattern — admin
-- access is handled via a shortcut in the usePermissions hook).
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING on unique constraints).
-- ════════════════════════════════════════════════════════════════════════════


-- ── a) Seed the 5 new feature keys ─────────────────────────────────────────
insert into feature_keys (feature, category, display_name, sort_order) values
  ('daily_playbook',       'my_work_page', 'Daily Playbook',       90),
  ('assigned_office_work', 'my_work_page', 'Assigned Office Work', 91),
  ('office_daily_reports', 'my_work_page', 'Office Daily Report',  92),
  ('assigned_field_tasks', 'my_work_page', 'Assigned Field Tasks', 93),
  ('expenses_summary',     'my_work_page', 'Expenses Summary',     94)
on conflict (feature) do update set
  category     = excluded.category,
  display_name = excluded.display_name,
  sort_order   = excluded.sort_order;


-- ── b) Seed template_permissions for the 4 system templates × 5 features ───
-- Defaults agreed:
--   daily_playbook:        crew=off,  foreman=off,  salesman=full, office_manager=full
--   assigned_office_work:  crew=off,  foreman=off,  salesman=full, office_manager=full
--   office_daily_reports:  crew=off,  foreman=off,  salesman=full, office_manager=full
--   assigned_field_tasks:  crew=full, foreman=full, salesman=full, office_manager=full
--   expenses_summary:      crew=full, foreman=full, salesman=full, office_manager=full

with
  crew as (select id from permission_templates where name = 'Crew default'),
  foreman as (select id from permission_templates where name = 'Foreman default'),
  salesman as (select id from permission_templates where name = 'Salesman default'),
  office_mgr as (select id from permission_templates where name = 'Office Manager default'),
  defaults (feature, crew_lvl, foreman_lvl, salesman_lvl, office_mgr_lvl) as (
    values
      ('daily_playbook',       'off',  'off',  'full', 'full'),
      ('assigned_office_work', 'off',  'off',  'full', 'full'),
      ('office_daily_reports', 'off',  'off',  'full', 'full'),
      ('assigned_field_tasks', 'full', 'full', 'full', 'full'),
      ('expenses_summary',     'full', 'full', 'full', 'full')
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


-- ── c) Backfill user_permissions for every existing non-admin profile ──────
-- Maps each user's current profile.role → access_level per new feature.
-- Admins are excluded (handled via hook shortcut — no rows needed).

with
  defaults (role, feature, access_level) as (
    values
      ('crew',           'daily_playbook',       'off'),
      ('crew',           'assigned_office_work', 'off'),
      ('crew',           'office_daily_reports', 'off'),
      ('crew',           'assigned_field_tasks', 'full'),
      ('crew',           'expenses_summary',     'full'),
      ('foreman',        'daily_playbook',       'off'),
      ('foreman',        'assigned_office_work', 'off'),
      ('foreman',        'office_daily_reports', 'off'),
      ('foreman',        'assigned_field_tasks', 'full'),
      ('foreman',        'expenses_summary',     'full'),
      ('salesman',       'daily_playbook',       'full'),
      ('salesman',       'assigned_office_work', 'full'),
      ('salesman',       'office_daily_reports', 'full'),
      ('salesman',       'assigned_field_tasks', 'full'),
      ('salesman',       'expenses_summary',     'full'),
      ('office_manager', 'daily_playbook',       'full'),
      ('office_manager', 'assigned_office_work', 'full'),
      ('office_manager', 'office_daily_reports', 'full'),
      ('office_manager', 'assigned_field_tasks', 'full'),
      ('office_manager', 'expenses_summary',     'full')
  )
insert into user_permissions (user_id, feature, access_level)
select p.id, d.feature, d.access_level
from profiles p
join defaults d on d.role = p.role
where p.role in ('crew','foreman','salesman','office_manager')
on conflict (user_id, feature) do nothing;
