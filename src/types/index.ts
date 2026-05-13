export type ProjectStatus = 'Active' | 'Completed' | 'Closed'

export interface Project {
  id: string
  name: string
  client_name: string
  /** FK to companies(id). Nullable in the DB so historical pre-CRM-linkage
   *  rows remain valid. New projects always have this set (required at the
   *  form level). Display sites should resolve the customer name via the
   *  joined `companies` field when set, falling back to `client_name`. */
  company_id?: string | null
  /** Populated by Supabase relational selects (e.g. `select('*, companies(id, name)')`).
   *  PostgREST returns FK joins as an array even for many-to-one relationships
   *  (length 0 when the FK is null, length 1 otherwise). Use the
   *  `displayProjectCustomer` helper instead of indexing this directly. */
  companies?: { id: string; name: string }[] | null
  address: string
  status: ProjectStatus
  proposal_number?: string
  start_date?: string | null
  end_date?: string | null
  include_weekends?: boolean
  crew?: string | null
  notes?: string | null
  color?: string | null
  drive_time_enabled?: boolean
  drive_time_days?: number
  drive_time_position?: 'front' | 'back' | 'both'
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
  proposal_number: string
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

export type PostType = 'text' | 'photo' | 'daily_report' | 'task' | 'pdf' | 'jsa_report' | 'receipt' | 'expense' | 'timecard'

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

export type ReceiptCategory = 'Materials' | 'Fuel' | 'Tools' | 'Equipment Rental' | 'Subcontractor' | 'Office Supplies' | 'Other'

export interface ReceiptContent {
  receipt_photo: string  // storage path in 'post-photos' bucket (optional, may be empty)
  vendor_name: string
  receipt_date: string   // ISO format (YYYY-MM-DD)
  total_amount: number   // defaults to 0 if not provided
  category: ReceiptCategory | ''
}

export type ExpenseCategory = 'Materials' | 'Labor' | 'Equipment' | 'Subcontractor' | 'Other'

export interface ExpenseContent {
  description: string
  amount: number
  category: ExpenseCategory | ''
  date: string           // ISO format (YYYY-MM-DD)
  notes: string
  attachment: string     // storage path in 'post-photos' bucket (optional, may be empty)
}

export interface TimecardEntry {
  employee_name: string
  employee_profile_id?: string | null
  time_in: string   // HH:MM format
  time_out: string   // HH:MM format
  lunch_minutes: number
  total_hours: number
  drive_time?: number | null  // Drive time in hours (not included in total_hours)
}

export interface TimecardContent {
  date: string           // ISO format (YYYY-MM-DD)
  project_name: string
  address: string
  entries: TimecardEntry[]
  grand_total_hours: number
}

export type PostContent = TextContent | PhotoContent | DailyReportContent | TaskContent | PdfContent | JsaReportContent | ReceiptContent | ExpenseContent | TimecardContent

/** A single custom/dynamic field entry saved alongside a form submission. */
export interface DynamicFieldEntry {
  id: string      // template field ID (e.g. 'custom-abc')
  label: string   // human-readable label
  value: string   // the user-entered value
  type: string    // field type (short_text, long_text, etc.)
  order: number   // display order from the template
  section?: string // label of the section_header this field belongs to
}

export interface FeedPost {
  id: string
  project_id: string
  user_id: string
  post_type: PostType
  content: PostContent
  dynamic_fields?: DynamicFieldEntry[]
  is_pinned: boolean
  created_at: string
  author_email?: string
  author_name?: string
  author_avatar_url?: string
}

export type UserRole = 'admin' | 'salesman' | 'office_manager' | 'foreman' | 'crew'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  scheduler_access?: boolean
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
  dynamic_fields?: DynamicFieldEntry[]
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

export interface CslbLicense {
  id: string
  number: string
  classification: string
}

export interface CompanySettings {
  id: string
  logo_url: string | null
  company_name: string | null
  legal_name: string | null
  dba: string | null
  company_address: string | null
  mailing_address: string | null
  phone: string | null
  email: string | null
  cslb_licenses: CslbLicense[] | null
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
  project_id: string | null
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

export type AssignedTaskType = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'one_time'

export type AssignedTaskSource = 'manage' | 'self'

export interface AssignedTask {
  id: string
  title: string
  description: string | null
  task_type: AssignedTaskType
  day_of_week: number | null
  day_of_month: number | null
  specific_date: string | null
  assigned_to: string
  created_by: string | null
  source: AssignedTaskSource
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AssignedTaskCompletion {
  id: string
  task_id: string
  user_id: string
  completion_date: string
  is_completed: boolean
  note: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeProfile {
  id: string
  name: string
  is_active: boolean
  photo_url: string | null
  role: string | null
  notes: string | null
  custom_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

export interface EmployeeRole {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface EquipmentCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface EmployeeCertification {
  id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface EmployeeCertificationAssignment {
  id: string
  employee_id: string
  certification_id: string
  created_at: string
}

export interface EmployeeOshaTraining {
  id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface EmployeeOshaAssignment {
  id: string
  employee_id: string
  osha_training_id: string
  created_at: string
}

export interface Crew {
  id: string
  name: string
  created_at: string
}

export interface SkillType {
  id: string
  name: string
  created_at: string
}

export interface EmployeeCrew {
  id: string
  employee_id: string
  crew_id: string
  created_at: string
}

export interface EmployeeSkillType {
  id: string
  employee_id: string
  skill_type_id: string
  created_at: string
}

export interface EmployeeCustomFieldDefinition {
  id: string
  label: string
  field_type: string
  created_at: string
}

// FeatureKey is defined in src/lib/featureKeys.ts (the canonical 35-key list
// that matches the feature_keys DB table). Re-exported here so existing
// `import type { FeatureKey } from '@/types'` sites keep working.
import type { FeatureKey } from '@/lib/featureKeys'
export type { FeatureKey }

export interface ProjectPin {
  id: string
  user_id: string
  project_id: string
  created_at: string
}

export type AccessLevel = 'full' | 'create' | 'view_only' | 'off'

export interface RolePermission {
  id: string
  role: string
  feature: FeatureKey
  access_level: AccessLevel
  updated_at: string
}

export type FormFieldType = 'short_text' | 'long_text' | 'checkbox' | 'checkbox_group' | 'dropdown' | 'date' | 'number' | 'section_header' | 'signature' | 'checklist_placeholder' | 'material_system_placeholder' | 'field_guide_placeholder' | 'picture_upload'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder: string
  required: boolean
  options: string[]
  order: number
}

export interface FormTemplate {
  id: string
  form_key: string
  form_name: string
  fields: FormField[]
  updated_at: string
}

export type OfficePriority = 'Low' | 'Normal' | 'High' | 'Urgent'

export interface OfficeTask {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  project_id: string | null
  is_completed: boolean
  due_date: string | null
  priority: OfficePriority
  created_by: string
  created_at: string
  updated_at: string
}

export interface WarrantyTemplate {
  id: string
  name: string
  description: string | null
  body_text: string
  warranty_duration: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ManufacturerWarranty {
  id: string
  name: string
  file_url: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

export interface ProjectWarranty {
  id: string
  project_id: string
  template_id: string | null
  title: string
  generated_content: string
  signature_name: string | null
  manufacturer_warranty_ids: string[] | null
  pdf_url: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PreLienTemplate {
  id: string
  name: string
  description: string | null
  body: string | null
  created_at: string
  updated_at: string
}

export interface ProjectPreLien {
  id: string
  project_id: string
  template_id: string | null
  template_name: string | null
  form_data: Record<string, unknown> | null
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InventoryUnit = string

export interface UnitType {
  id: string
  name: string
  abbreviation: string
  sort_order: number
  created_at: string
}

export interface MaterialSupplier {
  id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
  master_supplier_id: string | null
}

export interface InventoryKitGroup {
  id: string
  supplier_id: string
  name: string
  full_kits: number
  full_kit_size: string | null
  partial_kits: number
  partial_kit_size: string | null
  kit_price: number | null
  sort_order: number
  created_at: string
  master_kit_group_id: string | null
}

export interface InventoryProduct {
  id: string
  supplier_id: string
  kit_group_id: string | null
  name: string
  quantity: number
  unit: InventoryUnit
  price: number | null
  stock_check_date: string | null
  /** FK to the currently pending office_task requesting a stock check. */
  stock_check_task_id: string | null
  price_check_date: string | null
  /** FK to the currently pending office_task requesting a price check. */
  price_check_task_id: string | null
  sort_order: number
  created_at: string
  master_product_id: string | null
}

/* ================================================================== */
/*  Material Management (master catalog) types                         */
/* ================================================================== */

export interface MasterSupplier {
  id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
}

export interface MasterKitGroup {
  id: string
  supplier_id: string
  name: string
  price: number | null
  sort_order: number
  created_at: string
}

export interface MasterProduct {
  id: string
  supplier_id: string
  kit_group_id: string | null
  name: string
  unit: string
  price: number | null
  price_check_date: string | null
  price_check_task_id: string | null
  sort_order: number
  created_at: string
}

export interface MasterProductDocument {
  id: string
  product_id: string
  document_type: 'PDS' | 'SDS'
  file_name: string
  file_url: string
  created_at: string
}
