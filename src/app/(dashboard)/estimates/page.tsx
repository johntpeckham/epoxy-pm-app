export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EstimatesLayoutClient from '@/components/estimates/EstimatesLayoutClient'

export default async function EstimatesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  return (
    <EstimatesLayoutClient
      initialCustomers={customers ?? []}
      initialSettings={settings}
      userId={user.id}
    />
  )
}
