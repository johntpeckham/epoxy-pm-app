export interface ProjectTakeoffProject {
  id: string
  company_id: string
  name: string
  description: string | null
  status: string
  measurements: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectTakeoffMeasurementPdf {
  id: string
  project_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_by: string | null
  created_at: string
}
