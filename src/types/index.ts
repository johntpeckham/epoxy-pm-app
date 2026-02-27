export type ProjectStatus = 'Active' | 'Complete'

export interface Project {
  id: string
  name: string
  client_name: string
  address: string
  status: ProjectStatus
  estimate_number?: string
  created_at: string
}

export type DocumentCategory = 'report' | 'plan'

export interface ProjectDocument {
  id: string
  project_id: string
  user_id: string
  bucket: string
  file_path: string
  file_name: string
  file_type: string
  document_type: string
  created_at: string
}

export interface ProjectReportData {
  // Project Details
  project_name: string
  estimate_number: string
  address: string
  client_name: string
  client_email: string
  client_phone: string
  site_contact: string
  prevailing_wage: string
  bonding_insurance: string
  bid_date: string
  bid_platform: string
  project_details_notes: string
  // Project Durations
  start_date: string
  finish_date: string
  num_mobilizations: string
  working_hours: string
  durations_notes: string
  // Scope Of Work
  scope_description: string
  num_rooms_sections: string
  square_footages: string
  linear_footage: string
  cove_curb_height: string
  room_numbers_names: string
  open_areas_machines: string
  scope_notes: string
  // Site Information
  power_supplied: string
  lighting_requirements: string
  heating_cooling_requirements: string
  rental_requirements: string
  rental_location: string
  rental_duration: string
  site_notes: string
  // Travel Information
  hotel_name: string
  hotel_location: string
  reservation_number: string
  reservation_contact: string
  credit_card_auth: string
  drive_time: string
  per_diem: string
  vehicles: string
  trailers: string
  travel_notes: string
  // Material System (3 open text rows)
  material_system_1: string
  material_system_2: string
  material_system_3: string
  // Material Quantities (3 open text rows)
  material_quantities_1: string
  material_quantities_2: string
  material_quantities_3: string
  // Prep
  prep_method: string
  prep_removal: string
  patching_materials: string
  joint_requirements: string
  sloping_requirements: string
  backfill_patching: string
  wet_area: string
  climate_concerns: string
  cooling_heating_constraints: string
  prep_notes: string
}

export interface ProjectReport {
  id: string
  project_id: string
  user_id: string
  data: ProjectReportData
  updated_at: string
  created_at: string
}

export type PostType = 'text' | 'photo' | 'daily_report' | 'task' | 'pdf' | 'jsa_report'

export interface TextContent {
  message: string
}

export interface PhotoContent {
  photos: string[] // storage paths
  caption?: string
}

export interface DailyReportContent {
  // Header (auto-filled from project, editable)
  project_name: string
  date: string
  address: string
  // Crew
  reported_by: string
  project_foreman: string
  weather: string
  // Progress (paragraph fields)
  progress: string
  delays: string
  safety: string
  materials_used: string
  employees: string
  // Photos embedded in the report
  photos: string[] // storage paths
}

export interface TaskContent {
  task_id: string
  title: string
  description: string
  status: TaskStatus
  assigned_to: string | null
  due_date: string | null
  photo_url: string | null
}

export interface PdfContent {
  file_url: string  // storage path
  filename: string
  caption?: string
}

export interface JsaTaskEntry {
  templateId: string
  name: string
  hazards: string
  precautions: string
  ppe: string
}

export interface JsaSignatureEntry {
  name: string
  signature: string // base64 PNG data URL
}

export interface JsaReportContent {
  projectName: string
  date: string
  address: string
  weather: string
  preparedBy: string
  siteSupervisor: string
  competentPerson: string
  tasks: JsaTaskEntry[]
  signatures?: JsaSignatureEntry[]
}

export interface JsaTaskTemplate {
  id: string
  name: string
  sort_order: number
  default_hazards: string | null
  default_precautions: string | null
  default_ppe: string | null
  is_active: boolean
  created_at: string
}

export type PostContent = TextContent | PhotoContent | DailyReportContent | TaskContent | PdfContent | JsaReportContent

export interface FeedPost {
  id: string
  project_id: string
  user_id: string
  post_type: PostType
  content: PostContent
  is_pinned: boolean
  created_at: string
  author_email?: string
  author_name?: string
  author_avatar_url?: string
}

export type UserRole = 'admin' | 'salesman' | 'foreman' | 'crew'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  updated_at: string
}

export type TaskStatus = 'new_task' | 'in_progress' | 'completed' | 'unable_to_complete'

export interface Task {
  id: string
  project_id: string
  created_by: string
  assigned_to: string | null
  title: string
  description: string
  status: TaskStatus
  photo_url: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface ProjectPlan {
  id: string
  project_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface CompanySettings {
  id: string
  logo_url: string | null
  company_name: string | null
  updated_at: string
}

export interface PostComment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  // Joined from profiles
  author_name?: string
  author_avatar_url?: string
}

export interface CalendarEvent {
  id: string
  created_by: string
  project_name: string
  start_date: string
  end_date: string
  include_weekends: boolean
  crew: string
  notes: string | null
  color: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export type FeatureKey = 'jobs' | 'daily_reports' | 'jsa_reports' | 'photos' | 'tasks' | 'calendar' | 'project_reports'

export type AccessLevel = 'full' | 'create' | 'view_only' | 'off'

export interface RolePermission {
  id: string
  role: string
  feature: FeatureKey
  access_level: AccessLevel
  updated_at: string
}
