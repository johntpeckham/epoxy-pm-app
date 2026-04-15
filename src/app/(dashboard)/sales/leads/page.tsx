export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import LeadsClient, { Lead, LeadCategory } from '@/components/sales/leads/LeadsClient'

export default async function LeadsPage() {
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

  const [leadsRes, categoriesRes] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
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
