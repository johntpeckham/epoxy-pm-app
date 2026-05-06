import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Canonical status slugs allowed on `companies.status` (see
 * `companies_status_check`). Kept here so the helper can statically
 * type the value without reaching into UI components.
 */
export type CompanyStatusSlug =
  | 'prospect'
  | 'contacted'
  | 'lead_created'
  | 'appointment_made'
  | 'job_walk_scheduled'
  | 'not_very_interested'
  | 'do_not_call'
  | 'active'
  | 'inactive'

const STATUS_LABELS: Record<CompanyStatusSlug, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  lead_created: 'Lead Created',
  appointment_made: 'Appointment Made',
  job_walk_scheduled: 'Job Walk Scheduled',
  not_very_interested: 'Not Very Interested',
  do_not_call: 'Do Not Call',
  active: 'Active',
  inactive: 'Inactive',
}

interface UpdateCompanyStatusInput {
  supabase: SupabaseClient
  companyId: string
  newStatus: CompanyStatusSlug
  userId: string
}

interface UpdateCompanyStatusError {
  code?: string
  message: string
  hint?: string
  details?: string
}

export interface CrmCommentRow {
  id: string
  company_id: string
  content: string
  created_by: string | null
  created_at: string
}

interface UpdateCompanyStatusSuccess {
  previousStatus: CompanyStatusSlug | null
  newStatus: CompanyStatusSlug
  archived: boolean
  archivedAt: string | null
  logEntry: CrmCommentRow | null
}

interface UpdateCompanyStatusResult {
  data: UpdateCompanyStatusSuccess | null
  error: UpdateCompanyStatusError | null
}

/**
 * Single source of truth for changing a company's CRM status.
 *
 * Side effects (matched against CompanyDetailClient.tsx behavior):
 *   1. `companies.status` is updated.
 *   2. When `newStatus === 'do_not_call'`, the company is also archived
 *      (`archived = true`, `archived_at = now`, `archived_by = userId`),
 *      mirroring the handleDoNotCall flow on the detail page.
 *   3. An activity log entry is inserted into `crm_comments` with the
 *      detail page's existing message format:
 *        - `Marked as Do Not Call` when newStatus === 'do_not_call'
 *        - `Status changed to <Label>` otherwise.
 *      The `created_by` author field is the caller's userId.
 *
 * Returns `{ data, error }`. Callers should branch on `error` and avoid
 * applying optimistic local UI state when an error is present.
 */
export async function updateCompanyStatus({
  supabase,
  companyId,
  newStatus,
  userId,
}: UpdateCompanyStatusInput): Promise<UpdateCompanyStatusResult> {
  // 1. Read the current status so we can no-op cleanly and produce the
  //    "from -> to" message even if the local UI state is stale.
  const { data: existing, error: readErr } = await supabase
    .from('companies')
    .select('status, archived')
    .eq('id', companyId)
    .maybeSingle()

  if (readErr) {
    console.error('[CRM STATUS UPDATE ERROR]', 'read', {
      code: readErr.code,
      message: readErr.message,
      hint: readErr.hint,
      details: readErr.details,
    })
    return {
      data: null,
      error: {
        code: readErr.code,
        message: readErr.message,
        hint: readErr.hint,
        details: readErr.details,
      },
    }
  }

  const previousStatus = (existing?.status ?? null) as CompanyStatusSlug | null

  if (previousStatus === newStatus) {
    return {
      data: {
        previousStatus,
        newStatus,
        archived: Boolean(existing?.archived),
        archivedAt: null,
        logEntry: null,
      },
      error: null,
    }
  }

  // 2. Build the patch. Archive on do_not_call, mirroring the detail
  //    page's dedicated "Do Not Call" button flow.
  const archivedAt = newStatus === 'do_not_call' ? new Date().toISOString() : null
  const patch: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'do_not_call') {
    patch.archived = true
    patch.archived_at = archivedAt
    patch.archived_by = userId
  }

  const { error: updateErr } = await supabase
    .from('companies')
    .update(patch)
    .eq('id', companyId)

  if (updateErr) {
    console.error('[CRM STATUS UPDATE ERROR]', 'update', {
      code: updateErr.code,
      message: updateErr.message,
      hint: updateErr.hint,
      details: updateErr.details,
    })
    return {
      data: null,
      error: {
        code: updateErr.code,
        message: updateErr.message,
        hint: updateErr.hint,
        details: updateErr.details,
      },
    }
  }

  // 3. Activity log entry. Failure here is logged but does NOT roll back
  //    the status change — same forgiving pattern the detail page uses
  //    in logActivity().
  const message =
    newStatus === 'do_not_call'
      ? 'Marked as Do Not Call'
      : `Status changed to ${STATUS_LABELS[newStatus]}`

  const { data: logRow, error: logErr } = await supabase
    .from('crm_comments')
    .insert({ company_id: companyId, content: message, created_by: userId })
    .select('*')
    .single()

  if (logErr) {
    console.error('[CRM STATUS UPDATE ERROR]', 'log', {
      code: logErr.code,
      message: logErr.message,
      hint: logErr.hint,
      details: logErr.details,
    })
  }

  return {
    data: {
      previousStatus,
      newStatus,
      archived: newStatus === 'do_not_call',
      archivedAt,
      logEntry: (logRow as CrmCommentRow | null) ?? null,
    },
    error: null,
  }
}
