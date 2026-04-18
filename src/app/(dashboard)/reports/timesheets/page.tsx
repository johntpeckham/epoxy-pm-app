export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Project } from '@/types'
import TimesheetReportClient from '@/components/reports/TimesheetReportClient'

export default async function TimesheetReportPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return null
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'office_manager') {
    redirect('/my-work')
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true })

  const { data: employees } = await supabase
    .from('employee_profiles')
    .select('id, name, is_active')
    .order('name', { ascending: true })

  return (
    <TimesheetReportClient
      projects={(projects as Project[]) ?? []}
      employees={employees ?? []}
    />
  )
}
