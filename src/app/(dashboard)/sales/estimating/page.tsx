export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import type { Customer } from '@/components/estimates/types'
import EstimatingClient from '@/components/sales/estimating/EstimatingClient'

export default async function SalesEstimatingPage() {
  const { supabase, user } = await requirePermission('estimating', 'view')

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
