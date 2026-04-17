# Epoxy PM App — Comprehensive Data Audit Report

**Date:** April 17, 2026
**Scope:** Full codebase read-only audit — schema, queries, data flows, referential integrity, storage
**Codebase:** Next.js 14+ with Supabase (PostgreSQL) backend

---

## Executive Summary

This audit examined every Supabase query, migration file, TypeScript type definition, and React component in the Epoxy PM application. The app manages **108+ database tables** across 10 major feature areas for a commercial coatings contractor.

### Key Findings At a Glance

| Category | ✅ Good | ⚠️ Warning | 🚨 Critical |
|----------|---------|------------|-------------|
| Table Integrity | 85+ tables properly structured | 3 orphaned tables | 2 polymorphic FK issues |
| Data Flows | 6 pipelines working correctly | 3 data duplication risks | 1 customer sync gap |
| Foreign Keys | Most tables use proper FKs | 5 tables use text matching | 2 tables lack FK constraints |
| Query Patterns | Server components use parallel fetches | 150+ wildcard selects | 1 N+1 pattern found |
| Storage | 12 buckets properly configured | 0 mismatched references | 0 critical issues |
| Cascade Deletes | Trash bin system well-designed | 2 gaps in cascade coverage | 0 critical orphan risks |

### Top Priority Actions

1. 🚨 **Polymorphic `pushed_ref_id` columns** on `crm_appointments`, `leads`, and `job_walks` lack database-level referential integrity
2. 🚨 **Duplicate customer creation risk** — multiple flows independently create `customers` records with no dedup constraint
3. ⚠️ **No back-reference from invoices to estimates** — once converted, the link is only via matching number strings
4. ⚠️ **Line items are fully copied (not referenced)** between estimates and invoices — divergence risk after conversion
5. ⚠️ **`change_orders.parent_id` is polymorphic** — references either `estimates.id` or `invoices.id` with no database FK

---

## 1. Full Table Map

### 1.1 Core Project Tables

| Table | Primary Key | Foreign Keys | Feature Area | Cascade Behavior |
|-------|-------------|-------------|--------------|-----------------|
| `projects` | `id` (uuid) | — | Job Board | Parent — children cascade on delete |
| `feed_posts` | `id` (uuid) | `project_id → projects(id) ON DELETE CASCADE`, `user_id → auth.users(id)` | Feed/Reports | ✅ Cascades with project |
| `project_documents` | `id` (uuid) | `project_id → projects(id) ON DELETE CASCADE`, `user_id → auth.users(id)` | Documents | ✅ Cascades with project |
| `project_reports` | `id` (uuid) | `project_id → projects(id) ON DELETE CASCADE`, `user_id → auth.users(id)` | Job Reports | ✅ Cascades with project, unique per project |
| `project_contracts` | `id` (uuid) | `project_id → projects(id) ON DELETE CASCADE` | Contracts | ✅ Cascades with project |
| `project_checklist_items` | `id` (uuid) | `project_id → projects(id)`, `template_id`, `template_item_id` | Checklists | ✅ Referenced in trash bin restore |
| `project_pins` | `id` (uuid) | `user_id → auth.users(id)`, `project_id → projects(id)` | User Prefs | User preference, not content |
| `project_warranties` | `id` (uuid) | `project_id → projects(id)`, `template_id → warranty_templates(id)` | Warranties | ✅ Project-scoped |
| `project_preliens` | `id` (uuid) | `project_id → projects(id)`, `template_id → prelien_templates(id)` | Pre-Liens | Soft delete via `deleted_at` |

### 1.2 Task & Playbook Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `tasks` | `id` (uuid) | `project_id → projects(id)`, `created_by`, `assigned_to → auth.users(id)` | Project Tasks |
| `project_plans` | `id` (uuid) | `project_id → projects(id)`, `user_id → auth.users(id)` | Project Plans |
| `office_tasks` | `id` (uuid) | `assigned_to → auth.users(id)`, `project_id → projects(id)` (nullable), `created_by` | Office Tasks |
| `assigned_tasks` | `id` (uuid) | `assigned_to → auth.users(id)`, `created_by → auth.users(id)` | Team Playbook |
| `assigned_task_completions` | `id` (uuid) | `task_id → assigned_tasks(id)`, `user_id → auth.users(id)` | Playbook Tracking |

### 1.3 Calendar & Scheduling Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `calendar_events` | `id` (uuid) | `created_by → auth.users(id)`, `project_id → projects(id)` (nullable) | Calendar |
| `scheduler_assignments` | `id` (uuid) | `job_id → projects(id) ON DELETE CASCADE`, `employee_id → employee_profiles(id) ON DELETE CASCADE` | Scheduler |
| `published_schedules` | `id` (uuid) | — | Schedule Publishing |

### 1.4 Estimates & Billing Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `customers` | `id` (uuid) | `user_id → auth.users(id)` | Shared (Estimates + Billing) |
| `estimates` | `id` (uuid) | `customer_id → customers(id) ON DELETE CASCADE`, `user_id → auth.users(id)` | Estimating |
| `estimate_settings` | `id` (uuid) | `user_id → auth.users(id)` (unique) | Estimate Config |
| `invoices` | `id` (uuid) | `client_id → customers(id) ON DELETE CASCADE`, `user_id → auth.users(id)` | Billing |
| `change_orders` | `id` (uuid) | `parent_id` (⚠️ no FK — polymorphic), `user_id → auth.users(id)` | Estimates + Billing |
| `estimate_follow_ups` | `id` (uuid) | `estimate_id → estimates(id)` | Sales Follow-ups |

### 1.5 CRM Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `crm_companies` | `id` (uuid) | `assigned_to → auth.users(id)`, `created_by → auth.users(id)` | CRM |
| `crm_contacts` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE` | CRM |
| `crm_company_addresses` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE` | CRM |
| `crm_tags` | `id` (uuid) | — | CRM |
| `crm_company_tags` | `(company_id, tag_id)` | `company_id → crm_companies(id) ON DELETE CASCADE`, `tag_id → crm_tags(id) ON DELETE CASCADE` | CRM |
| `crm_call_log` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE`, `contact_id → crm_contacts(id) ON DELETE SET NULL` | CRM |
| `crm_comments` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE` | CRM |
| `crm_files` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE` | CRM |
| `crm_appointments` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE`, `contact_id → crm_contacts(id) ON DELETE SET NULL` | CRM |
| `crm_follow_up_reminders` | `id` (uuid) | `company_id → crm_companies(id) ON DELETE CASCADE`, `contact_id → crm_contacts(id) ON DELETE SET NULL` | CRM |
| `crm_call_templates` | `id` (uuid) | `created_by → auth.users(id)` | CRM |
| `crm_smart_lists` | `id` (uuid) | — | CRM |

