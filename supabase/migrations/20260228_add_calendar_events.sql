-- Calendar events table for project scheduling
create table if not exists calendar_events (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references auth.users(id) on delete cascade not null,
  project_name text not null,
  start_date date not null,
  end_date date not null,
  include_weekends boolean not null default false,
  crew text not null default '',
  notes text,
  color text,
  created_at timestamptz default now() not null
);

create index if not exists calendar_events_created_by_idx on calendar_events(created_by);
create index if not exists calendar_events_start_date_idx on calendar_events(start_date);
create index if not exists calendar_events_end_date_idx on calendar_events(end_date);

alter table calendar_events enable row level security;

-- All authenticated users can view calendar events
create policy "Authenticated users can view calendar events"
  on calendar_events for select
  to authenticated
  using (true);

-- Authenticated users can create calendar events
create policy "Authenticated users can create calendar events"
  on calendar_events for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Creators can update their own events
create policy "Users can update own calendar events"
  on calendar_events for update
  to authenticated
  using (auth.uid() = created_by);

-- Creators can delete their own events
create policy "Users can delete own calendar events"
  on calendar_events for delete
  to authenticated
  using (auth.uid() = created_by);
