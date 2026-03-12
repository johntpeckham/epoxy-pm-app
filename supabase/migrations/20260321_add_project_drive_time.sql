-- Add drive time fields to projects table for calendar drive time bars
alter table projects
  add column if not exists drive_time_enabled boolean not null default false,
  add column if not exists drive_time_days integer not null default 1,
  add column if not exists drive_time_position text not null default 'both'
    check (drive_time_position in ('front', 'back', 'both'));
