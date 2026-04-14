export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type {
  UserRole,
  MasterSupplier,
  MasterProduct,
  MasterKitGroup,
  MasterProductDocument,
  UnitType,
} from '@/types'
import MaterialManagementClient, {
  type MaterialProfileOption,
  type PendingPriceCheckInfo,
} from '@/components/material-management/MaterialManagementClient'

export default async function MaterialManagementPage() {
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

  // Material Management is only accessible to admin, office_manager, salesman
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
    { data: documentsRaw },
    { data: profilesRaw },
    { data: unitTypesRaw },
  ] = await Promise.all([
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
    supabase
      .from('master_product_documents')
      .select('*')
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
  ])

  const suppliers = (suppliersRaw ?? []) as MasterSupplier[]
  const products = (productsRaw ?? []) as MasterProduct[]
  const kitGroups = (kitGroupsRaw ?? []) as MasterKitGroup[]
  const documents = (documentsRaw ?? []) as MasterProductDocument[]
  const profiles = (profilesRaw ?? []) as MaterialProfileOption[]
  const unitTypes = (unitTypesRaw ?? []) as UnitType[]

  // Build pending price check lookup
  const pendingTaskIds = Array.from(
    new Set(
      products
        .map((p) => p.price_check_task_id)
        .filter((v): v is string => !!v)
    )
  )
  const pendingPriceChecks: Record<string, PendingPriceCheckInfo> = {}
  if (pendingTaskIds.length > 0) {
    const { data: pendingTasks } = await supabase
      .from('office_tasks')
      .select('id, assigned_to')
      .in('id', pendingTaskIds)
    const tasks = (pendingTasks ?? []) as { id: string; assigned_to: string | null }[]
    const profilesById = new Map(profiles.map((p) => [p.id, p]))
    for (const t of tasks) {
      pendingPriceChecks[t.id] = {
        taskId: t.id,
        assigneeId: t.assigned_to,
        assigneeName: t.assigned_to
          ? profilesById.get(t.assigned_to)?.display_name ?? 'Unknown'
          : 'Unassigned',
      }
    }
  }

  return (
    <MaterialManagementClient
      userRole={userRole}
      currentUserId={user.id}
      initialSuppliers={suppliers}
      initialProducts={products}
      initialKitGroups={kitGroups}
      initialDocuments={documents}
      initialUnitTypes={unitTypes}
      profiles={profiles}
      initialPendingPriceChecks={pendingPriceChecks}
    />
  )
}
