export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { Task, Project, Profile } from '@/types'
import TasksPageClient from '@/components/tasks/TasksPageClient'

export default async function TasksPage() {
  const { supabase, user } = await requirePermission('tasks', 'view')

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
