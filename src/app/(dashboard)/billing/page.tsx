export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import BillingLayoutClient from '@/components/billing/BillingLayoutClient'

export default async function BillingPage() {
  const { supabase, user } = await requirePermission('billing', 'view')

  const { data: customers } = await supabase
    .from('companies')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true })

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', user.id)
    .order('issued_date', { ascending: false })

  return (
    <BillingLayoutClient
      initialCustomers={customers ?? []}
      initialInvoices={invoices ?? []}
      userId={user.id}
    />
  )
}
