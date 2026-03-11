'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MaterialSystemItem {
  id: string
  material_system_id: string
  material_name: string
  thickness: string | null
  coverage_rate: string | null
  item_notes: string | null
  sort_order: number
  created_at: string
}

export interface MaterialSystem {
  id: string
  name: string
  notes: string | null
  created_at: string
  items: MaterialSystemItem[]
}

export interface MaterialSystemInput {
  name: string
  notes?: string
  items?: { material_name: string; thickness?: string; coverage_rate?: string; item_notes?: string; sort_order: number }[]
}

export function useMaterialSystems() {
  const [systems, setSystems] = useState<MaterialSystem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data: systemsData } = await supabase
      .from('material_systems')
      .select('*')
      .order('name')
    const { data: itemsData } = await supabase
      .from('material_system_items')
      .select('*')
      .order('sort_order')

    const itemsBySystem = new Map<string, MaterialSystemItem[]>()
    for (const item of (itemsData ?? []) as MaterialSystemItem[]) {
      const arr = itemsBySystem.get(item.material_system_id) ?? []
      arr.push(item)
      itemsBySystem.set(item.material_system_id, arr)
    }

    const result: MaterialSystem[] = ((systemsData ?? []) as Omit<MaterialSystem, 'items'>[]).map((s) => ({
      ...s,
      items: itemsBySystem.get(s.id) ?? [],
    }))

    setSystems(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addSystem = useCallback(async (input: MaterialSystemInput): Promise<MaterialSystem | null> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('material_systems')
      .insert({ name: input.name.trim(), notes: input.notes?.trim() || null })
      .select()
      .single()
    if (error || !data) return null

    const system = data as Omit<MaterialSystem, 'items'> & { items?: MaterialSystemItem[] }
    const items: MaterialSystemItem[] = []

    if (input.items && input.items.length > 0) {
      const itemRows = input.items
        .filter((i) => i.material_name.trim())
        .map((i, idx) => ({
          material_system_id: system.id,
          material_name: i.material_name.trim(),
          thickness: i.thickness?.trim() || null,
          coverage_rate: i.coverage_rate?.trim() || null,
          item_notes: i.item_notes?.trim() || null,
          sort_order: idx,
        }))
      if (itemRows.length > 0) {
        const { data: insertedItems } = await supabase
          .from('material_system_items')
          .insert(itemRows)
          .select()
        if (insertedItems) items.push(...(insertedItems as MaterialSystemItem[]))
      }
    }

    const newSystem: MaterialSystem = { ...system, items }
    setSystems((prev) => [...prev, newSystem].sort((a, b) => a.name.localeCompare(b.name)))
    return newSystem
  }, [])

  const updateSystem = useCallback(async (id: string, input: MaterialSystemInput) => {
    const supabase = createClient()
    await supabase
      .from('material_systems')
      .update({ name: input.name.trim(), notes: input.notes?.trim() || null })
      .eq('id', id)

    // Replace all items: delete existing, insert new
    await supabase.from('material_system_items').delete().eq('material_system_id', id)

    let items: MaterialSystemItem[] = []
    const itemRows = (input.items ?? [])
      .filter((i) => i.material_name.trim())
      .map((i, idx) => ({
        material_system_id: id,
        material_name: i.material_name.trim(),
        thickness: i.thickness?.trim() || null,
        coverage_rate: i.coverage_rate?.trim() || null,
        item_notes: i.item_notes?.trim() || null,
        sort_order: idx,
      }))
    if (itemRows.length > 0) {
      const { data: insertedItems } = await supabase
        .from('material_system_items')
        .insert(itemRows)
        .select()
      if (insertedItems) items = insertedItems as MaterialSystemItem[]
    }

    setSystems((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, name: input.name.trim(), notes: input.notes?.trim() || null, items }
          : s
      ).sort((a, b) => a.name.localeCompare(b.name))
    )
  }, [])

  const deleteSystem = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('material_systems').delete().eq('id', id)
    setSystems((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { systems, loading, refetch, addSystem, updateSystem, deleteSystem }
}