### 1.6 Sales Pipeline Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `job_walks` | `id` (uuid) | `customer_id → customers(id) ON DELETE SET NULL`, `created_by → auth.users(id)` | Job Walks |
| `job_walk_photos` | `id` (uuid) | `job_walk_id → job_walks(id) ON DELETE CASCADE` | Job Walks |
| `job_walk_measurement_pdfs` | `id` (uuid) | `walk_id → job_walks(id) ON DELETE CASCADE` | Job Walks |
| `leads` | `id` (uuid) | `customer_id → customers(id) ON DELETE SET NULL`, `company_id → crm_companies(id) ON DELETE SET NULL` | Leads |
| `lead_photos` | `id` (uuid) | `lead_id → leads(id) ON DELETE CASCADE` | Leads |
| `lead_measurement_pdfs` | `id` (uuid) | `lead_id → leads(id) ON DELETE CASCADE` | Leads |
| `lead_categories` | `id` (uuid) | — | Leads |
| `estimating_projects` | `id` (uuid) | `customer_id → customers(id) ON DELETE CASCADE`, `created_by → auth.users(id)` | Sales Estimating |
| `estimating_project_measurement_pdfs` | `id` (uuid) | `project_id → estimating_projects(id) ON DELETE CASCADE` | Sales Estimating |
| `pipeline_stages` | `id` (uuid) | — | Pipeline Config |
| `pipeline_history` | `id` (uuid) | `project_id → estimating_projects(id) ON DELETE CASCADE` | Pipeline Tracking |
| `estimating_reminders` | `id` (uuid) | `project_id → estimating_projects(id) ON DELETE CASCADE` | Sales Reminders |
| `reminder_rules` | `id` (uuid) | — | Reminder Config |
| `sales_settings` | `id` (uuid) | — | Sales Config |
| `user_project_sequences` | `id` (uuid) | `user_id → auth.users(id)` | Project Numbering |

### 1.7 Employee Management Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `employee_profiles` | `id` (uuid) | — | Employees |
| `employee_roles` | `id` (uuid) | — | Employee Config |
| `employee_certifications` | `id` (uuid) | — | Cert Types |
| `employee_certification_assignments` | `id` (uuid) | `employee_id → employee_profiles(id)`, `certification_id → employee_certifications(id)` | Cert Assignments |
| `employee_osha_trainings` | `id` (uuid) | — | OSHA Types |
| `employee_osha_assignments` | `id` (uuid) | `employee_id → employee_profiles(id)`, `osha_training_id → employee_osha_trainings(id)` | OSHA Assignments |
| `employee_custom_field_definitions` | `id` (uuid) | — | Custom Fields |
| `employees` | `id` (uuid) | — | Timesheet Employees (legacy) |
| `crews` | `id` (uuid) | — | Crew Definitions |
| `skill_types` | `id` (uuid) | — | Skill Types |
| `employee_crews` | `id` (uuid) | `employee_id → employee_profiles(id)`, `crew_id → crews(id)` | Crew Junction |
| `employee_skill_types` | `id` (uuid) | `employee_id → employee_profiles(id)`, `skill_type_id → skill_types(id)` | Skill Junction |

### 1.8 Equipment Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `equipment` | `id` (uuid) | — | Equipment Inventory |
| `equipment_categories` | `id` (uuid) | — | Equipment Config |
| `maintenance_logs` | `id` (uuid) | `equipment_id → equipment(id)` | Maintenance |
| `equipment_scheduled_services` | `id` (uuid) | `equipment_id → equipment(id)`, `task_id → office_tasks(id)` | Scheduled Services |
| `equipment_documents` | `id` (uuid) | `equipment_id → equipment(id)` | Equipment Docs |

### 1.9 Material & Inventory Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `master_suppliers` | `id` (uuid) | — | Master Catalog |
| `master_kit_groups` | `id` (uuid) | `supplier_id → master_suppliers(id) ON DELETE CASCADE` | Master Catalog |
| `master_products` | `id` (uuid) | `supplier_id → master_suppliers(id) ON DELETE CASCADE`, `kit_group_id → master_kit_groups(id) ON DELETE SET NULL` | Master Catalog |
| `master_product_documents` | `id` (uuid) | `product_id → master_products(id) ON DELETE CASCADE` | PDS/SDS Docs |
| `material_suppliers` | `id` (uuid) | `master_supplier_id → master_suppliers(id)` (nullable) | Local Inventory |
| `inventory_kit_groups` | `id` (uuid) | `supplier_id → material_suppliers(id) ON DELETE CASCADE`, `master_kit_group_id` (nullable) | Local Inventory |
| `inventory_products` | `id` (uuid) | `supplier_id → material_suppliers(id) ON DELETE CASCADE`, `kit_group_id → inventory_kit_groups(id) ON DELETE SET NULL`, `master_product_id` (nullable) | Local Inventory |
| `unit_types` | `id` (uuid) | — | Unit Config |
| `material_systems` | `id` (uuid) | — | Material Systems |
| `material_system_items` | `id` (uuid) | `material_system_id → material_systems(id)`, `master_product_id → master_products(id)` (nullable) | System Items |
| `material_orders` | `id` (uuid) | `project_id → projects(id)` | Job Material Orders |
| `material_order_line_items` | `id` (uuid) | `order_id → material_orders(id)` | Order Line Items |
| `manufacturers` | `id` (uuid) | — | Manufacturers |
| `manufacturer_products` | `id` (uuid) | `manufacturer_id → manufacturers(id)` | Manufacturer Products |

### 1.10 Warranty, Pre-Lien, Vendor Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `warranty_templates` | `id` (uuid) | — | Warranty Config |
| `manufacturer_warranties` | `id` (uuid) | — | Manufacturer Warranties |
| `prelien_templates` | `id` (uuid) | — | Pre-Lien Config |
| `vendors` | `id` (uuid) | `created_by → auth.users(id)` | Vendors |
| `vendor_contacts` | `id` (uuid) | `vendor_id → vendors(id)` | Vendor Contacts |
| `vendor_types` | `id` (uuid) | — | Vendor Config |

