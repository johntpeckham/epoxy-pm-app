-- Add 'new_task' status option and set it as the default
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('new_task', 'in_progress', 'completed', 'unable_to_complete'));
alter table tasks alter column status set default 'new_task';
