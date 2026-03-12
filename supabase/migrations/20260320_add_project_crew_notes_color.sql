-- Add crew, notes, and color fields to projects table for calendar display
alter table projects
  add column if not exists crew text,
  add column if not exists notes text,
  add column if not exists color text;
