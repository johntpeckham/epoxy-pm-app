-- Epoxy PM App Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects table
create table if not exists projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  client_name text not null,
  address text not null,
  status text not null default 'Active' check (status in ('Active', 'Complete')),
  created_at timestamptz default now() not null
);

-- Feed posts table
create table if not exists feed_posts (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('text', 'photo', 'daily_report')),
  content jsonb not null default '{}',
  is_pinned boolean not null default false,
  created_at timestamptz default now() not null
);

-- Indexes for performance
create index if not exists feed_posts_project_id_idx on feed_posts(project_id);
create index if not exists feed_posts_created_at_idx on feed_posts(project_id, created_at);
create index if not exists feed_posts_pinned_idx on feed_posts(project_id, is_pinned) where is_pinned = true;

-- Row Level Security
alter table projects enable row level security;
alter table feed_posts enable row level security;

-- Policies: all authenticated users can read/write everything (up to 10 users, internal team)
create policy "Authenticated users can view projects"
  on projects for select
  to authenticated
  using (true);

create policy "Authenticated users can insert projects"
  on projects for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update projects"
  on projects for update
  to authenticated
  using (true);

create policy "Authenticated users can delete projects"
  on projects for delete
  to authenticated
  using (true);

create policy "Authenticated users can view feed posts"
  on feed_posts for select
  to authenticated
  using (true);

create policy "Authenticated users can insert feed posts"
  on feed_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can update feed posts"
  on feed_posts for update
  to authenticated
  using (true);

create policy "Authenticated users can delete feed posts"
  on feed_posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Storage bucket for photos
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Authenticated users can upload photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-photos');

create policy "Anyone can view photos"
  on storage.objects for select
  to public
  using (bucket_id = 'post-photos');

create policy "Authenticated users can delete their photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-photos');
