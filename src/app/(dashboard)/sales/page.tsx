export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import SalesDashboardClient from '@/components/sales/SalesDashboardClient'
import {
  fetchWeekActivity,
  fetchMonthActivity,
  fetchOverdueContacts,
  fetchRecentActivity,
  fetchTeamStats,
} from '@/lib/salesStats'

export default async function SalesPage() {
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

  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman'
  ) {
    return redirect('/my-work')
  }

  // Top-card counts + upcoming appointments
  const nowIso = new Date().toISOString()
  const [
    { count: companyCountRaw },
    { count: contactCountRaw },
    { count: upcomingApptCountRaw },
    weekActivity,
    monthActivity,
    overdueContacts,
    recentActivity,
    teamStats,
  ] = await Promise.all([
    supabase.from('crm_companies').select('id', { count: 'exact', head: true }),
    supabase.from('crm_contacts').select('id', { count: 'exact', head: true }),
    supabase
      .from('crm_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('date', nowIso),
    fetchWeekActivity(supabase, user.id),
    fetchMonthActivity(supabase, user.id),
    fetchOverdueContacts(supabase, 30, 200),
    fetchRecentActivity(supabase, 20, 0),
    userRole === 'admin' ? fetchTeamStats(supabase) : Promise.resolve([]),
  ])

  return (
    <SalesDashboardClient
      userRole={userRole}
      companyCount={companyCountRaw ?? 0}
      contactCount={contactCountRaw ?? 0}
      upcomingApptCount={upcomingApptCountRaw ?? 0}
      weekActivity={weekActivity}
      monthActivity={monthActivity}
      overdueContacts={overdueContacts}
      recentActivity={recentActivity}
      teamStats={teamStats}
    />
  )
}
