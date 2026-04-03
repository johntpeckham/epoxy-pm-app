export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import MyWorkClient from '@/components/my-work/MyWorkClient'

export default async function MyWorkPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  // Fetch tasks assigned to current user with project names
  const { data: assignedTasks } = await supabase
    .from('tasks')
    .select('*, projects(name)')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  // Fetch checklist items assigned to current user with project names
  const { data: assignedChecklistItems } = await supabase
    .from('project_checklist_items')
    .select('*, projects(name)')
    .eq('assigned_to', user.id)
    .order('sort_order', { ascending: true })

  // Fetch personal tasks
  const { data: personalTasks } = await supabase
    .from('personal_tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  // Fetch personal notes
  const { data: personalNotes } = await supabase
    .from('personal_notes')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  const tasksWithProject = (assignedTasks ?? []).map((row) => ({
    ...row,
    project_name:
      (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project',
  }))

  const checklistWithProject = (assignedChecklistItems ?? []).map((row) => ({
    ...row,
    project_name:
      (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project',
  }))

  return (
    <MyWorkClient
      userId={user.id}
      initialAssignedTasks={tasksWithProject}
      initialAssignedChecklist={checklistWithProject}
      initialPersonalTasks={personalTasks ?? []}
      initialPersonalNotes={personalNotes ?? []}
    />
  )
}
