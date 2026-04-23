export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import SalesDashboardClient from '@/components/sales/SalesDashboardClient'
import { fetchTeamOverview } from '@/lib/salesTeamStats'

export default async function SalesPage() {
  const { supabase } = await requirePermission('crm', 'view')
  const initialOverview = await fetchTeamOverview(supabase, 'weekly')

  return (
    <SalesDashboardClient
      initialRange="weekly"
      initialOverview={initialOverview}
    />
  )
}
