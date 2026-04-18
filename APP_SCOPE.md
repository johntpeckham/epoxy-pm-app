# Peckham Coatings App — Full Scope Audit

> Generated: 2026-04-18

---

## 1. Tech Stack & Dependencies

### Core Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | React 19.2.3 |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Auth | Supabase Auth (email/password, session cookies, iOS PWA localStorage recovery) |
| Storage | Supabase Storage (9 buckets) |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React 0.575.0 |
| Deployment | PWA-capable (next-pwa) |

### Dependencies by Category

**UI & Layout**
- `lucide-react` — Icon library
- `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/interaction`, `@fullcalendar/react` — Calendar views
- `react-signature-canvas` — Signature capture (JSA reports)

**Drag & Drop**
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — Drag-and-drop (scheduler, checklists, ordering)

**PDF & Export**
- `jspdf` — PDF generation (reports, timecards, estimates, warranties, pre-liens, receipts, schedules)
- `jszip` — ZIP bundling for bulk data export
- `pdfjs-dist` — PDF parsing/viewing (takeoff tool)
- `react-pdf` — PDF viewer component
- `html2canvas-pro` — HTML-to-canvas for PDF rendering
- `xlsx` — Excel export (timesheet reports)

**Other**
- `qrcode.react` — QR code generation (equipment labels)
- `@supabase/ssr`, `@supabase/supabase-js` — Supabase client (server + browser)
- `next-pwa` — Progressive Web App support

---

## 2. Route Map

All dashboard routes live under `src/app/(dashboard)/` and are wrapped in `AuthProvider`.

### My Work
| Route | Description |
|-------|-------------|
| `/my-work` | Personal dashboard — assigned tasks, checklists, office tasks, expenses |
| `/my-work/employee-summary` | Employee performance summary view |
| `/my-work/manage-playbook` | Personal playbook/checklist management |

### Office
| Route | Description |
|-------|-------------|
| `/office` | Office dashboard — tasks, equipment, people, resources, admin cards |
| `/office/contacts` | Office contacts directory |
| `/office/customers` | Customer management |
| `/office/vendors` | Vendor management |
| `/office-tasks` | Office tasks (redirects to /office) |

### Sales & CRM
| Route | Description |
|-------|-------------|
| `/sales` | Sales dashboard — team metrics and activity overview |
| `/sales/crm` | CRM table — companies, contacts, call logs, tags |
| `/sales/crm/[id]` | Company detail page |
| `/sales/dialer` | Phone dialer session manager |
| `/sales/appointments` | Appointments calendar and management |
| `/sales/leads` | Leads pipeline with categorization |
| `/sales/estimating` | Estimating projects dashboard |
| `/sales/estimating/measurement-tool/[id]` | PDF measurement markup tool |
| `/sales/estimating/takeoff/[id]` | Takeoff sheet detail (areas, labor, materials, summary) |
| `/job-walk` | Pre-construction site walk documentation |

### Jobs & Field Operations
| Route | Description |
|-------|-------------|
| `/job-board` | Central project hub — dashboard with all workspaces |
| `/jobs` | Job feed — project list with status filtering |
| `/projects/[id]` | Individual project feed page |
| `/daily-reports` | Daily report listing across all projects |
| `/jsa-reports` | Job Safety Analysis reports |
| `/receipts` | Job expense receipts |
| `/timesheets` | Timecard management |
| `/photos` | Project photos across all jobs |
| `/tasks` | Field tasks listing |

### Scheduling & Calendar
| Route | Description |
|-------|-------------|
| `/calendar` | Event calendar (FullCalendar-based) |
| `/scheduler` | Weekly crew scheduling with drag-and-drop |
| `/scheduling` | Published schedule distribution to crew |

### Billing & Finance
| Route | Description |
|-------|-------------|
| `/billing` | Invoice management — customers, invoices, change orders |
| `/salesman-expenses` | Salesman expense tracking with receipt photos |

### Estimates (Legacy)
| Route | Description |
|-------|-------------|
| `/estimates` | Legacy estimates dashboard |
| `/estimating` | Legacy estimating page (redirects to /sales/estimating) |

### Equipment
| Route | Description |
|-------|-------------|
| `/equipment` | Equipment inventory with maintenance and service scheduling |
| `/equipment/[id]` | Equipment detail page |

