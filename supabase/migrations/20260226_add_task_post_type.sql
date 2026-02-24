-- Allow 'task' as a feed_posts post_type
alter table feed_posts drop constraint if exists feed_posts_post_type_check;
alter table feed_posts add constraint feed_posts_post_type_check
  check (post_type in ('text', 'photo', 'daily_report', 'task'));
