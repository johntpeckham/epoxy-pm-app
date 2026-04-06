export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import OfficeTasksPageClient from '@/components/office-tasks/OfficeTasksPageClient'

export default async function OfficePage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  // Check role — only admin, office_manager, salesman can access
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  if (userRole !== 'admin' && userRole !== 'office_manager' && userRole !== 'salesman') {
    return redirect('/my-work')
  }

  // Fetch ALL office tasks
  const { data: tasks } = await supabase
    .from('office_tasks')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch all profiles for assignee display and selectors
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, updated_at')

  // Fetch active projects for selectors
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch equipment counts for the Equipment dashboard card
  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('status')

  const equipmentTotal = equipmentRows?.length ?? 0
  const equipmentActive = equipmentRows?.filter((e) => e.status === 'active').length ?? 0
  const equipmentOutOfService = equipmentRows?.filter((e) => e.status === 'out_of_service').length ?? 0

  return (
    <OfficeTasksPageClient
      userId={user.id}
      userRole={userRole}
      initialTasks={tasks ?? []}
      initialProfiles={profiles ?? []}
      initialProjects={projects ?? []}
      equipmentCounts={{ total: equipmentTotal, active: equipmentActive, outOfService: equipmentOutOfService }}
    />
  )
}
