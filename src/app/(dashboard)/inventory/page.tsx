export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole, MaterialSupplier, InventoryProduct } from '@/types'
import InventoryPageClient from '@/components/inventory/InventoryPageClient'

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  // Material Inventory is only accessible to office roles — foremen and crew
  // hit the Office page with a reduced view and shouldn't land here.
  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman'
  ) {
    return redirect('/my-work')
  }

  const [{ data: suppliersRaw }, { data: productsRaw }] = await Promise.all([
    supabase
      .from('material_suppliers')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('inventory_products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const suppliers = (suppliersRaw ?? []) as MaterialSupplier[]
  const products = (productsRaw ?? []) as InventoryProduct[]

  return (
    <InventoryPageClient
      userRole={userRole}
      initialSuppliers={suppliers}
      initialProducts={products}
    />
  )
}