### Materials & Inventory
| Route | Description |
|-------|-------------|
| `/inventory` | Job-level material inventory (suppliers, products, kits) |
| `/material-management` | Master material catalog (admin-level) |
| `/material-systems` | Material system templates and configurations |

### Settings & Admin
| Route | Description |
|-------|-------------|
| `/profile` | Settings hub — company, users, employees, data, operations |
| `/permissions` | Role-based feature permission configuration (admin only) |
| `/form-management` | Dynamic form template management |
| `/job-report-management` | Job report checklist and field guide management |
| `/checklist-templates` | Project checklist template management |
| `/data-export` | Bulk data export (PDF + ZIP) |
| `/reports` | Reports hub (timesheet reports, more coming soon) |
| `/reports/timesheets` | Timesheet report builder with filters and export |
| `/trash-bin` | Deleted items recovery (admin only) |
| `/bug-reports` | Bug report tracking (admin only) |

### Admin (Outside Dashboard Layout)
| Route | Description |
|-------|-------------|
| `/admin/command-center` | Admin metrics dashboard (opens in new window) |

### Auth & Public
| Route | Description |
|-------|-------------|
| `/` | Root redirect |
| `/login` | Login page |
| `/forgot-password` | Password reset request |
| `/reset-password` | Password reset form |
| `/auth/callback` | Supabase auth callback handler |
| `/equipment-qr/[id]` | Public QR code landing page for equipment |

### API Routes
| Route | Description |
|-------|-------------|
| `/api/create-user` | Admin: create new user account |
| `/api/delete-user` | Admin: delete user account |
| `/api/list-users` | Admin: list all auth users |
| `/api/update-user-password` | Admin: reset user password |

### Potentially Orphaned Routes
- `/office-tasks` — Separate page exists but Office dashboard embeds tasks inline; no sidebar link
- `/estimates` — Legacy route; replaced by `/sales/estimating`
- `/estimating` — Legacy route; replaced by `/sales/estimating`

---

## 3. Navigation Structure

### Sidebar (Primary Navigation)

| Item | Route | Visibility | Sub-items |
|------|-------|------------|-----------|
| **My Work** | `/my-work` | All roles | — |
| **Office** | `/office` | admin, office_manager, salesman | — |
| ─ *divider* | | | |
| **Sales** | `/sales` | admin, office_manager, salesman | Expandable ▸ |
| → CRM | `/sales/crm` | ↑ same | |
| → Dialer | `/sales/dialer` | ↑ same | |
| → Appointments | `/sales/appointments` | ↑ same | |
| → Leads | `/sales/leads` | ↑ same | |
| → Job Walk | `/job-walk` | ↑ same | |
| → Estimating | `/sales/estimating` | ↑ same | |
| ─ *divider* | | | |
| **Job Board** | `/job-board` | `canView('job_board')` or `canView('jobs')` | Expandable ▸ |
| → Job Feed | `/jobs` | `canView('jobs')` | |
| → Daily Reports | `/daily-reports` | `canView('daily_reports')` | |
| → JSA Reports | `/jsa-reports` | `canView('jsa_reports')` | |
| → Job Expenses | `/receipts` | `canView('receipts')` | |
| → Timesheets | `/timesheets` | `canView('timesheets')` | |
| → Photos | `/photos` | `canView('photos')` | |
| → Field Tasks | `/tasks` | `canView('tasks')` | |
| **Billing** | `/billing` | All roles (desktop only, `hidden md:flex`) | — |
| ─ *divider* | | | |
| **Calendar** | `/calendar` | `canView('calendar')` | — |
| **Scheduler** | `/scheduler` | admin or `scheduler_access` flag (desktop only, `hidden lg:flex`) | — |

### Header Dropdowns (GlobalHeader)

| Icon | Dropdown | Visibility |
|------|----------|------------|
| Monitor | Command Center → opens in new window | admin only |
| Bell | Notifications — All/Unread tabs, mark read | All roles |
| Bug (amber) | Report a Problem / View All Reports | admin gets dropdown; others get modal |
| Settings gear | Edit profile, Company info, User mgmt, Employee mgmt, Customer mgmt, Vendor mgmt, Data export, Reports, Dark mode, View all settings | All roles |
| Avatar | Edit profile, Sign Out | All roles |

