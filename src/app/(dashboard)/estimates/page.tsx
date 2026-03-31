export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EstimatesLayoutClient from '@/components/estimates/EstimatesLayoutClient'

export default async function EstimatesPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  const { data: settings } = await supabase
    .from('estimate_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { data: allEstimates } = await supabase
    .from('estimates')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <EstimatesLayoutClient
      initialCustomers={customers ?? []}
      initialSettings={settings}
      initialAllEstimates={allEstimates ?? []}
      userId={user.id}
    />
  )
}
