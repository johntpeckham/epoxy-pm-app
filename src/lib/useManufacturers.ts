'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ManufacturerProduct {
  id: string
  manufacturer_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Manufacturer {
  id: string
  name: string
  created_at: string
  updated_at: string
  products: ManufacturerProduct[]
}

export function useManufacturers() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('manufacturers')
      .select('*, manufacturer_products(*)')
      .order('name')

    const result: Manufacturer[] = ((data ?? []) as (Omit<Manufacturer, 'products'> & { manufacturer_products: ManufacturerProduct[] })[]).map((m) => ({
      ...m,
      products: (m.manufacturer_products ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))

    setManufacturers(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addManufacturer = useCallback(async (name: string): Promise<Manufacturer | string> => {
    const trimmed = name.trim()
    if (!trimmed) return 'Name is required'
    const supabase = createClient()
    const { data, error } = await supabase
      .from('manufacturers')
      .insert({ name: trimmed })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return 'A manufacturer with this name already exists'
      return error.message
    }
    const newMfr: Manufacturer = { ...(data as Omit<Manufacturer, 'products'>), products: [] }
    setManufacturers((prev) => [...prev, newMfr].sort((a, b) => a.name.localeCompare(b.name)))
    return newMfr
  }, [])

  const updateManufacturer = useCallback(async (id: string, name: string): Promise<true | string> => {
    const trimmed = name.trim()
    if (!trimmed) return 'Name is required'
    const supabase = createClient()
    const { error } = await supabase
      .from('manufacturers')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      if (error.code === '23505') return 'A manufacturer with this name already exists'
      return error.message
    }
    setManufacturers((prev) =>
      prev.map((m) => m.id === id ? { ...m, name: trimmed } : m)
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    return true
  }, [])

  const deleteManufacturer = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('manufacturers').delete().eq('id', id)
    setManufacturers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const addProduct = useCallback(async (manufacturerId: string, name: string): Promise<ManufacturerProduct | string> => {
    const trimmed = name.trim()
    if (!trimmed) return 'Name is required'
    const supabase = createClient()
    const { data, error } = await supabase
      .from('manufacturer_products')
      .insert({ manufacturer_id: manufacturerId, name: trimmed })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return 'A product with this name already exists for this manufacturer'
      return error.message
    }
    const product = data as ManufacturerProduct
    setManufacturers((prev) =>
      prev.map((m) =>
        m.id === manufacturerId
          ? { ...m, products: [...m.products, product].sort((a, b) => a.name.localeCompare(b.name)) }
          : m
      )
    )
    return product
  }, [])

  const updateProduct = useCallback(async (productId: string, manufacturerId: string, name: string): Promise<true | string> => {
    const trimmed = name.trim()
    if (!trimmed) return 'Name is required'
    const supabase = createClient()
    const { error } = await supabase
      .from('manufacturer_products')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', productId)
    if (error) {
      if (error.code === '23505') return 'A product with this name already exists for this manufacturer'
      return error.message
    }
    setManufacturers((prev) =>
      prev.map((m) =>
        m.id === manufacturerId
          ? { ...m, products: m.products.map((p) => p.id === productId ? { ...p, name: trimmed } : p).sort((a, b) => a.name.localeCompare(b.name)) }
          : m
      )
    )
    return true
  }, [])

  const deleteProduct = useCallback(async (productId: string, manufacturerId: string) => {
    const supabase = createClient()
    await supabase.from('manufacturer_products').delete().eq('id', productId)
    setManufacturers((prev) =>
      prev.map((m) =>
        m.id === manufacturerId
          ? { ...m, products: m.products.filter((p) => p.id !== productId) }
          : m
      )
    )
  }, [])

  return {
    manufacturers,
    loading,
    refetch,
    addManufacturer,
    updateManufacturer,
    deleteManufacturer,
    addProduct,
    updateProduct,
    deleteProduct,
  }
}
