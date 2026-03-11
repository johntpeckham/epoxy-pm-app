'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MaterialSystem {
  id: string
  name: string
  created_at: string
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

  const addSystem = useCallback(async (name: string): Promise<MaterialSystem | null> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('material_systems')
      .insert({ name: name.trim() })
      .select()
      .single()
    if (error || !data) return null
    const newSystem = data as MaterialSystem
    setSystems((prev) => [...prev, newSystem].sort((a, b) => a.name.localeCompare(b.name)))
    return newSystem
  }, [])

  const updateSystem = useCallback(async (id: string, name: string) => {
    const supabase = createClient()
    await supabase.from('material_systems').update({ name: name.trim() }).eq('id', id)
    setSystems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)).sort((a, b) => a.name.localeCompare(b.name))
    )
  }, [])

  const deleteSystem = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('material_systems').delete().eq('id', id)
    setSystems((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { systems, loading, refetch, addSystem, updateSystem, deleteSystem }
}