### 1.11 Job Report Management Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `jsa_task_templates` | `id` (uuid) | — | JSA Config |
| `checklist_templates` | `id` (uuid) | — | Checklist Config |
| `checklist_template_items` | `id` (uuid) | `template_id → checklist_templates(id)` | Template Items |
| `job_report_checklists` | `id` (uuid) | — | Report Checklists |
| `job_report_checklist_items` | `id` (uuid) | `checklist_id → job_report_checklists(id)` | Checklist Items |
| `field_guide_templates` | `id` (uuid) | — | Field Guide Config |
| `field_guide_sections` | `id` (uuid) | `template_id → field_guide_templates(id)` | Guide Sections |
| `field_guide_section_images` | `id` (uuid) | `section_id → field_guide_sections(id)` | Section Images |

### 1.12 System & Config Tables

| Table | Primary Key | Foreign Keys | Feature Area |
|-------|-------------|-------------|--------------|
| `profiles` | `id` (uuid) | `id → auth.users(id) ON DELETE CASCADE` | User Profiles |
| `company_settings` | `id` (uuid) | — | Company Config |
| `form_templates` | `id` (uuid) | — | Form Builder |
| `role_permissions` | `id` (uuid) | — | Permissions |
| `notifications` | `id` (uuid) | `user_id → auth.users(id)` | Notifications |
| `post_comments` | `id` (uuid) | `post_id → feed_posts(id)`, `user_id → auth.users(id)` | Feed Comments |
| `trash_bin` | `id` (uuid) | — | Soft Delete System |
| `bug_reports` | `id` (uuid) | — | Bug Tracking |
| `salesman_expenses` | `id` (uuid) | — | Salesman Expenses |
| `office_daily_reports` | `id` (uuid) | — | Office Reports |
| `project_takeoff_projects` | `id` (uuid) | — | Takeoff Tool |
| `project_takeoff_measurement_pdfs` | `id` (uuid) | `project_id → project_takeoff_projects(id)` | Takeoff PDFs |

### 1.13 Orphaned / Unused Tables

| Table | Status | Notes |
|-------|--------|-------|
| `personal_tasks` | 🚨 Not found in codebase | Needs manual verification in Supabase dashboard — may exist in DB but not referenced by any code |
| `personal_notes` | 🚨 Not found in codebase | Needs manual verification in Supabase dashboard — may exist in DB but not referenced by any code |
| `employees` (legacy) | ⚠️ Partially orphaned | Separate from `employee_profiles`; used only by timesheet ManageEmployeesModal for simple name/is_active tracking. Duplicates employee identity with `employee_profiles` |

---

## 2. Data Flow Traces

### 2a. Sales Pipeline: CRM → Appointments → Job Walk → Estimating → Job Board

**Flow Diagram:**
```
crm_companies (prospect)
  │
  ├─→ crm_appointments (scheduled)
  │     │
  │     ├─→ job_walks (in_progress → sent_to_estimating)
  │     │     │
  │     │     └─→ estimating_projects (pipeline_stage: Estimating → Won)
  │     │           │
  │     │           └─→ projects (Active) [via EstimateEditor "Push to Jobs"]
  │     │
  │     └─→ estimating_projects (direct from appointment)
  │
  └─→ leads (in_progress)
        │
        ├─→ job_walks
        ├─→ estimating_projects
        └─→ crm_appointments
```

**Record creation at each step:**

1. **CRM Company** → `crm_companies` record created via `NewCompanyModal`
   - Contacts added to `crm_contacts` (FK: `company_id`)
   - Addresses added to `crm_company_addresses` (FK: `company_id`)
   - ✅ All child tables cascade delete with company

2. **Appointment** → `crm_appointments` record created
   - FK: `company_id → crm_companies(id)`, `contact_id → crm_contacts(id)`
   - ✅ Proper foreign keys to CRM

3. **Push to Job Walk** → Creates `customers` record + `job_walks` record
   - Customer created by copying primary contact name + primary address from CRM
   - 🚨 **Customer data is denormalized** — address copied at creation time, never synced back
   - `job_walks.customer_id → customers(id)` ✅
   - Appointment updated: `pushed_to = 'job_walk'`, `pushed_ref_id = job_walks.id`
   - ⚠️ `pushed_ref_id` is a bare UUID with no database FK constraint

4. **Push to Estimating** → Creates `estimating_projects` record
   - `estimating_projects.customer_id → customers(id)` ✅ (proper FK with CASCADE)
   - `estimating_projects.source = 'appointment' | 'job_walk' | 'lead'`
   - `estimating_projects.source_ref_id` = originating record ID (⚠️ no FK constraint)
   - Pipeline history tracked in `pipeline_history` table ✅
   - Auto-reminders created via `reminder_rules` ✅

5. **Push to Job Board** → Creates `projects` record (via EstimateEditor)
   - ⚠️ No direct FK back from `projects` to `estimating_projects` or `crm_companies`
   - The link is only traceable through `estimating_projects.source_ref_id` chain

**Is the same company/customer record referenced throughout?**
- 🚨 **No.** CRM companies (`crm_companies`) and billing customers (`customers`) are **separate tables**. A `customers` record is created as a copy when pushing from CRM to job walks or estimating. There is no `company_id` FK on the `customers` table linking back to `crm_companies`.
- The `leads` table has both `customer_id` and `company_id` FKs, providing the best cross-reference, but `estimating_projects` only has `customer_id`.

### 2b. Estimates → Invoices → Change Orders

**Flow:**
```
customers (shared table)
  │
  ├─→ estimates (customer_id FK)
  │     │
  │     ├─→ change_orders (parent_type='estimate', parent_id=estimate.id)
  │     │
  │     └─→ [Convert to Invoice] ──→ invoices (client_id FK → same customers table)
  │                                     │
  │                                     └─→ change_orders (parent_type='invoice', parent_id=invoice.id)
  │
  └─→ invoices (can also be created standalone)
```

**Key findings:**

- ✅ **Customers table is shared** — both `estimates.customer_id` and `invoices.client_id` reference the same `customers` table
- ⚠️ **Column naming inconsistency**: estimates use `customer_id`, invoices use `client_id` — same table, different column names
- 🚨 **Line items are FULLY COPIED during conversion** — stored as JSONB arrays in both `estimates.line_items` and `invoices.line_items`. Once converted, changes to the estimate do NOT propagate to the invoice.
- ⚠️ **No back-reference from invoices to estimates** — there is no `source_estimate_id` column on invoices. The only linkage is that `invoice_number` is set to `String(estimate_number)` during conversion.
- ⚠️ **`change_orders.parent_id` is polymorphic** — it references either `estimates.id` or `invoices.id` depending on `parent_type`. There is no database FK constraint; only an application-level convention. The migration confirms: `parent_id uuid not null` with no REFERENCES clause.
- ✅ **Change order structure is clean** — `parent_type` CHECK constraint ensures only 'estimate' or 'invoice' values

