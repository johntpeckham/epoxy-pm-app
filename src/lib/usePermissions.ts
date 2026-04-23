'use client'

import { useCallback } from 'react'
import type { UserRole, AccessLevel, RolePermission } from '@/types'
import type { FeatureKey } from '@/lib/featureKeys'
import { usePermissionsContext } from '@/components/permissions/PermissionsProvider'

interface UsePermissionsReturn {
  /** Check access level for a feature. Admin always returns 'full'. */
  access: (feature: FeatureKey) => AccessLevel
  /** True if the user can view the feature (full, create, or view_only). */
  canView: (feature: FeatureKey) => boolean
  /** True if the user can create new items (full or create). */
  canCreate: (feature: FeatureKey) => boolean
  /** True if the user has full (edit/delete) access. */
  canEdit: (feature: FeatureKey) => boolean
  /** Legacy field — used to return all role_permissions rows for the admin
   *  matrix. Now always an empty array; the new UI reads from
   *  permission_templates / user_permissions directly in Phase 2b. */
  permissions: RolePermission[]
  /** Reload permissions from the database. */
  refetch: () => Promise<void>
  loading: boolean
}

/**
 * Reads the current user's permissions from PermissionsProvider context.
 *
 * The optional `_role` argument is accepted for backwards compatibility with
 * the pre-Phase-2a signature (`usePermissions(role)`) and is ignored — the
 * authoritative role comes from the provider, not the caller.
 */
export function usePermissions(_role?: UserRole): UsePermissionsReturn {
  const { role, permissionsMap, loading, refetch } = usePermissionsContext()

  const access = useCallback(
    (feature: FeatureKey): AccessLevel => {
      if (role === 'admin') return 'full'
      return permissionsMap.get(feature) ?? 'off'
    },
    [role, permissionsMap]
  )

  const canView = useCallback(
    (feature: FeatureKey): boolean => {
      const level = access(feature)
      return level === 'full' || level === 'create' || level === 'view_only'
    },
    [access]
  )

  const canCreate = useCallback(
    (feature: FeatureKey): boolean => {
      const level = access(feature)
      return level === 'full' || level === 'create'
    },
    [access]
  )

  const canEdit = useCallback(
    (feature: FeatureKey): boolean => access(feature) === 'full',
    [access]
  )

  return { access, canView, canCreate, canEdit, permissions: [], refetch, loading }
}
