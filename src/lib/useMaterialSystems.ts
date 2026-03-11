'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type MaterialSystemVersion = 'internal' | 'client'

export interface MaterialSystemItem {
  id: string
  material_system_id: string
  material_name: string
  unit_size: string | null
  coverage_rate: string | null
  sort_order: number
  version: MaterialSystemVersion
  custom_column_values: Record<string, string>
  created_at: string
}

export interface MaterialSystemColumn {
  id: string
  material_system_id: string
  version: MaterialSystemVersion
  column_name: string
  sort_order: number
}

export interface MaterialSystem {
  id: string
  name: string
  notes: string | null
  created_at: string
  items: MaterialSystemItem[]
  columns: MaterialSystemColumn[]
}

export interface MaterialSystemItemInput {
  material_name: string
  unit_size?: string
  coverage_rate?: string
  sort_order: number
  custom_column_values?: Record<string, string>
}

export interface MaterialSystemInput {
  name: string
  notes?: string
  internal_items?: MaterialSystemItemInput[]
  client_items?: MaterialSystemItemInput[]
  internal_columns?: { column_name: string; sort_order: number }[]
  client_columns?: { column_name: string; sort_order: number }[]
  // Legacy: if items is provided without version-specific fields, treat as internal
  items?: MaterialSystemItemInput[]
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
    const { data: columnsData } = await supabase
      .from('material_system_columns')
      .select('*')
      .order('sort_order')

    const itemsBySystem = new Map<string, MaterialSystemItem[]>()
    for (const item of (itemsData ?? []) as MaterialSystemItem[]) {
      const arr = itemsBySystem.get(item.material_system_id) ?? []
      arr.push({ ...item, custom_column_values: item.custom_column_values ?? {} })
      itemsBySystem.set(item.material_system_id, arr)
    }

    const columnsBySystem = new Map<string, MaterialSystemColumn[]>()
    for (const col of (columnsData ?? []) as MaterialSystemColumn[]) {
      const arr = columnsBySystem.get(col.material_system_id) ?? []
      arr.push(col)
      columnsBySystem.set(col.material_system_id, arr)
    }

    const result: MaterialSystem[] = ((systemsData ?? []) as Omit<MaterialSystem, 'items' | 'columns'>[]).map((s) => ({
      ...s,
      items: itemsBySystem.get(s.id) ?? [],
      columns: columnsBySystem.get(s.id) ?? [],
    }))

    setSystems(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function insertItems(
    supabase: ReturnType<typeof createClient>,
    systemId: string,
    items: MaterialSystemItemInput[],
    version: MaterialSystemVersion,
  ): Promise<MaterialSystemItem[]> {
    const itemRows = items
      .filter((i) => i.material_name.trim())
      .map((i, idx) => ({
        material_system_id: systemId,
        material_name: i.material_name.trim(),
        unit_size: i.unit_size?.trim() || null,
        coverage_rate: i.coverage_rate?.trim() || null,
        sort_order: idx,
        version,
        custom_column_values: i.custom_column_values ?? {},
      }))
    if (itemRows.length === 0) return []
    const { data } = await supabase
      .from('material_system_items')
      .insert(itemRows)
      .select()
    return (data ?? []) as MaterialSystemItem[]
  }

  async function insertColumns(
    supabase: ReturnType<typeof createClient>,
    systemId: string,
    columns: { column_name: string; sort_order: number }[],
    version: MaterialSystemVersion,
  ): Promise<MaterialSystemColumn[]> {
    const colRows = columns
      .filter((c) => c.column_name.trim())
      .map((c) => ({
        material_system_id: systemId,
        version,
        column_name: c.column_name.trim(),
        sort_order: c.sort_order,
      }))
    if (colRows.length === 0) return []
    const { data } = await supabase
      .from('material_system_columns')
      .insert(colRows)
      .select()
    return (data ?? []) as MaterialSystemColumn[]
  }

  const addSystem = useCallback(async (input: MaterialSystemInput): Promise<MaterialSystem | null> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('material_systems')
      .insert({ name: input.name.trim(), notes: input.notes?.trim() || null })
      .select()
      .single()
    if (error || !data) return null

    const system = data as Omit<MaterialSystem, 'items' | 'columns'>

    // Insert items for both versions
    const internalItems = input.internal_items ?? input.items ?? []
    const clientItems = input.client_items ?? []
    const insertedInternal = await insertItems(supabase, system.id, internalItems, 'internal')
    const insertedClient = await insertItems(supabase, system.id, clientItems, 'client')

    // Insert columns for both versions
    const insertedInternalCols = await insertColumns(supabase, system.id, input.internal_columns ?? [], 'internal')
    const insertedClientCols = await insertColumns(supabase, system.id, input.client_columns ?? [], 'client')

    const newSystem: MaterialSystem = {
      ...system,
      items: [...insertedInternal, ...insertedClient],
      columns: [...insertedInternalCols, ...insertedClientCols],
    }
    setSystems((prev) => [...prev, newSystem].sort((a, b) => a.name.localeCompare(b.name)))
    return newSystem
  }, [])

  const updateSystem = useCallback(async (id: string, input: MaterialSystemInput) => {
    const supabase = createClient()
    await supabase
      .from('material_systems')
      .update({ name: input.name.trim(), notes: input.notes?.trim() || null })
      .eq('id', id)

    // Replace all items and columns: delete existing, insert new
    await supabase.from('material_system_items').delete().eq('material_system_id', id)
    await supabase.from('material_system_columns').delete().eq('material_system_id', id)

    const internalItems = input.internal_items ?? input.items ?? []
    const clientItems = input.client_items ?? []
    const insertedInternal = await insertItems(supabase, id, internalItems, 'internal')
    const insertedClient = await insertItems(supabase, id, clientItems, 'client')

    const insertedInternalCols = await insertColumns(supabase, id, input.internal_columns ?? [], 'internal')
    const insertedClientCols = await insertColumns(supabase, id, input.client_columns ?? [], 'client')

    const allItems = [...insertedInternal, ...insertedClient]
    const allColumns = [...insertedInternalCols, ...insertedClientCols]

    setSystems((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, name: input.name.trim(), notes: input.notes?.trim() || null, items: allItems, columns: allColumns }
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

/** Helper: get items for a specific version from a MaterialSystem */
export function getItemsByVersion(system: MaterialSystem, version: MaterialSystemVersion): MaterialSystemItem[] {
  return system.items.filter((i) => i.version === version)
}

/** Helper: get columns for a specific version from a MaterialSystem */
export function getColumnsByVersion(system: MaterialSystem, version: MaterialSystemVersion): MaterialSystemColumn[] {
  return system.columns.filter((c) => c.version === version)
}
