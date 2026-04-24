export const dynamic = 'force-dynamic'

import { requireAnyPermission, SALES_FEATURES } from '@/lib/requireAnyPermission'
import SalesDashboardClient from '@/components/sales/SalesDashboardClient'
import { fetchTeamOverview } from '@/lib/salesTeamStats'

export default async function SalesPage() {
  const { supabase } = await requireAnyPermission(SALES_FEATURES, 'view')
  const initialOverview = await fetchTeamOverview(supabase, 'weekly')

  return (
    <SalesDashboardClient
      initialRange="weekly"
      initialOverview={initialOverview}
    />
  )
}
