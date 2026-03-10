export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BillingLayoutClient from '@/components/billing/BillingLayoutClient'

export default async function BillingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
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
