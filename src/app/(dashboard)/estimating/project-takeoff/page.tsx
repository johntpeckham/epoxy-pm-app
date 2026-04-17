export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProjectTakeoffClient from '@/components/project-takeoff/ProjectTakeoffClient'

export default async function ProjectTakeoffPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const [customersRes, projectsRes, estimatesRes, settingsRes] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('archived', false)
      .order('name', { ascending: true }),
    supabase
      .from('project_takeoff_projects')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('estimates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('estimate_settings')
      .select('*')
      .eq('user_id', user.id)
      .single(),
  ])

  return (
    <ProjectTakeoffClient
      initialCustomers={customersRes.data ?? []}
      initialProjects={projectsRes.data ?? []}
      initialAllEstimates={estimatesRes.data ?? []}
      initialSettings={settingsRes.data ?? null}
      userId={user.id}
    />
  )
}
