export type EstimatingProjectStatus = 'active' | 'completed' | 'on_hold'
export type EstimatingProjectSource =
  | 'job_walk'
  | 'lead'
  | 'appointment'
  | 'manual'

export interface EstimatingProject {
  id: string
  company_id: string | null
  name: string
  description: string | null
  status: EstimatingProjectStatus
  source: EstimatingProjectSource | null
  source_ref_id: string | null
  measurements: string | null
  project_number: string | null
  project_address_street: string | null
  project_address_city: string | null
  project_address_state: string | null
  project_address_zip: string | null
  email: string | null
  phone: string | null
  lead_source: string | null
  lead_category_id: string | null
  converted_at: string | null
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

export type ReminderStatus = 'pending' | 'completed' | 'snoozed' | 'dismissed'
export type ReminderType = 'auto' | 'manual'

export interface EstimatingReminder {
  id: string
  project_id: string
  title: string
  description: string | null
  due_date: string
  reminder_type: ReminderType
  trigger_event: 'proposal_sent' | 'stage_change' | null
  status: ReminderStatus
  snoozed_until: string | null
  completed_at: string | null
  created_by: string | null
  assigned_to: string | null
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

// ── Estimate types ─────────────────────────────────────────────────────

export type EstimateStatus = 'draft' | 'complete'

export interface Estimate {
  id: string
  project_id: string
  customer_id: string | null
  template_id: string | null
  name: string
  status: EstimateStatus
  overhead_percent: number
  profit_percent: number
  mobilization_cost: number
  misc_cost: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EstimateTemplate {
  id: string
  name: string
  description: string | null
  area_types: string[]
  default_materials: unknown[]
  default_labor: unknown[]
  default_prep_tools: unknown[]
  default_sundries: unknown[]
  default_travel: unknown[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EstimateAreaType = 'floor' | 'roof' | 'walls' | 'cove' | 'custom'

export interface EstimateArea {
  id: string
  estimate_id: string
  area_type: EstimateAreaType
  name: string
  parent_area_id: string | null
  sort_order: number
  created_at: string
}

export type EstimateSectionInputMode = 'dimensioned' | 'total_only'

export interface EstimateAreaMeasurement {
  id: string
  area_id: string
  section_name: string | null
  length: number | null
  width: number | null
  total: number | null
  input_mode: EstimateSectionInputMode
  sort_order: number
  created_at: string
}

export interface EstimateMaterial {
  id: string
  estimate_id: string
  product_name: string
  description: string | null
  unit: string | null
  quantity: number
  cost_per_unit: number
  total: number
  manufacturer_product_id: string | null
  sort_order: number
  created_at: string
}

export interface EstimateLabor {
  id: string
  estimate_id: string
  crew_group: string
  role: string
  hourly_rate: number
  estimated_hours: number
  total: number
  is_drive_time: boolean
  sort_order: number
  created_at: string
}

export interface EstimatePrepTool {
  id: string
  estimate_id: string
  product_name: string
  description: string | null
  quantity: number
  cost_per_unit: number
  total: number
  sort_order: number
  created_at: string
}

export interface EstimateSundry {
  id: string
  estimate_id: string
  product_name: string
  description: string | null
  quantity: number
  cost_per_unit: number
  total: number
  sort_order: number
  created_at: string
}

export interface EstimateTravel {
  id: string
  estimate_id: string
  item_name: string
  details: string | null
  quantity: number
  rate: number
  total: number
  sort_order: number
  created_at: string
}

export interface EstimateSettings {
  id: string
  tax_rate: number
  mobilization_cost: number
  overhead_percent: number
  profit_percent: number
  updated_by: string | null
  updated_at: string
}

export const ESTIMATE_STATUS_STYLES: Record<EstimateStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-700' },
}

export const AREA_TYPE_STYLES: Record<EstimateAreaType, { label: string; className: string; unit: string }> = {
  floor: { label: 'Floor', className: 'bg-blue-100 text-blue-700', unit: 'SF' },
  roof: { label: 'Roof', className: 'bg-red-100 text-red-700', unit: 'SF' },
  walls: { label: 'Walls', className: 'bg-amber-100 text-amber-700', unit: 'SF' },
  cove: { label: 'Cove', className: 'bg-green-100 text-green-700', unit: 'LF' },
  custom: { label: 'Custom', className: 'bg-gray-100 text-gray-600', unit: 'SF' },
}