**Line Item structure (JSONB):**
```typescript
{ id: string, description: string, ft: number|null, rate: number|null, amount: number }
```

**Estimate status progression:** `Draft → Sent → Accepted → Invoiced` (or `Declined`)
**Invoice status progression:** `Draft → Sent → Paid` (or `Overdue`)

### 2c. CRM Customers vs Billing Customers

- 🚨 **These are SEPARATE tables**: `crm_companies` (CRM) vs `customers` (Billing/Estimating)
- **CRM companies** are prospects/leads managed in the sales pipeline
- **Customers** are billing entities created when a CRM company is pushed to job walk/estimating
- **Duplication risk is HIGH**: Multiple code paths independently create `customers` records:
  - `AppointmentsClient.tsx` → push to job walk
  - `JobWalkPushMenu.tsx` → push to estimating
  - `LeadsClient.tsx` → push operations
  - `NewCustomerModal.tsx` → manual creation in estimating
  - `ImportCsvModal.tsx` → bulk CSV import
- Each path checks for existing customers by name matching (`customers.company_name`), but there's no unique constraint. Two pushes for the same CRM company can create duplicate customer records.
- ⚠️ **No sync mechanism**: If a CRM company's address or contact info is updated, the corresponding `customers` record is NOT updated. Data diverges over time.

### 2d. Materials: Master Catalog → Local Inventory → Material Orders

**Flow:**
```
master_suppliers          material_suppliers (local copies)
  │                         │
  ├─ master_kit_groups      ├─ inventory_kit_groups (local copies)
  │                         │
  └─ master_products        └─ inventory_products (local copies)
       │                         │
       └─ master_product_docs    └─ stock_check_task_id → office_tasks
                                 └─ price_check_task_id → office_tasks

material_systems
  └─ material_system_items (master_product_id → master_products)

material_orders (project-scoped)
  └─ material_order_line_items (order_id → material_orders)
```

**Key findings:**

- ✅ **Two-tier architecture is intentional**: Master catalog (`master_*` tables) is the single source of truth for product names, prices, and documents. Local inventory (`material_suppliers`, `inventory_*`) tracks per-location stock levels.
- ✅ **Linking works via nullable FKs**: `material_suppliers.master_supplier_id`, `inventory_products.master_product_id`, `inventory_kit_groups.master_kit_group_id` link local items back to master catalog
- ✅ **Material systems reference master products**: `material_system_items.master_product_id → master_products(id)`
- ✅ **Stock/price check requests create office tasks**: `inventory_products.stock_check_task_id → office_tasks(id)` and `inventory_products.price_check_task_id → office_tasks(id)` — completion cascades handled in `officeTaskCompletion.ts`
- ✅ **Material orders are project-scoped**: `material_orders.project_id → projects(id)`
- ⚠️ **Material orders line items can optionally reference master data** via `master_supplier_id` and `master_product_id`, but these are not enforced FKs at the database level — needs manual verification

### 2e. Daily Playbook: Tasks → Team Playbook → Employee Assignments

**Flow:**
```
assigned_tasks (templates: daily/weekly/one_time)
  │
  └─→ assigned_task_completions (per-user, per-date tracking)
```

**Key findings:**

- ✅ **Templates vs instances are properly separated**: `assigned_tasks` stores the recurring task definitions (daily, weekly, one_time). `assigned_task_completions` tracks per-user, per-date completion status.
- ✅ `assigned_tasks.assigned_to → auth.users(id)` — proper FK
- ✅ `assigned_task_completions.task_id → assigned_tasks(id)` — proper FK
- ✅ Completions are keyed by `(task_id, user_id, completion_date)` for daily tracking
- The `ManagePlaybookClient` component manages task templates; `MyTasksCard` and `TeamTasksSection` display and track completions

### 2f. Job Board: Projects → All Sub-Items

**All sub-items properly reference the parent project:**

| Sub-Item Table | FK to Projects | Cascade? |
|---------------|---------------|----------|
| `feed_posts` | `project_id → projects(id)` | ✅ `ON DELETE CASCADE` |
| `tasks` | `project_id → projects(id)` | ✅ Listed in `PROJECT_RELATED_TABLES` for trash snapshot |
| `project_checklist_items` | `project_id → projects(id)` | ✅ Listed in `PROJECT_RELATED_TABLES` |
| `calendar_events` | `project_id → projects(id)` | ✅ Listed in `PROJECT_RELATED_TABLES` |
| `project_documents` | `project_id → projects(id)` | ✅ `ON DELETE CASCADE` |
| `project_contracts` | `project_id → projects(id)` | ✅ Listed in `PROJECT_RELATED_TABLES` |
| `material_orders` | `project_id → projects(id)` | ✅ Listed in `PROJECT_RELATED_TABLES` |
| `project_reports` | `project_id → projects(id)` | ✅ `ON DELETE CASCADE`, unique per project |
| `project_warranties` | `project_id → projects(id)` | ⚠️ Not in trash snapshot list |
| `project_preliens` | `project_id → projects(id)` | ⚠️ Not in trash snapshot list |
| `scheduler_assignments` | `job_id → projects(id)` | ✅ `ON DELETE CASCADE` |
| `estimates` | Indirect via `customer_id` | No direct project FK |

**Orphan risk on project deletion:**
- ✅ The `softDeleteProject()` function in `trashBin.ts` snapshots all related data before deleting, and the `restoreFromTrash()` function restores everything. This is well-implemented.
- ⚠️ `project_warranties` and `project_preliens` are NOT listed in `PROJECT_RELATED_TABLES` — they won't be snapshotted on soft delete. Need to verify if database CASCADE handles them or if data is lost.
- ⚠️ `scheduler_assignments` uses `job_id` instead of `project_id` — naming inconsistency, but FK is correct to `projects(id)`.

### 2g. Employee Management: Profiles → Roles → Tasks → Timecards

**Flow:**
```
profiles (auth users — app login accounts)
  │
employee_profiles (all employees — may or may not have app logins)
  ├─ employee_certification_assignments → employee_certifications
  ├─ employee_osha_assignments → employee_osha_trainings
  ├─ employee_crews → crews
  ├─ employee_skill_types → skill_types
  └─ custom_fields (JSONB on employee_profiles)

employees (legacy — simple name/is_active for timesheets)
```

**Key findings:**

