export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailerClient from '@/components/sales/emailer/EmailerClient'
import type { UserRole } from '@/types'

export default async function SalesEmailerPage() {
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

  return <EmailerClient />
}
