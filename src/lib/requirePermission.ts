import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserPermissions } from '@/lib/getUserPermissions'
import type { FeatureKey } from '@/lib/featureKeys'

type MinLevel = 'view' | 'create' | 'edit'

/**
 * Server guard for dashboard page.tsx files. Redirects to /login if the user
 * has no session, to /my-work if the user lacks the required permission.
 *
 * Returns the resolved session user and permissions bundle so the caller can
 * reuse them without refetching.
 */
export async function requirePermission(feature: FeatureKey, minLevel: MinLevel) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const permissions = await getUserPermissions(supabase, session.user.id)
  const allowed =
    (minLevel === 'view' && permissions.canView(feature)) ||
    (minLevel === 'create' && permissions.canCreate(feature)) ||
    (minLevel === 'edit' && permissions.canEdit(feature))

  if (!allowed) redirect('/my-work')

  return { supabase, session, user: session.user, permissions }
}