### Job Board Workspaces (Secondary Navigation)
The Job Board (`/job-board`) contains a workspace switcher with these tabs/cards:
- Job Info, Feed, Daily Reports, JSA Reports, Photos, Tasks, Expenses, Timesheets, Plans, Checklists, Contracts, Material Orders, Scheduling, Estimating, Field Guide, Report, Warranty, Pre-Lien

---

## 4. Feature Inventory

### My Work
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Personal Dashboard | `MyWorkClient.tsx` | `assigned_tasks`, `assigned_task_completions`, `office_tasks`, `projects`, `feed_posts`, `employee_profiles` | — | View assigned tasks, checklists, office tasks; mark completions |
| Employee Summary | `EmployeeSummaryClient.tsx` | `feed_posts`, `employee_profiles`, `projects` | — | Performance summary per employee |
| Manage Playbook | `ManagePlaybookClient.tsx` | `checklist_templates`, `checklist_template_items` | — | Personal playbook/checklist management |

### Office
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Office Dashboard | `OfficeTasksPageClient.tsx` | `office_tasks`, `employee_profiles`, `profiles`, `companies` | — | Tasks, equipment, people, resources; admin cards for settings |
| Contacts | `ContactsClient.tsx` | `contacts`, `companies` | — | Directory CRUD |
| Customers | `CustomersClient.tsx` | `contacts` (customer type) | — | Customer management |
| Vendors | `VendorsClient.tsx` | `vendors`, `vendor_contacts`, `vendor_types` | — | Vendor directory CRUD |

### Sales & CRM
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Sales Dashboard | `SalesClient.tsx` | `estimates`, `leads`, `crm_appointments`, `crm_call_log`, `pipeline_stages` | — | Team metrics overview |
| CRM Table | `CRMTableClient.tsx` | `companies`, `contacts`, `crm_call_log`, `crm_tags`, `crm_company_tags`, `crm_smart_lists` | — | Company list, filtering, tagging, smart lists |
| Company Detail | `CompanyDetailClient.tsx` | `companies`, `contacts`, `crm_call_log`, `crm_comments`, `crm_company_addresses`, `crm_files`, `crm_follow_up_reminders`, `crm_appointments` | `crm-files` | Full company CRM with call log, comments, files, reminders |
| Dialer | `DialerClient.tsx` | `crm_call_log`, `companies`, `crm_call_templates`, `crm_follow_up_reminders` | — | Phone dialer session management |
| Appointments | `AppointmentsClient.tsx` | `crm_appointments`, `companies`, `contacts`, `profiles` | — | Calendar-based appointment management |
| Leads | `LeadsClient.tsx` | `leads`, `lead_categories`, `lead_photos`, `lead_measurement_pdfs` | `lead-photos`, `lead-measurement-pdfs` | Pipeline with photos and measurement PDFs |
| Estimating | `EstimatingClient.tsx` | `estimating_projects`, `estimates`, `estimate_settings`, `estimate_form_settings`, `estimate_follow_ups`, `estimating_reminders` | `estimating-project-files` | Project estimating dashboard |
| Measurement Tool | `MeasurementToolClient.tsx` | `estimating_project_measurement_pdfs`, `estimating_projects` | `estimating-project-files` | PDF markup with measurements |
| Takeoff | `TakeoffClient.tsx` | `takeoffs`, `estimating_projects`, `unit_types` | — | Area/labor/material takeoff sheets |

### Job Walk
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Job Walk | `JobWalkClient.tsx` | `job_walks`, `job_walk_photos`, `job_walk_measurement_pdfs`, `projects` | `job-walk-photos`, `job-walk-measurements` | Pre-construction site documentation with photos and PDFs |

