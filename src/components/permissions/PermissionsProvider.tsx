'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole, AccessLevel } from '@/types'
import type { FeatureKey } from '@/lib/featureKeys'

interface PermissionsContextValue {
  role: UserRole | null
  permissionsMap: Map<FeatureKey, AccessLevel>
  /** Per-feature sidebar-hide flag. Only populated for non-admin users; a
   *  missing entry means "not hidden". */
  hideFromSidebarMap: Map<FeatureKey, boolean>
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function usePermissionsContext(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    throw new Error('usePermissionsContext must be used within <PermissionsProvider>')
  }
  return ctx
}

export default function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null)
  const [permissionsMap, setPermissionsMap] = useState<Map<FeatureKey, AccessLevel>>(new Map())
  const [hideFromSidebarMap, setHideFromSidebarMap] = useState<Map<FeatureKey, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = supabaseRef.current

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setRole(null)
      setPermissionsMap(new Map())
      setHideFromSidebarMap(new Map())
      setError(userError?.message ?? null)
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      setRole(null)
      setPermissionsMap(new Map())
      setHideFromSidebarMap(new Map())
      setError(profileError?.message ?? 'Profile not found')
      setLoading(false)
      return
    }

    const nextRole = (profile.role as UserRole) ?? 'crew'
    setRole(nextRole)

    // Admin: skip user_permissions fetch — hook short-circuits to 'full'
    // and isHiddenFromSidebar always returns false.
    if (nextRole === 'admin') {
      setPermissionsMap(new Map())
      setHideFromSidebarMap(new Map())
      setLoading(false)
      return
    }

    const { data: rows, error: permsError } = await supabase
      .from('user_permissions')
      .select('feature, access_level, hide_from_sidebar')
      .eq('user_id', user.id)

    if (permsError) {
      setPermissionsMap(new Map())
      setHideFromSidebarMap(new Map())
      setError(permsError.message)
      setLoading(false)
      return
    }

    const nextAccess = new Map<FeatureKey, AccessLevel>()
    const nextHide = new Map<FeatureKey, boolean>()
    for (const row of (rows ?? []) as {
      feature: string
      access_level: AccessLevel
      hide_from_sidebar: boolean | null
    }[]) {
      nextAccess.set(row.feature as FeatureKey, row.access_level)
      if (row.hide_from_sidebar) {
        nextHide.set(row.feature as FeatureKey, true)
      }
    }
    setPermissionsMap(nextAccess)
    setHideFromSidebarMap(nextHide)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo<PermissionsContextValue>(
    () => ({ role, permissionsMap, hideFromSidebarMap, loading, error, refetch: load }),
    [role, permissionsMap, hideFromSidebarMap, loading, error, load]
  )

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}
