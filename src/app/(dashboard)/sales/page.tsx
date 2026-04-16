export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import SalesDashboardClient from '@/components/sales/SalesDashboardClient'
import { fetchTeamOverview } from '@/lib/salesTeamStats'

export default async function SalesPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman'
  ) {
    return redirect('/my-work')
  }

  const initialOverview = await fetchTeamOverview(supabase, 'weekly')

  return (
    <SalesDashboardClient
      initialRange="weekly"
      initialOverview={initialOverview}
    />
  )
}