### Jobs & Field Operations
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Job Board | `JobBoardClient.tsx` | `projects`, `feed_posts`, `project_checklist_items`, `project_documents` | — | Central project hub with workspace tabs |
| Project Feed | `ProjectFeedClient.tsx` | `feed_posts`, `profiles`, `projects` | `post-photos` | Activity feed per project |
| Job Feed | `JobFeedClient.tsx` | `projects`, `pipeline_stages`, `pipeline_history` | — | All projects with status/pipeline filtering |
| Daily Reports | `DailyReportCard.tsx`, `NewDailyReportModal.tsx` | `feed_posts`, `projects`, `form_templates` | `post-photos` | CRUD daily reports with photos, weather auto-fetch, PDF export |
| JSA Reports | `JSAReportsClient.tsx` | `feed_posts`, `jsa_task_templates`, `projects` | `post-photos` | Job Safety Analysis with signature capture |
| Receipts | `ReceiptsClient.tsx`, `ReceiptCard.tsx` | `feed_posts` (type: receipt), `projects` | `post-photos` | Job expense receipts with photo capture |
| Timesheets | `TimesheetsClient.tsx` | `feed_posts` (type: timecard), `projects`, `employee_profiles` | — | Timecard management, multi-entry timecards |
| Photos | `PhotosClient.tsx` | `feed_posts` (type: photo/daily_report), `projects` | `post-photos` | Browse photos across all projects |
| Field Tasks | `TasksPageClient.tsx` | `tasks`, `projects`, `profiles` | `post-photos` | Task CRUD with photo attachments |

### Job Board Workspaces
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Plans | `PlansWorkspace.tsx` | `project_documents` | `project-plans` | Upload/view project plan PDFs |
| Checklists | `ChecklistsWorkspace.tsx` | `project_checklist_items`, `checklist_templates` | — | Project checklists from templates |
| Contracts | `ContractsWorkspace.tsx` | `project_contracts` | `project-documents` | Contract document management |
| Material Orders | `MaterialOrdersWorkspace.tsx` | `material_orders`, `material_order_line_items`, `material_suppliers` | — | Order materials per project |
| Field Guide | `FieldGuideWorkspace.tsx` | `job_report_field_guides`, `field_guide_templates` | — | In-field reference guides |
| Report | `ReportWorkspace.tsx` | `project_reports`, `job_report_checklists`, `job_report_checklist_items` | — | Project completion reports |
| Warranty | `WarrantyWorkspace.tsx` | `project_warranties`, `warranty_templates` | `project-documents` | Warranty document generation |
| Pre-Lien | `PreLienWorkspace.tsx` | `project_preliens`, `prelien_templates` | `project-documents` | Pre-lien notice management |

### Scheduling & Calendar
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Calendar | `CalendarClient.tsx` | `calendar_events`, `profiles` | — | FullCalendar event management |
| Scheduler | `SchedulerClient.tsx` | `scheduler_assignments`, `employee_profiles`, `projects`, `crews` | — | Weekly crew scheduling with drag-and-drop |
| Published Schedule | `SchedulingClient.tsx` | `published_schedules`, `projects`, `employee_profiles` | — | Distribute schedules to crew |

### Billing & Finance
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Billing | `BillingClient.tsx` | `invoices`, `change_orders`, `projects`, `contacts` | — | Invoice CRUD, change order tracking |
| Salesman Expenses | `SalesmanExpensesClient.tsx`, `SalesmanExpenseCard.tsx` | `salesman_expenses` | `salesman-receipts` | Expense tracking with receipt photo upload |

### Equipment
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Equipment Inventory | `EquipmentClient.tsx` | `equipment`, `equipment_categories`, `equipment_documents`, `equipment_scheduled_services`, `maintenance_logs` | `equipment-photos`, `equipment-documents` | Full CRUD, maintenance scheduling, QR labels |
| Equipment QR | `EquipmentQRClient.tsx` | `equipment` | — | Public QR code landing page |

### Materials & Inventory
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Job Inventory | `InventoryClient.tsx` | `inventory_products`, `inventory_kit_groups`, `material_suppliers` | — | Per-project material inventory |
| Material Management | `MaterialManagementClient.tsx` | `master_products`, `master_suppliers`, `master_kit_groups`, `master_product_documents`, `manufacturers`, `manufacturer_products` | `material-documents` | Master product catalog (admin) |
| Material Systems | `MaterialSystemsClient.tsx` | `material_systems`, `material_system_items`, `master_products` | — | Material system templates |

