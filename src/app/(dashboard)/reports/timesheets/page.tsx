export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { Project } from '@/types'
import TimesheetReportClient from '@/components/reports/TimesheetReportClient'

export default async function TimesheetReportPage() {
  const { supabase } = await requirePermission('reports', 'view')

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
