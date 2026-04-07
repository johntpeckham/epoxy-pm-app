export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchedulerClient from '@/components/scheduler/SchedulerClient'
import type { EmployeeProfile } from '@/types'

export default async function SchedulerPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return redirect('/login')
  const user = session.user

  // Access check: admin OR scheduler_access=true
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, scheduler_access')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'crew') as string
  const hasAccess = role === 'admin' || Boolean((profile as { scheduler_access?: boolean } | null)?.scheduler_access)

  if (!hasAccess) return redirect('/my-work')

  // Fetch employees for the bottom strip
  const { data: employees } = await supabase
    .from('employee_profiles')
    .select('*')
    .order('name', { ascending: true })

  return (
    <SchedulerClient
      userId={user.id}
      employees={(employees as EmployeeProfile[]) ?? []}
    />
  )
}
