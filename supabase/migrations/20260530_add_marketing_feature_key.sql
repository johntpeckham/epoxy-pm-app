-- ════════════════════════════════════════════════════════════════════════════
-- Add `marketing` feature key
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   • Inserts a new row into feature_keys (category 'other').
--   • Inserts template_permissions rows for the 4 system templates at 'off'
--     so the Marketing page is admin-only by default.
--   • Backfills user_permissions for every existing non-admin profile with
--     access_level = 'off'.
--
-- Admin users are INTENTIONALLY excluded (matches Phase 2a pattern — admin
-- access is handled via a shortcut in the usePermissions hook).
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING on unique constraints).
-- ════════════════════════════════════════════════════════════════════════════


-- ── a) Seed the new feature key ────────────────────────────────────────────
insert into feature_keys (feature, category, display_name, sort_order) values
  ('marketing', 'other', 'Marketing', 850)
on conflict (feature) do update set
  category     = excluded.category,
  display_name = excluded.display_name,
  sort_order   = excluded.sort_order;


-- ── b) Seed template_permissions for the 4 system templates ────────────────
-- Defaults: all 4 role templates = 'off' (admin-only feature).

with
  crew as (select id from permission_templates where name = 'Crew default'),
  foreman as (select id from permission_templates where name = 'Foreman default'),
  salesman as (select id from permission_templates where name = 'Salesman default'),
  office_mgr as (select id from permission_templates where name = 'Office Manager default')
insert into template_permissions (template_id, feature, access_level)
select crew.id, 'marketing', 'off' from crew
union all
select foreman.id, 'marketing', 'off' from foreman
union all
select salesman.id, 'marketing', 'off' from salesman
union all
select office_mgr.id, 'marketing', 'off' from office_mgr
on conflict (template_id, feature) do nothing;


-- ── c) Backfill user_permissions for every existing non-admin profile ──────
-- Every non-admin gets access_level='off'. Admins skipped — hook shortcut.

insert into user_permissions (user_id, feature, access_level)
select p.id, 'marketing', 'off'
from profiles p
where p.role in ('crew','foreman','salesman','office_manager')
on conflict (user_id, feature) do nothing;
