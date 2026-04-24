// Canonical list of the 35 feature keys used by the permission system.
// Must stay in sync with the `feature_keys` table seeded by the Phase 2a
// migration (supabase/migrations/20260524_phase2a_per_user_permissions.sql).

export const FEATURE_KEYS = [
  // Core feature gates (existing)
  'jobs',
  'daily_reports',
  'jsa_reports',
  'receipts',
  'timesheets',
  'photos',
  'tasks',
  'calendar',
  // My Work Page (per-card gates)
  'daily_playbook',
  'assigned_office_work',
  'office_daily_reports',
  'assigned_field_tasks',
  'expenses_summary',
  // Job Board
  'job_board',
  // Sales sub-sections
  'crm',
  'dialer',
  'emailer',
  'leads',
  'appointments',
  'estimating',
  'job_walk',
  // Office
  'office',
  'office_admin',
  'command_center',
  'equipment',
  'scheduling',
  'manage_playbook',
  // Settings tiles
  'company_info',
  'user_management',
  'employee_management',
  'sales_management',
  'vendor_management',
  'warranty_management',
  'prelien_management',
  'material_management',
  'job_feed_forms',
  'job_reports',
  'checklist_templates',
  'data_export',
  'reports',
  'trash_bin',
  // Other
  'billing',
  'scheduler',
  'sops',
  'bug_reports',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type FeatureCategory =
  | 'core'
  | 'my_work_page'
  | 'job_board'
  | 'sales'
  | 'office'
  | 'settings'
  | 'other'

export interface FeatureMetadata {
  displayName: string
  category: FeatureCategory
  sortOrder: number
}

export const FEATURE_METADATA: Record<FeatureKey, FeatureMetadata> = {
  jobs:                 { displayName: 'Job Feed',             category: 'core',      sortOrder: 10 },
  daily_reports:        { displayName: 'Daily Reports',        category: 'core',      sortOrder: 20 },
  jsa_reports:          { displayName: 'JSA Reports',          category: 'core',      sortOrder: 30 },
  receipts:             { displayName: 'Receipts',             category: 'core',      sortOrder: 40 },
  timesheets:           { displayName: 'Timesheets',           category: 'core',      sortOrder: 50 },
  photos:               { displayName: 'Photos',               category: 'core',      sortOrder: 60 },
  tasks:                { displayName: 'Tasks',                category: 'core',      sortOrder: 70 },
  calendar:             { displayName: 'Calendar',             category: 'core',      sortOrder: 80 },
  daily_playbook:       { displayName: 'Daily Playbook',       category: 'my_work_page', sortOrder: 90 },
  assigned_office_work: { displayName: 'Assigned Office Work', category: 'my_work_page', sortOrder: 91 },
  office_daily_reports: { displayName: 'Office Daily Report',  category: 'my_work_page', sortOrder: 92 },
  assigned_field_tasks: { displayName: 'Assigned Field Tasks', category: 'my_work_page', sortOrder: 93 },
  expenses_summary:     { displayName: 'Expenses Summary',     category: 'my_work_page', sortOrder: 94 },
  job_board:            { displayName: 'Job Board',            category: 'job_board', sortOrder: 100 },
  crm:                  { displayName: 'CRM',                  category: 'sales',     sortOrder: 200 },
  dialer:               { displayName: 'Dialer',               category: 'sales',     sortOrder: 210 },
  emailer:              { displayName: 'Emailer',              category: 'sales',     sortOrder: 220 },
  leads:                { displayName: 'Leads',                category: 'sales',     sortOrder: 230 },
  appointments:         { displayName: 'Appointments',         category: 'sales',     sortOrder: 240 },
  estimating:           { displayName: 'Estimating',           category: 'sales',     sortOrder: 250 },
  job_walk:             { displayName: 'Job Walk',             category: 'sales',     sortOrder: 260 },
  office:               { displayName: 'Office',               category: 'office',    sortOrder: 300 },
  office_admin:         { displayName: 'Office Admin',         category: 'office',    sortOrder: 310 },
  command_center:       { displayName: 'Command Center',       category: 'office',    sortOrder: 320 },
  equipment:            { displayName: 'Equipment',            category: 'office',    sortOrder: 330 },
  scheduling:           { displayName: 'Scheduling',           category: 'office',    sortOrder: 340 },
  manage_playbook:      { displayName: 'Manage Playbook',      category: 'office',    sortOrder: 350 },
  company_info:         { displayName: 'Company Info',         category: 'settings',  sortOrder: 400 },
  user_management:      { displayName: 'User Management',      category: 'settings',  sortOrder: 410 },
  employee_management:  { displayName: 'Employee Management',  category: 'settings',  sortOrder: 420 },
  sales_management:     { displayName: 'Sales Management',     category: 'settings',  sortOrder: 430 },
  vendor_management:    { displayName: 'Vendor Management',    category: 'settings',  sortOrder: 440 },
  warranty_management:  { displayName: 'Warranty Management',  category: 'settings',  sortOrder: 450 },
  prelien_management:   { displayName: 'Pre-lien Management',  category: 'settings',  sortOrder: 460 },
  material_management:  { displayName: 'Material Management',  category: 'settings',  sortOrder: 470 },
  job_feed_forms:       { displayName: 'Job Feed Forms',       category: 'settings',  sortOrder: 480 },
  job_reports:          { displayName: 'Job Reports',          category: 'settings',  sortOrder: 490 },
  checklist_templates:  { displayName: 'Checklist Templates',  category: 'settings',  sortOrder: 500 },
  data_export:          { displayName: 'Data Export',          category: 'settings',  sortOrder: 510 },
  reports:              { displayName: 'Reports',              category: 'settings',  sortOrder: 520 },
  trash_bin:            { displayName: 'Trash Bin',            category: 'settings',  sortOrder: 530 },
  billing:              { displayName: 'Billing',              category: 'other',     sortOrder: 600 },
  scheduler:            { displayName: 'Scheduler',            category: 'other',     sortOrder: 610 },
  sops:                 { displayName: 'SOPs',                 category: 'other',     sortOrder: 620 },
  bug_reports:          { displayName: 'Bug Reports',          category: 'other',     sortOrder: 630 },
}
