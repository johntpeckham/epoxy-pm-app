'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MaterialSystemUnit {
  id: string
  name: string
  created_at: string
}

export function useMaterialSystemUnits() {
  const [units, setUnits] = useState<MaterialSystemUnit[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('material_system_units')
      .select('*')
      .order('name')
    setUnits((data as MaterialSystemUnit[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addUnit = useCallback(async (name: string): Promise<MaterialSystemUnit | null> => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const supabase = createClient()
    const { data, error } = await supabase
      .from('material_system_units')
      .insert({ name: trimmed })
      .select()
      .single()
    if (error || !data) return null
    const unit = data as MaterialSystemUnit
    setUnits((prev) => [...prev, unit].sort((a, b) => a.name.localeCompare(b.name)))
    return unit
  }, [])

  return { units, loading, addUnit, refetch }
}