- ⚠️ **Two separate employee identity systems exist**:
  1. `employee_profiles` — full employee records with photos, roles, certifications, custom fields. Used by scheduler, office management, and employee directory.
  2. `employees` — simple name + is_active list used exclusively by timesheet entry (`ManageEmployeesModal`). These are NOT linked to `employee_profiles`.
- ⚠️ `profiles` (auth users) are a third identity system for app login users. `profiles.id = auth.users.id`. Not all employees have app logins, so `employee_profiles` exists as a separate concept.
- ✅ The scheduler properly uses `employee_profiles` with junction tables for crews and skills
- ⚠️ Timecard entries store employee names as **plain text strings** in JSONB (`TimecardContent.entries[].employee_name`) — not IDs. Cannot reliably join timecard data back to employee records.

### 2h. Equipment Inventory: Items → Maintenance → QR → Documents

**Flow:**
```
equipment
  ├─ equipment_categories (category field on equipment)
  ├─ maintenance_logs (equipment_id FK)
  ├─ equipment_scheduled_services (equipment_id FK, task_id → office_tasks)
  └─ equipment_documents (equipment_id FK)
```

**Key findings:**

- ✅ All sub-records properly link to equipment via `equipment_id` FK
- ✅ Scheduled services integrate with office tasks: `equipment_scheduled_services.task_id → office_tasks(id)` — completing the office task cascades to complete the service and generate the next recurrence (via `officeTaskCompletion.ts`)
- ✅ QR codes are generated client-side pointing to `/equipment-qr/[id]` — reads equipment by ID, properly handled
- ✅ Documents stored in equipment-specific storage with `equipment_id` scoping
- ✅ Recurring services correctly chain via `parent_service_id` for recurrence tracking

---

## 3. Shared Data Audit

### 3.1 Data Stored in Multiple Places (Duplication Risk)

| Data | Where it lives | Risk Level | Notes |
|------|---------------|------------|-------|
| Customer name/address | `crm_companies` + `crm_company_addresses` AND `customers` table | 🚨 High | Copied at push time; never synced. CRM updates do not propagate to billing customers. |
| Customer contact info | `crm_contacts` AND `job_walks` (customer_name, customer_email, customer_phone) AND `leads` (same fields) | 🚨 High | Denormalized copies on job_walks and leads. These text fields diverge from crm_contacts if updated. |
| Employee identity | `profiles`, `employee_profiles`, AND `employees` (legacy) | ⚠️ Medium | Three separate identity systems. `profiles` = auth users, `employee_profiles` = all employees, `employees` = timesheet-only list. No FK links between them. |
| Employee names in timecards | `TimecardContent.entries[].employee_name` (JSONB) AND `employees.name` AND `employee_profiles.name` | ⚠️ Medium | Timecard entries store plain text names, not IDs. Name changes won't retroactively update timecards. |
| Estimate line items → Invoice line items | `estimates.line_items` (JSONB) AND `invoices.line_items` (JSONB) | ⚠️ Medium | Full copy on conversion. By design — invoices should be immutable snapshots. But no mechanism to compare drift if the estimate is later modified. |
| Project name/address | `projects.name` + `projects.address` AND `feed_posts.content.project_name` AND `feed_posts.content.address` | ⚠️ Low | Report content snapshots project info at creation time. Acceptable for historical records, but editing a project name doesn't update past reports. |
| Supplier/product names | `master_suppliers` AND `material_suppliers` (local copy) | ✅ Low | Intentional two-tier design with `master_supplier_id` FK linking them. |

### 3.2 Components Fetching Same Data From Different Tables

| Data Need | Component A | Component B | Issue |
|-----------|------------|------------|-------|
| Employee list for dropdowns | `SchedulerClient` → `employee_profiles` | `ManageEmployeesModal` → `employees` | ⚠️ Two different tables for "employees." Scheduler sees different employees than timesheet entry. |
| Customer list | `EstimatesLayoutClient` → `customers` (filtered by `user_id`) | `CrmTableClient` → `crm_companies` | ⚠️ Different tables — sales team sees CRM companies, estimating sees billing customers. No cross-reference without `leads` table. |
| Project list | `JobBoardClient` → `projects` | `CalendarPageClient` → `projects` + `calendar_events` | ✅ Same source table, different views. |
| Profile/user info | Nearly all pages → `profiles` table | ✅ Consistent — single source of truth for logged-in users. |

### 3.3 Hardcoded Values That Should Pull From Config

| Hardcoded Value | Location | Should Be | Risk |
|----------------|----------|-----------|------|
| Industry options | `NewCompanyModal.tsx` — `INDUSTRY_OPTIONS` array | Could be a `crm_industries` config table | ⚠️ Low — adding new industries requires code deploy |
| Lead source options | `NewCompanyModal.tsx` — `LEAD_SOURCE_OPTIONS` array | Could be configurable | ⚠️ Low |
| Expense categories | `useFormTemplate.ts` fallback — `['Materials', 'Fuel', 'Tools', ...]` | Stored in `form_templates` JSONB — ✅ configurable via Form Management | ✅ Already configurable |
| Task statuses | TypeScript enum `TaskStatus` | Hardcoded in types — consistent | ✅ Appropriate for static statuses |
| Project statuses | `'Active' | 'Completed' | 'Closed'` | CHECK constraint in schema | ✅ Appropriate |
| Pipeline stages | `pipeline_stages` table | ✅ Already database-driven and admin-configurable | ✅ Good |
| Reminder rules | `reminder_rules` table | ✅ Already database-driven and admin-configurable | ✅ Good |
| US States | `src/lib/usStates.ts` | Static reference data — appropriate as code constant | ✅ Appropriate |
| CA city coordinates | `src/lib/caCityCoords.ts` | Static reference data for map features | ✅ Appropriate |

### 3.4 Form Builder (Form Management) JSONB Consistency

The `form_templates` table stores form field definitions as JSONB (`fields` column). Each form is keyed by `form_key`:

| Form Key | Used By | Status |
|----------|---------|--------|
| `daily_report` | Daily Report creation/editing | ✅ Consistent read/write via `useFormTemplate` + `formFieldMaps` |
| `jsa_report` | JSA Report creation/editing | ✅ Consistent |
| `expense` | Receipt/expense creation | ✅ Consistent |
| `timesheet` | Timecard creation | ✅ Consistent |
| `task` | Task creation | ✅ Consistent |
| `project_report` | Job Report creation | ✅ Consistent |

