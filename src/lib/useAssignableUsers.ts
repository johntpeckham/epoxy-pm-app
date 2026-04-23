'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface AssignableUser {
  id: string
  display_name: string | null
  role: string
}

export function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'office_manager', 'salesman'])
      .order('display_name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          const message =
            (err as { message?: string }).message ?? 'Failed to load users'
          setError(new Error(message))
          setLoading(false)
          return
        }
        setUsers((data ?? []) as AssignableUser[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { users, loading, error }
}
