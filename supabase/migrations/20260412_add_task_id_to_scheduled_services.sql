-- ============================================================================
-- Equipment Scheduled Services — Phase 2
-- Add task_id column linking a scheduled service to an office task.
-- When a scheduled service is assigned to a user, a corresponding row in
-- office_tasks is created and referenced here. ON DELETE SET NULL so that
-- manually deleting a task doesn't cascade-delete the scheduled service.
-- ============================================================================

ALTER TABLE equipment_scheduled_services
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES office_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_scheduled_services_task_id
  ON equipment_scheduled_services(task_id);