**Architecture review:**
- ✅ `useFormTemplate.ts` hook loads fields from DB with hardcoded fallbacks — forms never break even if DB is empty
- ✅ `formFieldMaps.ts` provides backwards-compatible mapping between template field IDs and content keys
- ✅ Custom/dynamic fields added via Form Management are stored in `feed_posts.dynamic_fields` (JSONB array of `DynamicFieldEntry`)
- ✅ `buildDynamicFields()` and `groupDynamicFieldsBySection()` correctly separate known fields from custom fields
- ✅ The `initValuesFromContent()` function properly loads both known and custom field values when editing existing records

---

## 4. Query Logic Audit

### 4.1 Page-by-Table Query Map

| Page/Route | Tables Queried | Server/Client |
|-----------|---------------|---------------|
| `/my-work` | `profiles`, `tasks`, `project_checklist_items`, `office_tasks`, `feed_posts`, `crm_follow_up_reminders`, `crm_call_log`, `crm_appointments`, `office_daily_reports` | Server |
| `/jobs` | `projects` | Server |
| `/job-board` | `projects` | Server (then client fetches: `tasks`, `feed_posts`, `project_documents`, `project_checklist_items`, `material_orders`, `calendar_events`, `project_reports`, `project_contracts`, `project_warranties`, `project_preliens`) |
| `/projects/[id]` | `projects`, `feed_posts`, `profiles` | Server |
| `/daily-reports` | `projects`, `feed_posts` | Server |
| `/jsa-reports` | `projects`, `feed_posts` | Server |
| `/receipts` | `profiles`, `projects`, `feed_posts` | Server |
| `/timesheets` | `projects`, `feed_posts` | Server |
| `/photos` | `projects`, `feed_posts` | Server |
| `/tasks` | `tasks`, `profiles`, `projects` | Server |
| `/calendar` | `calendar_events`, `profiles`, `projects` | Server |
| `/office` | `profiles`, `office_tasks`, `projects`, `equipment`, `equipment_scheduled_services`, `employee_profiles`, `material_suppliers`, `master_suppliers`, `inventory_products`, `master_products`, `customers`, `vendors` | Server (heavy) |
| `/equipment` | `equipment`, `profiles` | Server |
| `/equipment/[id]` | `equipment`, `maintenance_logs`, `equipment_documents`, `equipment_scheduled_services`, `profiles` | Server |
| `/billing` | `customers`, `invoices` | Server |
| `/estimates` | `customers`, `estimate_settings`, `estimates` | Server |
| `/sales/crm` | `profiles` (then client: `crm_companies`, `crm_contacts`, `crm_call_log`, `crm_tags`, `crm_company_tags`, `crm_smart_lists`) | Mixed |
| `/sales/appointments` | `profiles` (then client: `crm_appointments`, `crm_companies`, `crm_contacts`) | Mixed |
| `/sales/leads` | `leads`, `lead_categories`, `profiles` | Server |
| `/sales/estimating` | `profiles`, `customers` (then client: `estimating_projects`, `pipeline_stages`, `estimates`) | Mixed |
| `/inventory` | `profiles`, `material_suppliers`, `inventory_products`, `inventory_kit_groups`, `master_suppliers`, `master_products`, `master_kit_groups`, `unit_types` | Server (heavy) |
| `/material-management` | `profiles`, `master_suppliers`, `master_products`, `master_kit_groups`, `master_product_documents`, `unit_types` | Server |
| `/scheduler` | `profiles`, `projects`, `employee_profiles`, `scheduler_assignments`, `crews`, `skill_types`, `employee_crews`, `employee_skill_types` | Server (heavy) |
| `/scheduling` | `published_schedules`, `profiles`, `employee_profiles` | Server |
| `/profile` | `profiles` | Server |
| `/permissions` | Client: `role_permissions` | Client |

### 4.2 Queries Flagged for Review

**⚠️ Wrong Source or Questionable Pattern:**

1. **`JobsOverview.tsx`** fetches ALL `project_checklist_items` without filtering by project:
   ```typescript
   supabase.from('project_checklist_items').select('id, project_id, name, is_complete, group_name')
   ```
   Then groups client-side by `project_id`. This loads ALL checklist items across ALL projects when only the visible projects' items are needed. Should add `.in('project_id', visibleProjectIds)`.

2. **`/office` page** performs 10+ parallel queries on server load — fetches counts for `employee_profiles`, `material_suppliers`, `master_suppliers`, `inventory_products`, `master_products`, `customers`, `vendors`, etc. Many of these are only used for dashboard count badges. Could be replaced with `COUNT(*)` queries instead of fetching full records.

**⚠️ Excessive Wildcard Selects (`SELECT *`):**

The codebase uses `.select('*')` in **150+ queries**. Notable cases where specific columns would be more efficient:

| Component | Table | Used Columns | Fetched |
|-----------|-------|-------------|---------|
| `CrmTableClient` | `crm_companies` | name, status, priority, assigned_to | `*` (15+ columns) |
| `InventoryPageClient` | `inventory_products` | name, quantity, unit, supplier_id | `*` (12+ columns) |
| `SchedulerClient` | `employee_profiles` | id, name, photo_url | `*` (7+ columns) |
| `CalendarPageClient` | `calendar_events` | All columns actually used | `*` ✅ Acceptable |

**⚠️ N+1 Query Pattern Found:**

1. **`softDeleteProject()` in `trashBin.ts`** — loops through `PROJECT_RELATED_TABLES` array and issues a separate `SELECT * FROM table WHERE project_id = X` for each table (7 sequential queries). This is acceptable for an infrequent operation (deleting a project) but worth noting.

2. **`salesTeamStats.ts` `fetchTeamOverview()`** — issues 7 parallel queries using `Promise.all()` to gather stats across `profiles`, `crm_call_log`, `crm_appointments`, `job_walks`, and `estimates`. ✅ This is properly parallelized, not N+1.

**✅ Good Patterns Found:**

- Server components use `Promise.all()` for parallel fetches (scheduler, office, my-work pages)
- Most client components use `useEffect` with proper cleanup
- `officeTaskCompletion.ts` handles complex cascading logic between `office_tasks`, `equipment_scheduled_services`, and `inventory_products` in a single function — clean and maintainable
- The `applyDefaultChecklist.ts` properly batches inserts instead of looping

---

## 5. Foreign Key & Referential Integrity Check

### 5.1 Tables That Should Have Foreign Keys But Do Not