### Settings & Admin
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Profile/Settings | `ProfileClient.tsx` | `profiles`, `companies`, `company_settings` | `avatars`, `company-assets` | Company info, user/employee management hub |
| Permissions | `PermissionsClient.tsx` | `role_permissions` | — | Role-based feature permission config (admin only) |
| Form Management | `FormManagementClient.tsx` | `form_templates` | — | Dynamic form template builder |
| Job Report Mgmt | `FieldGuideManagement.tsx` | `job_report_checklists`, `job_report_checklist_items`, `field_guide_templates`, `field_guide_sections`, `field_guide_section_images` | `field-guide-images` | Report checklist and field guide admin |
| Checklist Templates | `ChecklistTemplatesClient.tsx` | `checklist_templates`, `checklist_template_items` | — | Project checklist template builder |
| Data Export | `DataExportClient.tsx` | `projects`, `feed_posts`, `project_documents` | `post-photos` | Bulk PDF + ZIP export of project data |
| Reports Hub | `ReportsClient.tsx` | — | — | Report type selector (7 types, only Timesheet active) |
| Timesheet Reports | `TimesheetReportClient.tsx` | `feed_posts`, `projects`, `employee_profiles` | — | Date/employee/job filters, grouped table, PDF & Excel export |
| Trash Bin | `TrashBinClient.tsx` | `trash_bin` | — | Deleted items recovery (admin) |
| Bug Reports | `BugReportsClient.tsx` | `bug_reports` | — | Bug report tracking (admin) |

### Notifications
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Notifications | `NotificationBell.tsx` | `notifications` | — | Bell with unread badge, All/Unread tabs, mark read, deep links |

### Admin
| Feature | Component(s) | Tables | Buckets | Capabilities |
|---------|-------------|--------|---------|--------------|
| Command Center | `AdminDashboard.tsx` | `profiles`, `projects`, `feed_posts`, `estimates` | — | Admin metrics dashboard (new window) |

---

## 5. Database Tables

**107 tables** referenced across the codebase, grouped by domain. Reference count = number of files that query the table.

### Core / Auth
| Table | Refs | Purpose |
|-------|------|---------|
| `profiles` | 81 | User accounts — role, name, avatar, scheduler_access |
| `companies` | 32 | Company/organization records |
| `company_settings` | 3 | Per-company configuration |
| `role_permissions` | 2 | Feature-level access per role (full/create/view_only/off) |
| `notifications` | 9 | In-app notification messages |

### Projects / Jobs
| Table | Refs | Purpose |
|-------|------|---------|
| `projects` | 28 | Job/project master records |
| `project_pins` | 1 | User pinned projects |
| `project_documents` | 5 | Uploaded project documents |
| `project_checklist_items` | 9 | Per-project checklist items |
| `project_contracts` | 2 | Contract documents per project |
| `project_reports` | 4 | Project completion reports |
| `project_warranties` | 2 | Warranty records per project |
| `project_preliens` | 2 | Pre-lien notices per project |
| `pipeline_stages` | 6 | Project pipeline stage definitions |
| `pipeline_history` | 8 | Stage transition history |
| `user_project_sequences` | 2 | Per-user project ordering |

### Feed / Posts
| Table | Refs | Purpose |
|-------|------|---------|
| `feed_posts` | 31 | Polymorphic feed — daily reports, timecards, photos, receipts, JSA, notes, PDFs |
| `post_comments` | 3 | Comments on feed posts |

### Tasks
| Table | Refs | Purpose |
|-------|------|---------|
| `tasks` | 10 | Field tasks |
| `assigned_tasks` | 5 | Task assignments to employees |
| `assigned_task_completions` | 4 | Task completion tracking |
| `office_tasks` | 11 | Office/admin tasks |
| `office_daily_reports` | 2 | Office daily report tasks |

### Employees / HR
| Table | Refs | Purpose |
|-------|------|---------|
| `employee_profiles` | 15 | Employee records (name, is_active, etc.) |
| `employee_roles` | 1 | Employee role assignments |
| `employee_crews` | 2 | Employee-to-crew mapping |
| `crews` | 2 | Crew definitions |
| `employee_certifications` | 1 | Certification type definitions |
| `employee_certification_assignments` | 1 | Certifications held by employees |
| `employee_osha_trainings` | 1 | OSHA training type definitions |
| `employee_osha_assignments` | 1 | OSHA training completions |
| `employee_skill_types` | 2 | Employee skill definitions |
| `skill_types` | 2 | Skill type catalog |
| `employee_custom_field_definitions` | 1 | Custom employee fields |

