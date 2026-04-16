export type EstimatingProjectStatus = 'active' | 'completed' | 'on_hold'
export type EstimatingProjectSource =
  | 'job_walk'
  | 'lead'
  | 'appointment'
  | 'manual'

export interface EstimatingProject {
  id: string
  customer_id: string
  name: string
  description: string | null
  status: EstimatingProjectStatus
  source: EstimatingProjectSource | null
  source_ref_id: string | null
  measurements: string | null
  pipeline_stage: string
  project_number: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EstimatingProjectPdf {
  id: string
  project_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_at: string
}

export const PROJECT_STATUS_STYLES: Record<
  EstimatingProjectStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-700' },
  on_hold: { label: 'On Hold', className: 'bg-gray-100 text-gray-600' },
}

export const PROJECT_SOURCE_LABELS: Record<EstimatingProjectSource, string> = {
  job_walk: 'From job walk',
  lead: 'From lead',
  appointment: 'From appointment',
  manual: 'Created manually',
}

export interface PipelineStageAutomationRules {
  auto_advance_trigger?:
    | 'estimate_sent'
    | 'estimate_accepted'
    | 'estimate_declined'
    | 'manual'
  auto_reminder_enabled?: boolean
  auto_reminder_days?: number
}

export interface PipelineStageNotificationRules {
  notify_on_enter?: boolean
  notify_who?: 'creator' | 'assigned' | 'admins' | 'specific'
  notify_specific_user_id?: string | null
  via_in_app?: boolean
  via_email?: boolean
  via_sms?: boolean
}

export interface PipelineStage {
  id: string
  name: string
  display_order: number
  color: string
  is_default: boolean
  is_active: boolean
  automation_rules?: PipelineStageAutomationRules
  notification_rules?: PipelineStageNotificationRules
  created_at: string
  updated_at: string
}

export interface PipelineHistoryEntry {
  id: string
  project_id: string
  from_stage: string | null
  to_stage: string
  changed_by: string | null
  notes: string | null
  created_at: string
}

export type ReminderStatus = 'pending' | 'completed' | 'snoozed' | 'dismissed'
export type ReminderType = 'auto' | 'manual'

export interface EstimatingReminder {
  id: string
  project_id: string
  title: string
  description: string | null
  due_date: string
  reminder_type: ReminderType
  trigger_event: 'estimate_sent' | 'stage_change' | null
  status: ReminderStatus
  snoozed_until: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ReminderRule {
  id: string
  trigger_event: string
  days_after: number
  title_template: string
  is_active: boolean
  created_at: string
}

export const SYSTEM_STAGES = ['Won', 'Lost'] as const
