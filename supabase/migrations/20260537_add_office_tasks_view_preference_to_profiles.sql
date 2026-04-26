-- ─── Office Tasks card: My/All view preference (per user) ───────────────────
-- Persists each user's choice between the "My Tasks" and "All Tasks" toggle
-- on the Office page Tasks card so the selection survives refreshes,
-- sign-out, and switching devices. Defaults to 'all' for existing rows.

alter table profiles
  add column if not exists office_tasks_view_preference text
    not null
    default 'all'
    check (office_tasks_view_preference in ('all', 'mine'));

comment on column profiles.office_tasks_view_preference is
  'Per-user toggle for the Office page Tasks card: ''all'' shows everyone''s tasks, ''mine'' filters to tasks assigned to the current user.';
