'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CompanySettings } from '@/types'

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    setSettings(data as CompanySettings | null)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { settings, loading, refetch }
}
