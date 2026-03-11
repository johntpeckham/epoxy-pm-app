'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MaterialSystem {
  id: string
  name: string
  default_quantity: string | null
  default_coverage_rate: string | null
  default_notes: string | null
  created_at: string
}

export interface MaterialSystemInput {
  name: string
  default_quantity?: string
  default_coverage_rate?: string
  default_notes?: string
}

export function useMaterialSystems() {
  const [systems, setSystems] = useState<MaterialSystem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('material_systems')
      .select('*')
      .order('name')
    setSystems((data as MaterialSystem[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addSystem = useCallback(async (input: MaterialSystemInput): Promise<MaterialSystem | null> => {
    const supabase = createClient()
    const row = {
      name: input.name.trim(),
      default_quantity: input.default_quantity?.trim() || null,
      default_coverage_rate: input.default_coverage_rate?.trim() || null,
      default_notes: input.default_notes?.trim() || null,
    }
    const { data, error } = await supabase
      .from('material_systems')
      .insert(row)
      .select()
      .single()
    if (error || !data) return null
    const newSystem = data as MaterialSystem
    setSystems((prev) => [...prev, newSystem].sort((a, b) => a.name.localeCompare(b.name)))
    return newSystem
  }, [])

  const updateSystem = useCallback(async (id: string, input: MaterialSystemInput) => {
    const supabase = createClient()
    const row = {
      name: input.name.trim(),
      default_quantity: input.default_quantity?.trim() || null,
      default_coverage_rate: input.default_coverage_rate?.trim() || null,
      default_notes: input.default_notes?.trim() || null,
    }
    await supabase.from('material_systems').update(row).eq('id', id)
    setSystems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...row } : s)).sort((a, b) => a.name.localeCompare(b.name))
    )
  }, [])

  const deleteSystem = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('material_systems').delete().eq('id', id)
    setSystems((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { systems, loading, refetch, addSystem, updateSystem, deleteSystem }
}
