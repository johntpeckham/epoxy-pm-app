-- ════════════════════════════════════════════════════════════════════════════
-- Add `training_certifications` feature key
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   • Inserts a new row into feature_keys (category 'office').
--   • Inserts template_permissions rows for the 4 system templates.
--       - Crew default            = 'off'
--       - Foreman default         = 'off'
--       - Salesman default        = 'off'
--       - Office Manager default  = 'full'
--   • Backfills user_permissions for every existing non-admin profile based on
--     the user's role, matching the template defaults above.
--
-- Admin users are INTENTIONALLY excluded (matches Phase 2a pattern — admin
-- access is handled via a shortcut in the usePermissions hook).
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING on unique constraints).
-- ════════════════════════════════════════════════════════════════════════════


-- ── a) Seed the new feature key ────────────────────────────────────────────
insert into feature_keys (feature, category, display_name, sort_order) values
  ('training_certifications', 'office', 'Training & Certifications', 260)
on conflict (feature) do update set
  category     = excluded.category,
  display_name = excluded.display_name,
  sort_order   = excluded.sort_order;


-- ── b) Seed template_permissions for the 4 system templates ────────────────
-- Crew/Foreman/Salesman = 'off'; Office Manager = 'full'.

with
  crew as (select id from permission_templates where name = 'Crew default'),
  foreman as (select id from permission_templates where name = 'Foreman default'),
  salesman as (select id from permission_templates where name = 'Salesman default'),
  office_mgr as (select id from permission_templates where name = 'Office Manager default')
insert into template_permissions (template_id, feature, access_level)
select crew.id, 'training_certifications', 'off' from crew
union all
select foreman.id, 'training_certifications', 'off' from foreman
union all
select salesman.id, 'training_certifications', 'off' from salesman
union all
select office_mgr.id, 'training_certifications', 'full' from office_mgr
on conflict (template_id, feature) do nothing;


-- ── c) Backfill user_permissions for every existing non-admin profile ──────
-- Non-admins seeded by role: office_manager = 'full'; all others = 'off'.
-- Admins skipped — hook shortcut grants them full access unconditionally.

insert into user_permissions (user_id, feature, access_level)
select
  p.id,
  'training_certifications',
  case p.role
    when 'office_manager' then 'full'
    else 'off'
  end
from profiles p
where p.role in ('crew','foreman','salesman','office_manager')
on conflict (user_id, feature) do nothing;