### Sales / CRM
| Table | Refs | Purpose |
|-------|------|---------|
| `contacts` | 9 | People directory (customers, contacts) |
| `crm_call_log` | 12 | Phone call records |
| `crm_call_templates` | 3 | Call script templates |
| `crm_appointments` | 8 | Sales appointments |
| `crm_comments` | 3 | CRM activity comments |
| `crm_company_addresses` | 5 | Multi-address per company |
| `crm_company_tags` | 4 | Company-to-tag join table |
| `crm_tags` | 3 | Tag definitions |
| `crm_files` | 1 | CRM file attachments |
| `crm_follow_up_reminders` | 5 | Follow-up reminders |
| `crm_smart_lists` | 1 | Saved CRM filter views |
| `sales_settings` | 3 | Sales configuration |

### Estimating
| Table | Refs | Purpose |
|-------|------|---------|
| `estimates` | 15 | Estimate records |
| `estimating_projects` | 15 | Estimating project containers |
| `estimating_project_measurement_pdfs` | 3 | Measurement PDF uploads |
| `estimating_reminders` | 6 | Follow-up reminders for estimates |
| `estimate_settings` | 7 | Estimate configuration |
| `estimate_form_settings` | 2 | Estimate form layout settings |
| `estimate_follow_ups` | 2 | Estimate follow-up tracking |
| `takeoffs` | 3 | Material/labor takeoff sheets |
| `unit_types` | 4 | Measurement unit definitions |

### Leads / Job Walk
| Table | Refs | Purpose |
|-------|------|---------|
| `leads` | 10 | Sales leads |
| `lead_categories` | 3 | Lead categorization |
| `lead_photos` | 1 | Lead site photos |
| `lead_measurement_pdfs` | 2 | Lead measurement documents |
| `job_walks` | 9 | Pre-construction site walk records |
| `job_walk_photos` | 1 | Job walk photos |
| `job_walk_measurement_pdfs` | 2 | Job walk measurement documents |

### Scheduling
| Table | Refs | Purpose |
|-------|------|---------|
| `calendar_events` | 4 | Calendar event records |
| `scheduler_assignments` | 2 | Weekly crew-to-project assignments |
| `published_schedules` | 3 | Published schedule snapshots |

### Billing / Finance
| Table | Refs | Purpose |
|-------|------|---------|
| `invoices` | 9 | Invoice records |
| `change_orders` | 6 | Change order records |
| `salesman_expenses` | 6 | Salesman expense records |

### Equipment
| Table | Refs | Purpose |
|-------|------|---------|
| `equipment` | 9 | Equipment inventory |
| `equipment_categories` | 2 | Equipment type categories |
| `equipment_documents` | 5 | Equipment document attachments |
| `equipment_scheduled_services` | 7 | Scheduled service/maintenance intervals |
| `maintenance_logs` | 4 | Maintenance event records |

### Materials / Inventory
| Table | Refs | Purpose |
|-------|------|---------|
| `master_products` | 8 | Master material catalog |
| `master_suppliers` | 5 | Supplier directory |
| `master_kit_groups` | 5 | Product kit groupings |
| `master_product_documents` | 2 | Product spec documents |
| `manufacturers` | 1 | Manufacturer directory |
| `manufacturer_products` | 1 | Products per manufacturer |
| `manufacturer_warranties` | 2 | Manufacturer warranty documents |
| `material_orders` | 2 | Per-project material orders |
| `material_order_line_items` | 1 | Order line items |
| `material_suppliers` | 3 | Per-project supplier assignments |
| `material_systems` | 1 | Material system templates |
| `material_system_items` | 1 | Items within material systems |
| `inventory_products` | 5 | Per-project product inventory |
| `inventory_kit_groups` | 2 | Per-project kit groupings |

### Reports / Templates
| Table | Refs | Purpose |
|-------|------|---------|
| `job_report_checklists` | 4 | Report checklist definitions |
| `job_report_checklist_items` | 4 | Items within report checklists |
| `job_report_checklist_responses` | 2 | Completed checklist responses |
| `job_report_checklist_selections` | 2 | Selected checklist options |
| `job_report_field_guides` | 2 | Field guide assignments |
| `field_guide_templates` | 3 | Field guide template definitions |
| `field_guide_sections` | 3 | Sections within field guides |
| `field_guide_section_images` | 3 | Images within field guide sections |
| `jsa_task_templates` | 4 | JSA hazard/precaution templates |
| `form_templates` | 2 | Dynamic form template definitions |
| `checklist_templates` | 5 | Project checklist templates |
| `checklist_template_items` | 5 | Items within checklist templates |
| `warranty_templates` | 2 | Warranty document templates |
| `prelien_templates` | 2 | Pre-lien notice templates |
| `email_templates` | 1 | Email templates |
| `reminder_rules` | 3 | Automated reminder rules |

