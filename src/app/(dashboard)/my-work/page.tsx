export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUserPermissions } from '@/lib/getUserPermissions'
import MyWorkClient from '@/components/my-work/MyWorkClient'
import type { UserRole } from '@/types'

export default async function MyWorkPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  // Permissions power several gates on this page: `canView('office')` expands
  // the expense scope to everyone on the team, `canEdit('daily_reports')`
  // drives the admin-style count on the daily-reports tile, and the 5 My Work
  // card gates skip their underlying queries when the card is hidden. The
  // resolved role is still surfaced via userRole for role-shaped UI.
  const permissions = await getUserPermissions(supabase, user.id)
  const userRole = (permissions.role ?? 'crew') as UserRole
  const canSeeAllExpenses = permissions.canView('office')
  const canSeeAssignedFieldTasks = permissions.canView('assigned_field_tasks')
  const canSeeAssignedOfficeWork = permissions.canView('assigned_office_work')
  const canSeeExpensesSummary = permissions.canView('expenses_summary')
  const canSeeOfficeDailyReport = permissions.canView('office_daily_reports')

  // Assigned Field Tasks card — fetch only when visible.
  const assignedTasks = canSeeAssignedFieldTasks
    ? (await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false })).data
    : null

  // Assigned Office Work card — needs both checklist items and office tasks.
  const assignedChecklistItems = canSeeAssignedOfficeWork
    ? (await supabase
        .from('project_checklist_items')
        .select('*, projects(name)')
        .eq('assigned_to', user.id)
        .order('sort_order', { ascending: true })).data
    : null

  const officeTasks = canSeeAssignedOfficeWork
    ? (await supabase
        .from('office_tasks')
        .select('*')
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .order('created_at', { ascending: false })).data
    : null

  // Expenses summary tile — skip the query entirely when hidden.
  let expenseRows: unknown[] | null = null
  if (canSeeExpensesSummary) {
    let expenseQuery = supabase
      .from('salesman_expenses')
      .select('*')
      .order('date', { ascending: false })

    if (!canSeeAllExpenses) {
      expenseQuery = expenseQuery.eq('user_id', user.id)
    }

    const { data } = await expenseQuery
    expenseRows = data
  }

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

  if (canSeeAllExpenses && expenses.length > 0) {
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

  // Fetch upcoming follow-up reminders assigned to the user (overdue or due within 7 days)
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  const { data: reminderRows } = await supabase
    .from('crm_follow_up_reminders')
    .select(
      'id, reminder_date, note, company_id, contact_id, is_completed, ' +
        'companies!inner(id, name), contacts(first_name, last_name)'
    )
    .eq('assigned_to', user.id)
    .eq('is_completed', false)
    .lte('reminder_date', sevenDaysFromNow.toISOString())
    .order('reminder_date', { ascending: true })

  type RawReminder = {
    id: string
    reminder_date: string
    note: string | null
    company_id: string
    contact_id: string | null
    is_completed: boolean
    companies: { id: string; name: string } | null
    contacts: { first_name: string; last_name: string } | null
  }

  const reminders = ((reminderRows ?? []) as unknown as RawReminder[]).map((r) => ({
    id: r.id,
    reminder_date: r.reminder_date,
    note: r.note,
    company_id: r.company_id,
    company_name: r.companies?.name ?? 'Company',
    contact_name: r.contacts
      ? `${r.contacts.first_name} ${r.contacts.last_name}`
      : null,
  }))

  // Office Daily Reports — today's snapshot for the card. Skip the queries
  // entirely when the card is hidden for this user.
  const todayDateStr = new Date().toISOString().slice(0, 10)
  let myTodayReport: {
    id: string
    clock_in: string | null
    clock_out: string | null
  } | null = null
  let todayReportsCount = 0

  if (canSeeOfficeDailyReport) {
    const { data: myReport } = await supabase
      .from('office_daily_reports')
      .select('id, clock_in, clock_out')
      .eq('user_id', user.id)
      .eq('report_date', todayDateStr)
      .maybeSingle()
    myTodayReport = myReport ?? null

    // Admin-level daily-reports count — previously admin-only; now driven by
    // edit access on daily_reports (admins continue to get it via shortcut).
    if (permissions.canEdit('daily_reports')) {
      const { count } = await supabase
        .from('office_daily_reports')
        .select('id', { count: 'exact', head: true })
        .eq('report_date', todayDateStr)
      todayReportsCount = count ?? 0
    }
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
        userRole={userRole}
        initialAssignedTasks={tasksWithProject}
        initialAssignedChecklist={checklistWithProject}
        initialOfficeTasks={officeTasks ?? []}
        initialExpenses={expenses}
        initialReminders={reminders}
        initialMyTodayReport={myTodayReport}
        initialTodayReportsCount={todayReportsCount}
      />
    </Suspense>
  )
}
