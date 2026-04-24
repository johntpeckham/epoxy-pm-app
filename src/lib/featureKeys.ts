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
  'training_certifications',
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
  'marketing',
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
  // My Work Page — renders first in the editor
  daily_playbook:       { displayName: 'Daily Playbook',       category: 'my_work_page', sortOrder: 100 },
  assigned_office_work: { displayName: 'Assigned Office Work', category: 'my_work_page', sortOrder: 110 },
  office_daily_reports: { displayName: 'Office Daily Report',  category: 'my_work_page', sortOrder: 120 },
  assigned_field_tasks: { displayName: 'Assigned Field Tasks', category: 'my_work_page', sortOrder: 130 },
  expenses_summary:     { displayName: 'Expenses Summary',     category: 'my_work_page', sortOrder: 140 },
  // Office — second
  office:               { displayName: 'Office',               category: 'office',    sortOrder: 200 },
  office_admin:         { displayName: 'Office Admin',         category: 'office',    sortOrder: 210 },
  command_center:       { displayName: 'Command Center',       category: 'office',    sortOrder: 220 },
  equipment:            { displayName: 'Equipment',            category: 'office',    sortOrder: 230 },
  scheduling:           { displayName: 'Scheduling',           category: 'office',    sortOrder: 240 },
  manage_playbook:      { displayName: 'Manage Playbook',      category: 'office',    sortOrder: 250 },
  training_certifications: { displayName: 'Training & Certifications', category: 'office', sortOrder: 260 },
  // Job Feed (formerly "Core") — third
  jobs:                 { displayName: 'Job Feed',             category: 'core',      sortOrder: 300 },
  daily_reports:        { displayName: 'Daily Reports',        category: 'core',      sortOrder: 310 },
  jsa_reports:          { displayName: 'JSA Reports',          category: 'core',      sortOrder: 320 },
  receipts:             { displayName: 'Receipts',             category: 'core',      sortOrder: 330 },
  timesheets:           { displayName: 'Timesheets',           category: 'core',      sortOrder: 340 },
  photos:               { displayName: 'Photos',               category: 'core',      sortOrder: 350 },
  tasks:                { displayName: 'Tasks',                category: 'core',      sortOrder: 360 },
  // Job Board — fourth
  job_board:            { displayName: 'Job Board',            category: 'job_board', sortOrder: 400 },
  // Sales — fifth
  crm:                  { displayName: 'CRM',                  category: 'sales',     sortOrder: 500 },
  dialer:               { displayName: 'Dialer',               category: 'sales',     sortOrder: 510 },
  emailer:              { displayName: 'Emailer',              category: 'sales',     sortOrder: 520 },
  leads:                { displayName: 'Leads',                category: 'sales',     sortOrder: 530 },
  appointments:         { displayName: 'Appointments',         category: 'sales',     sortOrder: 540 },
  estimating:           { displayName: 'Estimating',           category: 'sales',     sortOrder: 550 },
  job_walk:             { displayName: 'Job Walk',             category: 'sales',     sortOrder: 560 },
  // Settings — sixth
  company_info:         { displayName: 'Company Info',         category: 'settings',  sortOrder: 600 },
  user_management:      { displayName: 'User Management',      category: 'settings',  sortOrder: 610 },
  employee_management:  { displayName: 'Employee Management',  category: 'settings',  sortOrder: 620 },
  sales_management:     { displayName: 'Sales Management',     category: 'settings',  sortOrder: 630 },
  vendor_management:    { displayName: 'Vendor Management',    category: 'settings',  sortOrder: 640 },
  warranty_management:  { displayName: 'Warranty Management',  category: 'settings',  sortOrder: 650 },
  prelien_management:   { displayName: 'Pre-lien Management',  category: 'settings',  sortOrder: 660 },
  material_management:  { displayName: 'Material Management',  category: 'settings',  sortOrder: 670 },
  job_feed_forms:       { displayName: 'Job Feed Forms',       category: 'settings',  sortOrder: 680 },
  job_reports:          { displayName: 'Job Reports',          category: 'settings',  sortOrder: 690 },
  checklist_templates:  { displayName: 'Checklist Templates',  category: 'settings',  sortOrder: 700 },
  data_export:          { displayName: 'Data Export',          category: 'settings',  sortOrder: 710 },
  reports:              { displayName: 'Reports',              category: 'settings',  sortOrder: 720 },
  trash_bin:            { displayName: 'Trash Bin',            category: 'settings',  sortOrder: 730 },
  // Other — last; Calendar lives here now that the editor is grouped by purpose
  billing:              { displayName: 'Billing',              category: 'other',     sortOrder: 800 },
  scheduler:            { displayName: 'Scheduler',            category: 'other',     sortOrder: 810 },
  sops:                 { displayName: 'SOPs',                 category: 'other',     sortOrder: 820 },
  bug_reports:          { displayName: 'Bug Reports',          category: 'other',     sortOrder: 830 },
  calendar:             { displayName: 'Calendar',             category: 'other',     sortOrder: 840 },
  marketing:            { displayName: 'Marketing',            category: 'other',     sortOrder: 850 },
}
