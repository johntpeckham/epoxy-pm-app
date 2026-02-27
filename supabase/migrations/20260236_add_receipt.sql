-- Add 'receipt' to the post_type CHECK constraint on feed_posts
alter table feed_posts drop constraint if exists feed_posts_post_type_check;
alter table feed_posts add constraint feed_posts_post_type_check
  check (post_type in ('text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report', 'receipt'));

-- Seed 'receipts' into role_permissions for all non-admin roles (default full access)
insert into role_permissions (role, feature, access_level) values
  ('salesman', 'receipts', 'full'),
  ('foreman', 'receipts', 'full'),
  ('crew', 'receipts', 'full')
on conflict (role, feature) do nothing;
