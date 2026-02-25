-- Post comments table
create table if not exists post_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references feed_posts(id) on delete cascade,
  user_id uuid references auth.users(id),
  content text not null,
  created_at timestamp with time zone default now()
);

alter table post_comments enable row level security;

create policy "Authenticated users can view comments"
  on post_comments for select to authenticated using (true);

create policy "Authenticated users can insert comments"
  on post_comments for insert to authenticated with check (auth.uid() = user_id);

create policy "Authenticated users can delete own comments"
  on post_comments for delete to authenticated using (auth.uid() = user_id);