| Table | Column | Should Reference | Current State | Severity |
|-------|--------|-----------------|---------------|----------|
| `change_orders` | `parent_id` | `estimates(id)` or `invoices(id)` | 🚨 Bare UUID, no FK constraint | High — orphaned change orders possible if parent deleted outside trash bin |
| `crm_appointments` | `pushed_ref_id` | `job_walks(id)` or `estimating_projects(id)` | 🚨 Bare UUID, no FK constraint | High — polymorphic reference, no integrity guarantee |
| `leads` | `pushed_ref_id` | `crm_appointments(id)`, `job_walks(id)`, or `estimating_projects(id)` | 🚨 Bare UUID, no FK constraint | High — same polymorphic issue |
| `job_walks` | `pushed_ref_id` | `estimating_projects(id)` | ⚠️ Bare UUID, no FK constraint | Medium — less polymorphic (only points to estimating) |
| `estimating_projects` | `source_ref_id` | `crm_appointments(id)`, `job_walks(id)`, or `leads(id)` | ⚠️ Bare UUID, no FK constraint | Medium — source traceability only, not critical for data integrity |
| `employee_profiles` | (no auth link) | Could link to `auth.users(id)` for employees with logins | ⚠️ No link to auth system | Medium — cannot determine which employee_profiles have app logins |

### 5.2 Relationships That Rely on Text/Name Matching Instead of IDs

| Relationship | Mechanism | Risk | Recommendation |
|-------------|-----------|------|----------------|
| Customer dedup in push flows | `customers.company` name matching | 🚨 High — typos or slight name variations create duplicates | Add `company_id` FK to `customers` table linking to `crm_companies` |
| Pipeline stage on estimating_projects | `estimating_projects.pipeline_stage` stores stage **name** (text), not `pipeline_stages.id` | ⚠️ Medium — renaming a pipeline stage breaks the link | Use `pipeline_stage_id → pipeline_stages(id)` instead of text matching |
| Pipeline history stages | `pipeline_history.from_stage` and `to_stage` store stage **names** (text) | ⚠️ Medium — same issue as above | Store stage IDs instead of names |
| Estimate-to-invoice linkage | `invoices.invoice_number = String(estimates.estimate_number)` | ⚠️ Medium — fragile string matching; invoice number could be manually changed | Add `source_estimate_id` FK on invoices |
| Timecard employee names | `TimecardContent.entries[].employee_name` (plain text) | ⚠️ Medium — cannot join to employee records | Store employee IDs alongside names |
| Lead category | `leads.category` (text) vs `lead_categories.name` | ⚠️ Low — no FK constraint; categories could diverge | Add FK: `leads.category_id → lead_categories(id)` |
| Project crew field | `projects.crew` stores crew name as comma-separated text | ⚠️ Low — cannot join to `employee_profiles` or `crews` | Store as junction table or array of IDs |

### 5.3 Cascade Delete Risk Analysis

**Well-Protected (Cascade Delete + Trash Snapshot):**
- ✅ `projects` → `feed_posts`, `project_documents`, `project_reports` (schema CASCADE)
- ✅ `projects` → `tasks`, `project_checklist_items`, `calendar_events`, `project_contracts`, `material_orders` (trash snapshot in `PROJECT_RELATED_TABLES`)
- ✅ `crm_companies` → all `crm_*` child tables (schema CASCADE)
- ✅ `master_suppliers` → `master_products` → `master_product_documents` (schema CASCADE)
- ✅ `leads` → `lead_photos`, `lead_measurement_pdfs` (schema CASCADE)
- ✅ `scheduler_assignments` → CASCADE from both `projects` and `employee_profiles`

**Gaps in Cascade Coverage:**
- ⚠️ `project_warranties` — references `projects(id)` but not listed in `PROJECT_RELATED_TABLES` for trash snapshot. Needs manual verification of schema CASCADE.
- ⚠️ `project_preliens` — same issue. Uses soft delete (`deleted_at`) but not part of project trash snapshot.
- ⚠️ `estimating_projects` deleted → `pipeline_history` and `estimating_reminders` cascade (schema). But `estimates` linked to the same `customer_id` are NOT affected (correct — estimates belong to customer, not estimating project).
- ⚠️ `customers` deleted → `estimates` CASCADE and `invoices` CASCADE. This means deleting a customer deletes ALL their estimates and invoices. The trash bin handles this for customers (item_type: 'customer'), but the estimate/invoice snapshots are not bundled.

**SET NULL Behaviors:**
- ✅ `crm_call_log.contact_id` → `ON DELETE SET NULL` (contact deleted, call log preserved)
- ✅ `crm_appointments.contact_id` → `ON DELETE SET NULL`
- ✅ `crm_follow_up_reminders.contact_id` → `ON DELETE SET NULL`
- ✅ `job_walks.customer_id` → `ON DELETE SET NULL` (customer deleted, job walk preserved)
- ✅ `leads.customer_id` → `ON DELETE SET NULL`
- ✅ `leads.company_id` → `ON DELETE SET NULL`

---

## 6. Storage Bucket Audit

### 6.1 All Supabase Storage Buckets

| Bucket | Created In | Public | Contents | Referenced By |
|--------|-----------|--------|----------|---------------|
| `post-photos` | `schema.sql` | Yes | Feed photos, daily report photos, receipt photos, task photos, timecard attachments | `feed_posts.content.photos[]`, `feed_posts.content.receipt_photo`, `tasks.photo_url` |
| `project-documents` | `schema.sql` | Yes | Project document uploads, pre-lien PDFs, warranty PDFs | `project_documents.storage_path`, `project_preliens.pdf_url`, `project_warranties.pdf_url` |
| `project-plans` | `schema.sql` | Yes | Project plan PDF uploads | `project_documents` (with `document_type='plans'`) |
| `avatars` | `schema.sql` | Yes | User profile photos | `profiles.avatar_url` |
| `company-assets` | `schema.sql` | Yes | Company logos | `company_settings.logo_url` |
| `crm-files` | `20260426_add_crm_tables.sql` | Yes | CRM company documents/files | `crm_files.file_url`, `crm_files.storage_path` |
| `employee-photos` | `20260310_add_employee_management.sql` | Yes | Employee profile photos | `employee_profiles.photo_url` |
| `salesman-receipts` | Inferred from code | Yes | Salesman expense receipt photos | `salesman_expenses` (receipt photo references) |
| `estimating-project-files` | `20260504_add_estimating_projects.sql` | Yes | Estimating project measurement PDFs | `estimating_project_measurement_pdfs.file_url` |
| `lead-photos` | `20260429_add_leads.sql` | Yes | Lead photos | `lead_photos.image_url`, `lead_photos.storage_path` |
| `lead-measurement-pdfs` | `20260429_add_leads.sql` | Yes | Lead measurement PDFs | `lead_measurement_pdfs.file_url` |
| `material-documents` | `20260413_add_material_management_tables.sql` | Yes | PDS/SDS documents for products | `master_product_documents.file_url` |
| `field-guide-images` | Inferred from code | Yes | Field guide section images | `field_guide_section_images.storage_path` |
| `contracts` | Inferred from code | Yes | Project contract uploads | `project_contracts` (file references) |

