export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import type { Customer } from '@/components/estimates/types'
import EstimatingClient from '@/components/sales/estimating/EstimatingClient'

export default async function SalesEstimatingPage() {
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

  const { data: customers } = await supabase
    .from('companies')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true })

  return (
    <Suspense>
      <EstimatingClient
        initialCustomers={(customers as Customer[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
