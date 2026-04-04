export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import MyWorkClient from '@/components/my-work/MyWorkClient'
import type { UserRole } from '@/types'

export default async function MyWorkPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  // Fetch user role for expense visibility
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole
  const isAdminOrOM = userRole === 'admin' || userRole === 'office_manager'

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

  // Fetch office tasks (assigned to user or created by user)
  const { data: officeTasks } = await supabase
    .from('office_tasks')
    .select('*')
    .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
    .order('created_at', { ascending: false })

  // Fetch expenses — all roles can now access
  let expenseQuery = supabase
    .from('salesman_expenses')
    .select('*')
    .order('date', { ascending: false })

  if (!isAdminOrOM) {
    expenseQuery = expenseQuery.eq('user_id', user.id)
  }

  const { data: expenseRows } = await expenseQuery

  let expenses = (expenseRows ?? []) as Array<{
    id: string
    user_id: string
    description: string | null
    amount: number
    date: string
    receipt_url: string | null
    status: 'Unpaid' | 'Paid'
    notes: string | null
    created_at: string
    updated_at: string
    user_display_name?: string
  }>

  if (isAdminOrOM && expenses.length > 0) {
    const userIds = [...new Set(expenses.map((e) => e.user_id))]
    const { data: expenseProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)

    const nameMap = new Map(
      (expenseProfiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? 'Unknown'])
    )

    expenses = expenses.map((e) => ({
      ...e,
      user_display_name: nameMap.get(e.user_id) ?? 'Unknown',
    }))
  }

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
    <Suspense>
      <MyWorkClient
        userId={user.id}
        initialAssignedTasks={tasksWithProject}
        initialAssignedChecklist={checklistWithProject}
        initialPersonalTasks={personalTasks ?? []}
        initialPersonalNotes={personalNotes ?? []}
        initialOfficeTasks={officeTasks ?? []}
        initialExpenses={expenses}
      />
    </Suspense>
  )
}
