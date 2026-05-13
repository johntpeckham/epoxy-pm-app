import type { Project } from '@/types'

/** Resolve the customer/company display name for a project.
 *
 *  Prefers the joined company name from `companies` (the live source of
 *  truth — reflects renames in the CRM) and falls back to the historical
 *  `client_name` snapshot for legacy projects that haven't been backfilled
 *  with a `company_id`.
 *
 *  Pass a Project that may include the relational `companies` field from
 *  a query like `select('*, companies(id, name)')`. Returns `client_name`
 *  if the join wasn't requested or company_id is null. */
export function displayProjectCustomer(
  project: Pick<Project, 'client_name' | 'companies'>
): string {
  return project.companies?.name ?? project.client_name ?? ''
}