### Admin
| Table | Refs | Purpose |
|-------|------|---------|
| `bug_reports` | 2 | Bug report tracking |
| `trash_bin` | 3 | Soft-deleted item recovery |

### Vendors
| Table | Refs | Purpose |
|-------|------|---------|
| `vendors` | 2 | Vendor companies |
| `vendor_contacts` | 1 | Contacts per vendor |
| `vendor_types` | 1 | Vendor type categories |

---

## 6. Supabase RPC Functions

**None.** The app makes zero `.rpc()` calls. All database access uses direct `.from('table').select/insert/update/delete()` queries via the Supabase JS client.

---

## 7. Supabase Storage Buckets

**14 buckets** identified across the codebase.

| Bucket | Used By | Stores |
|--------|---------|--------|
| `post-photos` | PostCard, DailyReportCard, NewDailyReportModal, PhotosWorkspace, TasksWorkspace, ReceiptCard, DataExportClient, trashBin.ts (~18 files) | Daily report photos, task photos, receipt images, JSA photos, PDF attachments, general project photos |
| `project-documents` | WarrantyManagement, WarrantyWorkspace, PreLienWorkspace, ContractsWorkspace | Generated warranty PDFs, pre-lien notices, contract documents |
| `project-plans` | PlansWorkspace | Uploaded project plan PDFs |
| `salesman-receipts` | SalesmanExpenseCard, NewSalesmanExpenseModal, EditSalesmanExpenseModal | Salesman expense receipt photos |
| `crm-files` | CompanyDetailClient | Files attached to CRM company records |
| `material-documents` | MaterialManagementClient | Material spec sheets, invoices, supplier docs |
| `field-guide-images` | FieldGuideManagement | Images embedded in field guide templates |
| `avatars` | ProfileClient, UserManagement | User profile photos |
| `company-assets` | ProfileClient | Company logos / branding assets |
| `equipment-photos` | EquipmentClient | Equipment inventory photos |
| `equipment-documents` | EquipmentClient | Equipment manuals, service records |
| `lead-photos` | LeadPhotosCard | Sales lead site photos |
| `lead-measurement-pdfs` | LeadMeasurementsCard | Lead measurement PDF uploads |
| `job-walk-photos` | JobWalkPhotosCard | Pre-construction site walk photos |
| `job-walk-measurements` | JobWalkMeasurementsCard | Job walk measurement PDF uploads |
| `estimating-project-files` | ProjectMeasurementsCard, MeasurementToolClient | Estimating project measurement PDFs |

---

## 8. Auth & Roles

### Authentication
- **Provider:** Supabase Auth (email/password only — no OAuth, SSO, or magic links)
- **Session:** Cookie-based via `@supabase/ssr`. iOS PWA uses localStorage recovery fallback when cookies are unavailable.
- **Middleware** (`src/middleware.ts`): Refreshes session cookies on every request. Does NOT enforce redirects — auth gating is handled client-side by `AuthProvider`.
- **AuthProvider** (`src/components/auth/AuthProvider.tsx`): Client component wrapping all `(dashboard)` routes. Redirects unauthenticated users to `/login`.
- **Password reset:** `/forgot-password` → email link → `/reset-password` form via `/auth/callback`.

### Roles
| Role | Description | Typical Access |
|------|-------------|---------------|
| `admin` | Full system access | All features, all permissions always `full`, Command Center, user management |
| `office_manager` | Office/administrative | Sales, CRM, Office, Reports, Billing, most field features |
| `salesman` | Sales team | Sales, CRM, Leads, Estimating, Appointments, Billing |
| `foreman` | Field supervisor | Job Board, Daily Reports, Tasks, Timesheets (per permissions) |
| `crew` | Field worker | My Work, assigned tasks, timesheets (per permissions) |

### Permission System
- **Table:** `role_permissions` — stores `{ role, feature, access_level }` rows
- **Hook:** `usePermissions(role)` — returns `canView`, `canCreate`, `canEdit` helpers
- **Access levels:** `full` (all CRUD), `create` (read + create), `view_only` (read only), `off` (hidden)
- **Admin bypass:** Admin role always returns `full` without checking the table
- **Default:** If no permission row exists for a role+feature combination, defaults to `full` (permissive)

