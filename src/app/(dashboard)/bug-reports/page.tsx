export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BugReportsClient from '@/components/bug-reports/BugReportsClient'

export default async function BugReportsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return null
  const user = session.user

  // Only admins can access this page
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/my-work')

  return <BugReportsClient />
}
