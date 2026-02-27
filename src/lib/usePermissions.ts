'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, FeatureKey, AccessLevel, RolePermission } from '@/types'

interface UsePermissionsReturn {
  /** Check access level for a feature. Admin always returns 'full'. */
  access: (feature: FeatureKey) => AccessLevel
  /** True if the user can view the feature (full, create, or view_only). */
  canView: (feature: FeatureKey) => boolean
  /** True if the user can create new items (full or create). */
  canCreate: (feature: FeatureKey) => boolean
  /** True if the user has full (edit/delete) access. */
  canEdit: (feature: FeatureKey) => boolean
  /** All permission rows (for admin UI). */
  permissions: RolePermission[]
  /** Reload permissions from the database. */
  refetch: () => Promise<void>
  loading: boolean
}

export function usePermissions(role: UserRole): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPermissions = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role')
      .order('feature')

    setPermissions((data as RolePermission[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  const access = useCallback(
    (feature: FeatureKey): AccessLevel => {
      // Admin always has full access
      if (role === 'admin') return 'full'

      const perm = permissions.find(
        (p) => p.role === role && p.feature === feature
      )
      return perm?.access_level ?? 'full' // default to full if not found
    },
    [role, permissions]
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
    (feature: FeatureKey): boolean => {
      return access(feature) === 'full'
    },
    [access]
  )

  return { access, canView, canCreate, canEdit, permissions, refetch: fetchPermissions, loading }
}
