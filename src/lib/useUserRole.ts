'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('crew')
  const [schedulerAccess, setSchedulerAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('role, scheduler_access')
        .eq('id', user.id)
        .single()

      if (data?.role) {
        setRole(data.role as UserRole)
      }
      if (data && 'scheduler_access' in (data as Record<string, unknown>)) {
        setSchedulerAccess(Boolean((data as { scheduler_access?: boolean }).scheduler_access))
      }
      setLoading(false)
    }

    fetchRole()
  }, [])

  return { role, schedulerAccess, loading }
}
