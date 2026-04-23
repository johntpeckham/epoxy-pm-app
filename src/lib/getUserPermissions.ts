import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole, AccessLevel } from '@/types'
import type { FeatureKey } from '@/lib/featureKeys'

export interface UserPermissionsBundle {
  role: UserRole | null
  isAdmin: boolean
  access: (feature: FeatureKey) => AccessLevel
  canView: (feature: FeatureKey) => boolean
  canCreate: (feature: FeatureKey) => boolean
  canEdit: (feature: FeatureKey) => boolean
}

/**
 * Server-side equivalent of the client usePermissions hook. Pass the server
 * Supabase client (from `@/lib/supabase/server`) plus the current user id.
 *
 * Defaults mirror the client hook: admin → every `access()` returns 'full';
 * non-admin falls back to 'off' on any feature not present in user_permissions.
 */
export async function getUserPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPermissionsBundle> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const role = (profile?.role ?? null) as UserRole | null
  const isAdmin = role === 'admin'

  const permissionsMap = new Map<FeatureKey, AccessLevel>()

  if (!isAdmin) {
    const { data: rows } = await supabase
      .from('user_permissions')
      .select('feature, access_level')
      .eq('user_id', userId)

    for (const row of (rows ?? []) as { feature: string; access_level: AccessLevel }[]) {
      permissionsMap.set(row.feature as FeatureKey, row.access_level)
    }
  }

  function access(feature: FeatureKey): AccessLevel {
    if (isAdmin) return 'full'
    return permissionsMap.get(feature) ?? 'off'
  }

  function canView(feature: FeatureKey): boolean {
    const level = access(feature)
    return level === 'full' || level === 'create' || level === 'view_only'
  }

  function canCreate(feature: FeatureKey): boolean {
    const level = access(feature)
    return level === 'full' || level === 'create'
  }

  function canEdit(feature: FeatureKey): boolean {
    return access(feature) === 'full'
  }

  return { role, isAdmin, access, canView, canCreate, canEdit }
}
