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
