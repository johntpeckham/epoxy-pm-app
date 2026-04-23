export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import type { UserRole } from '@/types'
import LeadsClient, { Lead, LeadCategory } from '@/components/sales/leads/LeadsClient'

export default async function LeadsPage() {
  const { supabase, user, permissions } = await requirePermission('leads', 'view')
  const userRole = (permissions.role ?? 'crew') as UserRole

  const leadsQuery = supabase.from('leads').select('*').order('created_at', { ascending: false })
  // Non-admins only see leads assigned to them.
  if (!permissions.isAdmin) leadsQuery.eq('assigned_to', user.id)
  const [leadsRes, categoriesRes] = await Promise.all([
    leadsQuery,
    supabase.from('lead_categories').select('*').order('name', { ascending: true }),
  ])

  return (
    <Suspense>
      <LeadsClient
        initialLeads={(leadsRes.data as Lead[]) ?? []}
        initialCategories={(categoriesRes.data as LeadCategory[]) ?? []}
        userId={user.id}
        userRole={userRole}
      />
    </Suspense>
  )
}
