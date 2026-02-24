'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('crew')
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
        .select('role')
        .eq('id', user.id)
        .single()

      if (data?.role) {
        setRole(data.role as UserRole)
      }
      setLoading(false)
    }

    fetchRole()
  }, [])

  return { role, loading }
}
