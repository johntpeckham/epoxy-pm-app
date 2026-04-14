export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type {
  UserRole,
  MaterialSupplier,
  InventoryProduct,
  InventoryKitGroup,
  MasterSupplier,
  MasterProduct,
  MasterKitGroup,
  UnitType,
} from '@/types'
import InventoryPageClient, {
  type InventoryProfileOption,
  type PendingStockCheckInfo,
  type PendingPriceCheckInfo,
} from '@/components/inventory/InventoryPageClient'

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

  const [
    { data: suppliersRaw },
    { data: productsRaw },
    { data: kitGroupsRaw },
    { data: profilesRaw },
    { data: unitTypesRaw },
    { data: masterSuppliersRaw },
    { data: masterProductsRaw },
    { data: masterKitGroupsRaw },
  ] = await Promise.all([
    supabase
      .from('material_suppliers')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('inventory_products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('inventory_kit_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, display_name')
      .order('display_name', { ascending: true }),
    supabase
      .from('unit_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('master_suppliers')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('master_products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('master_kit_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const suppliers = (suppliersRaw ?? []) as MaterialSupplier[]
  const products = (productsRaw ?? []) as InventoryProduct[]
  const kitGroups = (kitGroupsRaw ?? []) as InventoryKitGroup[]
  const profiles = (profilesRaw ?? []) as InventoryProfileOption[]
  const unitTypes = (unitTypesRaw ?? []) as UnitType[]
  const masterSuppliers = (masterSuppliersRaw ?? []) as MasterSupplier[]
  const masterProducts = (masterProductsRaw ?? []) as MasterProduct[]
  const masterKitGroups = (masterKitGroupsRaw ?? []) as MasterKitGroup[]

  // Build a lookup of pending stock check task → assignee display name, so the
  // UI can render "Pending — Alice" without another round trip. We only need
  // the task_ids that actually have a pending link on a product.
  const pendingTaskIds = Array.from(
    new Set(
      products
        .map((p) => p.stock_check_task_id)
        .filter((v): v is string => !!v)
    )
  )
  const pendingStockChecks: Record<string, PendingStockCheckInfo> = {}
  if (pendingTaskIds.length > 0) {
    const { data: pendingTasks } = await supabase
      .from('office_tasks')
      .select('id, assigned_to')
      .in('id', pendingTaskIds)
    const tasks = (pendingTasks ?? []) as { id: string; assigned_to: string | null }[]
    const profilesById = new Map(profiles.map((p) => [p.id, p]))
    for (const t of tasks) {
      pendingStockChecks[t.id] = {
        taskId: t.id,
        assigneeId: t.assigned_to,
        assigneeName: t.assigned_to
          ? profilesById.get(t.assigned_to)?.display_name ?? 'Unknown'
          : 'Unassigned',
      }
    }
  }

  // Build a similar lookup for pending price check tasks.
  const pendingPriceTaskIds = Array.from(
    new Set(
      products
        .map((p) => p.price_check_task_id)
        .filter((v): v is string => !!v)
    )
  )
  const pendingPriceChecks: Record<string, PendingPriceCheckInfo> = {}
  if (pendingPriceTaskIds.length > 0) {
    const { data: pendingPriceTasks } = await supabase
      .from('office_tasks')
      .select('id, assigned_to')
      .in('id', pendingPriceTaskIds)
    const priceTasks = (pendingPriceTasks ?? []) as { id: string; assigned_to: string | null }[]
    const profilesById2 = new Map(profiles.map((p) => [p.id, p]))
    for (const t of priceTasks) {
      pendingPriceChecks[t.id] = {
        taskId: t.id,
        assigneeId: t.assigned_to,
        assigneeName: t.assigned_to
          ? profilesById2.get(t.assigned_to)?.display_name ?? 'Unknown'
          : 'Unassigned',
      }
    }
  }

  return (
    <InventoryPageClient
      userRole={userRole}
      currentUserId={user.id}
      initialSuppliers={suppliers}
      initialProducts={products}
      initialKitGroups={kitGroups}
      initialUnitTypes={unitTypes}
      profiles={profiles}
      initialPendingStockChecks={pendingStockChecks}
      initialPendingPriceChecks={pendingPriceChecks}
      masterSuppliers={masterSuppliers}
      masterProducts={masterProducts}
      masterKitGroups={masterKitGroups}
    />
  )
}
