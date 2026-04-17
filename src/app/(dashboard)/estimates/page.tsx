export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import EstimatesLayoutClient from '@/components/estimates/EstimatesLayoutClient'

export default async function EstimatesPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  const { data: customers } = await supabase
    .from('companies')
    .select('*')
    .eq('archived', false)
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
