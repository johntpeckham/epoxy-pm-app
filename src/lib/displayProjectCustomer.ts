import type { Project } from '@/types'

/** Resolve the customer/company display name for a project.
 *
 *  Prefers the joined company name from `companies` (the live source of
 *  truth — reflects renames in the CRM) and falls back to the historical
 *  `client_name` snapshot for legacy projects that haven't been backfilled
 *  with a `company_id`.
 *
 *  Pass a Project that may include the relational `companies` field from
 *  a query like `select('*, companies(id, name)')`. PostgREST returns FK
 *  joins as an array (length 0 or 1 for a many-to-one), so we index [0]
 *  and let optional chaining cover the empty / null / undefined cases —
 *  any of which falls through to `client_name`. */
export function displayProjectCustomer(
  project: Pick<Project, 'client_name' | 'companies'>
): string {
  return project.companies?.[0]?.name ?? project.client_name ?? ''
}
