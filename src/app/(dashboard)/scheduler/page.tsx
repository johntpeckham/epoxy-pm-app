export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchedulerPageClient from '@/components/scheduler/SchedulerPageClient'
import type { Project, EmployeeProfile } from '@/types'

export default async function SchedulerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: projects }, { data: employees }, { data: assignments }, { data: bucketPositions }] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .not('start_date', 'is', null)
      .not('end_date', 'is', null)
      .order('name', { ascending: true }),
    supabase
      .from('employee_profiles')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('scheduler_assignments')
      .select('*'),
    supabase
      .from('scheduler_bucket_positions')
      .select('*'),
  ])

  return (
    <SchedulerPageClient
      initialProjects={(projects as Project[]) ?? []}
      initialEmployees={(employees as EmployeeProfile[]) ?? []}
      initialAssignments={assignments ?? []}
      initialBucketPositions={bucketPositions ?? []}
    />
  )
}
