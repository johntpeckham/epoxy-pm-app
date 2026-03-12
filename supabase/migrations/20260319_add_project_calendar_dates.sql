-- Add calendar date fields to projects table so jobs can be linked to the calendar
alter table projects
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists include_weekends boolean not null default false;

-- Index for efficient calendar queries (only projects with dates set)
create index if not exists idx_projects_start_date on projects (start_date) where start_date is not null;
