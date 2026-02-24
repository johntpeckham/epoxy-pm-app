export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Task, Project, Profile } from '@/types'
import TasksPageClient from '@/components/tasks/TasksPageClient'

export default async function TasksPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all tasks with project names
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, projects(name)')
    .order('created_at', { ascending: false })

  // Fetch all profiles for display names
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, updated_at')

  // Fetch active projects for filtering
  const { data: projectRows } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true })

  const taskList = (tasks ?? []).map((row) => ({
    ...row,
    project_name:
      (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project',
  }))

  return (
    <TasksPageClient
      initialTasks={taskList as (Task & { project_name: string })[]}
      profiles={(profileRows as Profile[]) ?? []}
      projects={(projectRows as Project[]) ?? []}
      userId={user.id}
    />
  )
}
