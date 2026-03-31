export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MaterialSystemsClient from '@/components/material-systems/MaterialSystemsClient'

export default async function MaterialSystemsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')
  const user = session.user

  // Only admin and office_manager can access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'office_manager') {
    redirect('/jobs')
  }

  return <MaterialSystemsClient />
}
