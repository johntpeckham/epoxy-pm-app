-- ════════════════════════════════════════════════════════════════════════════
-- Add hide_from_sidebar column to user_permissions
-- ════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   • Adds a per-(user, feature) boolean `hide_from_sidebar` to
--     user_permissions, defaulting to false so all existing rows retain
--     today's behavior (sidebar item remains visible if canView is true).
--   • Paired with UI in UserDetailPageClient that surfaces the toggle for a
--     curated list of 6 features (daily_reports, jsa_reports, receipts,
--     timesheets, photos, tasks).
--
-- Admins intentionally have no user_permissions rows — the hook shortcut
-- returns false for isHiddenFromSidebar, so admins always see the full
-- sidebar regardless of any column state.
--
-- Idempotent (IF NOT EXISTS on the column). Re-runnable without error.
-- ════════════════════════════════════════════════════════════════════════════

alter table user_permissions
  add column if not exists hide_from_sidebar boolean not null default false;
