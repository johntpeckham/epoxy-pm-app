import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserPermissions } from '@/lib/getUserPermissions'
import type { FeatureKey } from '@/lib/featureKeys'

type MinLevel = 'view' | 'create' | 'edit'

/**
 * Every Sales sub-feature — used as the access gate for landing pages that
 * sit above the individual Sales sub-sections. NavigationSearch.tsx keeps a
 * local copy for client-side filtering.
 */
export const SALES_FEATURES: FeatureKey[] = [
  'crm',
  'dialer',
  'emailer',
  'leads',
  'appointments',
  'estimating',
  'job_walk',
]

/**
 * Server guard for dashboard page.tsx files that sit above multiple
 * sub-features (e.g. the Sales landing page). Redirects to /login if the
 * user has no session, to /my-work if the user lacks the required level on
 * EVERY listed feature.
 *
 * Admins always pass (same shortcut as getUserPermissions).
 */
export async function requireAnyPermission(
  features: FeatureKey[],
  minLevel: MinLevel,
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const permissions = await getUserPermissions(supabase, session.user.id)

  const check =
    minLevel === 'view'
      ? permissions.canView
      : minLevel === 'create'
        ? permissions.canCreate
        : permissions.canEdit

  const allowed = permissions.isAdmin || features.some((f) => check(f))

  if (!allowed) redirect('/my-work')

  return { supabase, session, user: session.user, permissions }
}