### 6.2 Storage Reference Verification

- ✅ **post-photos**: Most heavily used bucket. Photos are stored with project-scoped paths (`${project.id}/photos/...`, `${project.id}/tasks/...`). The `softDeleteProject()` function in `trashBin.ts` properly cleans up photo storage before deletion.
- ✅ **crm-files**: Files stored with company-scoped paths. `CompanyDetailClient.tsx` handles upload/delete with proper `storage_path` tracking.
- ✅ **employee-photos**: Single photo per employee, replaced on update.
- ✅ **material-documents**: PDS/SDS docs linked to `master_product_documents` with `file_url` and cleaned up on document delete.
- ✅ **field-guide-images**: Images linked to `field_guide_section_images` with `storage_path`; deleted when section is deleted.
- ⚠️ **All buckets are public** — anyone with the URL can view files. This is fine for an internal team tool but would need review if external access is ever added.
- ⚠️ **No orphan cleanup for storage**: If a database record is deleted but the storage delete fails (network error), the file remains in storage. There is no periodic cleanup job. This is a minor concern given Supabase storage costs.

---

## 7. Recommended Actions (Priority Order)

### 🚨 Critical (P0)

1. **Add `company_id` FK to `customers` table**
   - Link billing customers back to CRM companies
   - Add unique constraint on `(user_id, company_id)` to prevent duplicate customer records
   - Update all push flows to set `company_id` when creating customers

2. **Add database FK constraints for polymorphic `pushed_ref_id` columns**
   - Option A: Replace with separate nullable FK columns (`pushed_to_job_walk_id`, `pushed_to_estimating_id`, etc.)
   - Option B: Accept polymorphic design but add application-level validation and integrity checks
   - Affected tables: `crm_appointments`, `leads`, `job_walks`, `estimating_projects`

3. **Add `source_estimate_id` FK to `invoices` table**
   - Direct linkage from invoice back to originating estimate
   - Set during conversion in `EstimateEditor.handleConvertToInvoice()`

### ⚠️ Important (P1)

4. **Add `project_warranties` and `project_preliens` to `PROJECT_RELATED_TABLES`**
   - Ensure they are snapshotted during soft delete
   - Or verify database CASCADE handles them

5. **Unify employee identity systems**
   - Consider merging `employees` (legacy timesheet) into `employee_profiles`
   - Add optional `auth_user_id` FK to `employee_profiles` for employees with app logins
   - Store employee IDs (not just names) in timecard JSONB entries

6. **Use pipeline stage IDs instead of names**
   - Change `estimating_projects.pipeline_stage` from text to UUID FK
   - Change `pipeline_history.from_stage` / `to_stage` to UUID FKs
   - Prevents data breakage when stages are renamed

7. **Normalize `change_orders.parent_id`**
   - Add proper FK or split into `estimate_id` and `invoice_id` (one nullable, one not)
   - Current polymorphic approach works but lacks database integrity

### 📋 Nice to Have (P2)

8. **Rename `invoices.client_id` to `invoices.customer_id`** for consistency with `estimates.customer_id`

9. **Rename `scheduler_assignments.job_id` to `scheduler_assignments.project_id`** for consistency

10. **Add `leads.category_id` FK** to `lead_categories` instead of text matching

11. **Optimize `JobsOverview.tsx` checklist query** to filter by visible project IDs

12. **Reduce wildcard selects** in high-traffic components (CRM table, inventory, scheduler) to specific columns

13. **Add customer data sync** — when CRM company address/contact is updated, optionally update the linked `customers` record

---

## Appendix A: Database Triggers & Functions

| Trigger/Function | Table | Purpose |
|-----------------|-------|---------|
| `handle_new_user()` | `auth.users` | Auto-creates `profiles` row on user signup |
| `crm_companies_set_updated_at()` | `crm_companies` | Auto-updates `updated_at` on UPDATE |
| `crm_contacts_set_updated_at()` | `crm_contacts` | Auto-updates `updated_at` on UPDATE |
| `crm_appointments_set_updated_at()` | `crm_appointments` | Auto-updates `updated_at` on UPDATE |
| `crm_call_templates_set_updated_at()` | `crm_call_templates` | Auto-updates `updated_at` on UPDATE |
| `job_walks_set_updated_at()` | `job_walks` | Auto-updates `updated_at` on UPDATE |
| `leads_set_updated_at()` | `leads` | Auto-updates `updated_at` on UPDATE |
| `estimating_projects_set_updated_at()` | `estimating_projects` | Auto-updates `updated_at` on UPDATE |
| `pipeline_stages_set_updated_at()` | `pipeline_stages` | Auto-updates `updated_at` on UPDATE |
| `estimating_reminders_set_updated_at()` | `estimating_reminders` | Auto-updates `updated_at` on UPDATE |

No RPC functions were found in the codebase — all queries use the Supabase client SDK directly.

---

## Appendix B: RLS Policy Summary

All tables use Row Level Security. The general patterns are:

| Pattern | Tables | Policy |
|---------|--------|--------|
| **All authenticated** — any logged-in user can CRUD | `projects`, `feed_posts`, `calendar_events`, `crm_*`, `job_walks`, `leads`, `pipeline_*`, `checklist_*`, `form_templates`, `notifications`, `bug_reports`, `trash_bin`, `assigned_tasks` | Full CRUD for authenticated users |
| **Owner-only** — users can only access their own records | `customers`, `estimates`, `invoices`, `estimate_settings`, `salesman_expenses` | `auth.uid() = user_id` filter |
| **Role-restricted writes** — authenticated read, role-restricted insert/update/delete | `material_suppliers`, `inventory_*`, `master_*`, `equipment`, `employee_profiles` | Read: all authenticated. Write: admin, office_manager, salesman |
| **Admin/scheduler only** | `scheduler_assignments` | Read/write: admin OR `scheduler_access = true` |
| **Profile self-edit** | `profiles` | Insert/update own profile only |

⚠️ **Note on owner-only RLS**: `customers`, `estimates`, and `invoices` are scoped to `user_id`. This means each user only sees their own customers and financial documents. If multi-user access to the same customer base is needed, this RLS pattern would need modification.

---

*End of audit report. Generated via comprehensive codebase analysis covering 70+ migration files, 160+ component files, all page routes, types, and utility functions.*
