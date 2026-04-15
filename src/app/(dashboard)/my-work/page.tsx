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

  // Fetch upcoming follow-up reminders assigned to the user (overdue or due within 7 days)
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  const { data: reminderRows } = await supabase
    .from('crm_follow_up_reminders')
    .select(
      'id, reminder_date, note, company_id, contact_id, is_completed, ' +
        'crm_companies!inner(id, name), crm_contacts(first_name, last_name)'
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
    crm_companies: { id: string; name: string } | null
    crm_contacts: { first_name: string; last_name: string } | null
  }

  const reminders = ((reminderRows ?? []) as unknown as RawReminder[]).map((r) => ({
    id: r.id,
    reminder_date: r.reminder_date,
    note: r.note,
    company_id: r.company_id,
    company_name: r.crm_companies?.name ?? 'Company',
    contact_name: r.crm_contacts
      ? `${r.crm_contacts.first_name} ${r.crm_contacts.last_name}`
      : null,
  }))

  // Sales activity stats (only meaningful for sales-eligible roles)
  const isSalesRole =
    userRole === 'admin' || userRole === 'office_manager' || userRole === 'salesman'
  let salesActivity: {
    callsToday: number
    callsWeek: number
    nextAppointment: {
      id: string
      company_id: string
      company_name: string
      date: string
    } | null
    overdueReminderCount: number
  } | null = null

  if (isSalesRole) {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)
    const weekStart = new Date(now)
    const day = weekStart.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diffToMonday)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const [
      { count: todayCountRaw },
      { count: weekCountRaw },
      { data: nextApptData },
      { count: overdueCountRaw },
    ] = await Promise.all([
      supabase
        .from('crm_call_log')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .gte('call_date', startOfDay.toISOString())
        .lt('call_date', endOfDay.toISOString()),
      supabase
        .from('crm_call_log')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .gte('call_date', weekStart.toISOString())
        .lt('call_date', weekEnd.toISOString()),
      supabase
        .from('crm_appointments')
        .select('id, date, company_id, crm_companies!inner(id, name)')
        .eq('status', 'scheduled')
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .gte('date', now.toISOString())
        .order('date', { ascending: true })
        .limit(1),
      supabase
        .from('crm_follow_up_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('is_completed', false)
        .lt('reminder_date', now.toISOString()),
    ])

    type ApptRow = {
      id: string
      date: string
      company_id: string
      crm_companies: { id: string; name: string } | null
    }
    const first = ((nextApptData ?? []) as unknown as ApptRow[])[0]
    salesActivity = {
      callsToday: todayCountRaw ?? 0,
      callsWeek: weekCountRaw ?? 0,
      nextAppointment: first
        ? {
            id: first.id,
            company_id: first.company_id,
            company_name: first.crm_companies?.name ?? 'Company',
            date: first.date,
          }
        : null,
      overdueReminderCount: overdueCountRaw ?? 0,
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
        initialSalesActivity={salesActivity}
      />
    </Suspense>
  )
}