### Permission-Gated Features
| Feature Key | Controls |
|-------------|----------|
| `jobs` | Job Feed sidebar link |
| `job_board` | Job Board sidebar link |
| `daily_reports` | Daily Reports sidebar link |
| `jsa_reports` | JSA Reports sidebar link |
| `photos` | Photos sidebar link |
| `tasks` | Field Tasks sidebar link |
| `calendar` | Calendar sidebar link |
| `project_reports` | Project report workspace |
| `receipts` | Job Expenses sidebar link |
| `timesheets` | Timesheets sidebar link |
| `salesman_expenses` | Salesman Expenses |

### Role-Gated Features (Hardcoded)
| Feature | Allowed Roles |
|---------|--------------|
| Office page | `admin`, `office_manager`, `salesman` |
| Sales section (all) | `admin`, `office_manager`, `salesman` |
| Scheduler | `admin` or `scheduler_access = true` on profile |
| Reports | `admin`, `office_manager` |
| Permissions page | `admin` only |
| Command Center | `admin` only |
| Trash Bin | `admin` only |
| User Management | `admin` only |

### Scheduler Access
- Boolean flag `scheduler_access` on the `profiles` table
- Grants access to `/scheduler` (weekly crew scheduling)
- Toggled per-user by admin via User Management UI
- Enforced at both UI (sidebar visibility) and RLS (database row-level security)

### Admin API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/create-user` | POST | Create new user account (Supabase Admin API) |
| `/api/delete-user` | POST | Delete user account |
| `/api/list-users` | GET | List all auth users with metadata |
| `/api/update-user-password` | POST | Reset user password |

All admin API routes use `SUPABASE_SERVICE_ROLE_KEY` and call Supabase Auth Admin endpoints directly via `fetch()`.

---

## 9. External Integrations

### Open-Meteo Weather API
| Detail | Value |
|--------|-------|
| Library | None (direct `fetch()`) |
| Geocoding | `https://geocoding-api.open-meteo.com/v1/search` |
| Weather | `https://api.open-meteo.com/v1/forecast` |
| Used in | `src/lib/fetchWeather.ts` → `NewDailyReportModal.tsx` |
| Auth | None — free, no API key required |
| Purpose | Auto-fill weather field when creating daily reports based on project address |

### Leaflet CSS (CDN)
- `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css` loaded in `src/app/layout.tsx`
- **Note:** `leaflet` and `react-leaflet` are NOT in `package.json`. The CSS include appears to be a dead/placeholder reference — no map rendering exists in the codebase.

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, admin API routes) |

**No other external services.** No payment processing (Stripe), email (SendGrid/Resend), SMS (Twilio), mapping (Google Maps/Mapbox), analytics, or error tracking integrations.

---

## 10. Known Orphaned / Dead Code

### Orphaned Routes
| Route | File | Status |
|-------|------|--------|
| `/office-tasks` | `src/app/(dashboard)/office-tasks/page.tsx` | **Dead.** Redirects to `/office`. No sidebar link. The Office page renders `OfficeTasksPageClient` directly. |
| `/estimating` | `src/app/(dashboard)/estimating/page.tsx` | **Unreachable.** `next.config.js` permanently redirects `/estimating` → `/sales/estimating`, so this page component never renders. Contains a standalone landing page with a count card linking to `/estimates`. |
| `/estimates` | `src/app/(dashboard)/estimates/page.tsx` | **Legacy.** No sidebar link. Only reachable via deep links from estimating project cards and the now-unreachable `/estimating` page. Still functional — renders `EstimatesLayoutClient`. |

### Dead Includes
| Item | Location | Issue |
|------|----------|-------|
| Leaflet CSS | `src/app/layout.tsx` | CDN stylesheet loaded but no Leaflet JS library installed. No map rendering in the app. Placeholder for a planned "Zone Map" feature. |

### Naming Mismatches
| Item | Issue |
|------|-------|
| `OfficeTasksPageClient` | Component renders the Office page (`/office`) but retains its original "office-tasks" name from when it lived at `/office-tasks`. |

### No TODO/FIXME/HACK Comments
Zero `TODO`, `FIXME`, or `HACK` comments found in any `.ts`/`.tsx` file under `src/`.
