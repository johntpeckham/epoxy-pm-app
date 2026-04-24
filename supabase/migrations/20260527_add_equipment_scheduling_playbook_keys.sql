-- ════════════════════════════════════════════════════════════════════════════
-- Add 3 new feature keys: equipment, scheduling, manage_playbook
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   • Inserts 3 new rows into feature_keys (category 'office').
--   • Inserts template_permissions rows for the 4 system templates × 3 new
--     features with the agreed defaults.
--   • Backfills user_permissions for every existing non-admin profile from
--     role → access_level mapping (same pattern as Phase 2a).
--
-- Admin users are INTENTIONALLY excluded (matches Phase 2a pattern — admin
-- access is handled via a shortcut in the usePermissions hook).
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING on unique constraints).
-- ════════════════════════════════════════════════════════════════════════════


-- ── a) Seed the 3 new feature keys ─────────────────────────────────────────
insert into feature_keys (feature, category, display_name, sort_order) values
  ('equipment',       'office', 'Equipment',       330),
  ('scheduling',      'office', 'Scheduling',      340),
  ('manage_playbook', 'office', 'Manage Playbook', 350)
on conflict (feature) do update set
  category     = excluded.category,
  display_name = excluded.display_name,
  sort_order   = excluded.sort_order;


-- ── b) Seed template_permissions for the 4 system templates × 3 features ───
-- Defaults agreed:
--   equipment:       crew=view_only, foreman=full, salesman=full, office_manager=full
--   scheduling:      crew=off,       foreman=off,  salesman=full, office_manager=full
--   manage_playbook: crew=off,       foreman=off,  salesman=off,  office_manager=off

with
  crew as (select id from permission_templates where name = 'Crew default'),
  foreman as (select id from permission_templates where name = 'Foreman default'),
  salesman as (select id from permission_templates where name = 'Salesman default'),
  office_mgr as (select id from permission_templates where name = 'Office Manager default'),
  defaults (feature, crew_lvl, foreman_lvl, salesman_lvl, office_mgr_lvl) as (
    values
      ('equipment',       'view_only', 'full', 'full', 'full'),
      ('scheduling',      'off',       'off',  'full', 'full'),
      ('manage_playbook', 'off',       'off',  'off',  'off')
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
-- Maps each user's current profile.role → access_level per new feature,
-- using the same role→template mapping defined in Phase 2a. Admins are
-- excluded (handled via hook shortcut — no rows needed).

with
  defaults (role, feature, access_level) as (
    values
      ('crew',           'equipment',       'view_only'),
      ('crew',           'scheduling',      'off'),
      ('crew',           'manage_playbook', 'off'),
      ('foreman',        'equipment',       'full'),
      ('foreman',        'scheduling',      'off'),
      ('foreman',        'manage_playbook', 'off'),
      ('salesman',       'equipment',       'full'),
      ('salesman',       'scheduling',      'full'),
      ('salesman',       'manage_playbook', 'off'),
      ('office_manager', 'equipment',       'full'),
      ('office_manager', 'scheduling',      'full'),
      ('office_manager', 'manage_playbook', 'off')
  )
insert into user_permissions (user_id, feature, access_level)
select p.id, d.feature, d.access_level
from profiles p
join defaults d on d.role = p.role
where p.role in ('crew','foreman','salesman','office_manager')
on conflict (user_id, feature) do nothing;
