'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Task, TaskStatus, OfficeTask, OfficePriority, UserRole } from '@/types'
import { usePermissions } from '@/lib/usePermissions'
import OfficeTasksWorkspace from '@/components/my-work/OfficeTasksWorkspace'
import ExpensesWorkspace from '@/components/my-work/ExpensesWorkspace'
import OfficeDailyReportsWorkspace from '@/components/my-work/OfficeDailyReportsWorkspace'
import MyTasksCard from '@/components/my-work/MyTasksCard'
import { toggleOfficeTaskCompletion } from '@/lib/officeTaskCompletion'
import type { SalesmanExpenseRow } from '@/components/salesman-expenses/SalesmanExpenseCard'
import { ProjectChecklistItem } from '@/components/job-board/workspaces/ChecklistShared'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  ListTodoIcon,
  ClipboardCheckIcon,
  Building2Icon,
  WalletIcon,
  Maximize2Icon,
  BellIcon,
  PhoneIcon,
  FileTextIcon,
  LayoutDashboardIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AssignedTask = Task & { project_name: string }
type AssignedChecklist = ProjectChecklistItem & { project_name: string }

export interface MyWorkReminder {
  id: string
  reminder_date: string
  note: string | null
  company_id: string
  company_name: string
  contact_name: string | null
}

export interface MyWorkSalesActivity {
  callsToday: number
  callsWeek: number
  nextAppointment: {
    id: string
    company_id: string
    company_name: string
    date: string
  } | null
  overdueReminderCount: number
}

type WorkspaceType =
  | 'assigned_tasks'
  | 'assigned_checklist'
  | 'office_tasks'
  | 'expenses'
  | 'office_daily_reports'
  | null

interface Props {
  userId: string
  userRole: UserRole
  initialAssignedTasks: AssignedTask[]
  initialAssignedChecklist: AssignedChecklist[]
  initialOfficeTasks: OfficeTask[]
  initialExpenses: SalesmanExpenseRow[]
  initialReminders?: MyWorkReminder[]
  initialSalesActivity?: MyWorkSalesActivity | null
  initialMyTodayReport?: {
    id: string
    clock_in: string | null
    clock_out: string | null
  } | null
  initialTodayReportsCount?: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string | null) {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatReminderDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function isReminderOverdue(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

function isOverdue(d: string | null) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(d + 'T00:00:00') < today
}

const statusColors: Record<TaskStatus, string> = {
  new_task: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  unable_to_complete: 'bg-red-100 text-red-700',
}

const statusLabels: Record<TaskStatus, string> = {
  new_task: 'New',
  in_progress: 'In Progress',
  completed: 'Completed',
  unable_to_complete: 'Unable',
}

const priorityOrder: Record<OfficePriority, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
}

const priorityColors: Record<OfficePriority, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Normal: 'bg-blue-100 text-blue-700',
  High: 'bg-orange-100 text-orange-700',
  Urgent: 'bg-red-100 text-red-700',
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/* ================================================================== */
/*  INTERACTIVE CARD SHELL                                             */
/* ================================================================== */

function InteractiveCard({
  icon,
  title,
  onExpand,
  headerActions,
  children,
}: {
  icon: React.ReactNode
  title: string
  onExpand: () => void
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3.5 col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{title}</h3>
        {headerActions}
        <button
          onClick={onExpand}
          className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          title="Open full workspace"
        >
          <Maximize2Icon className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  )
}

/* ================================================================== */
/*  QUICK GLANCE TILE                                                  */
/* ================================================================== */

function QuickGlanceTile({
  icon,
  title,
  onClick,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-md border border-gray-200 px-[18px] py-[14px] cursor-pointer transition-all hover:shadow-sm hover:border-gray-300"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-amber-500 flex-shrink-0">{icon}</span>
        <h3 className="text-[13px] font-medium text-gray-900 flex-1 truncate">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

/* ================================================================== */
/*  WORKSPACE SHELL                                                    */
/* ================================================================== */

function MyWorkspaceShell({
  title,
  icon,
  onBack,
  actions,
  children,
}: {
  title: string
  icon: React.ReactNode
  onBack: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-amber-500">{icon}</span>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function MyWorkClient({
  userId,
  userRole,
  initialAssignedTasks,
  initialAssignedChecklist,
  initialOfficeTasks,
  initialExpenses,
  initialReminders,
  initialSalesActivity,
  initialMyTodayReport,
  initialTodayReportsCount,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canView, canEdit } = usePermissions()
  // Checklist-item completion and the "view all reports" daily-reports tile
  // were admin-only. They now follow edit-level permissions on the relevant
  // features; admin retains access via the hook's shortcut.
  const canEditChecklists = canEdit('tasks')
  const canSeeAllReports = canEdit('daily_reports')
  // Employee Expenses vs. Personal Expenses: previously admin+OM.
  const canSeeAllExpenses = canView('office')
  const canViewCrm = canView('crm')
  const canViewJobBoard = canView('job_board')
  const canViewAnySales =
    canView('crm') ||
    canView('dialer') ||
    canView('emailer') ||
    canView('leads') ||
    canView('appointments') ||
    canView('estimating') ||
    canView('job_walk')
  // Foreman gets a role-specific "Assigned Field Tasks" card on their own
  // My Work dashboard; this is role-shaped UI that does not map cleanly to
  // a feature gate, so it remains a direct role check.
  const isForeman = userRole === 'foreman'

  /* ---- Workspace state ---- */
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>(null)
  const initializedFromUrl = useRef(false)
  const prevUrlRef = useRef<string | null>(null)

  /* ---- Assigned Work state ---- */
  const [assignedTasks, setAssignedTasks] = useState(initialAssignedTasks)
  const [assignedChecklist, setAssignedChecklist] = useState(initialAssignedChecklist)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showCompletedChecklist, setShowCompletedChecklist] = useState(false)

  /* ---- Office Tasks state ---- */
  const [officeTasks, setOfficeTasks] = useState(initialOfficeTasks)
  const [showOfficeCreateModal, setShowOfficeCreateModal] = useState(false)
  const [showCompletedOffice, setShowCompletedOffice] = useState(false)

  /* ---- Expenses state ---- */
  const [showExpenseCreateModal, setShowExpenseCreateModal] = useState(false)

  /* ---- Reminders state ---- */
  const [reminders, setReminders] = useState<MyWorkReminder[]>(initialReminders ?? [])

  const toggleReminderComplete = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('crm_follow_up_reminders')
        .update({ is_completed: true })
        .eq('id', id)
      if (error) return
      setReminders((prev) => prev.filter((r) => r.id !== id))
    },
    [supabase]
  )

  /* ================================================================ */
  /*  URL STATE MANAGEMENT                                             */
  /* ================================================================ */

  const buildUrl = useCallback((workspace: WorkspaceType) => {
    if (!workspace) return '/my-work'
    const params = new URLSearchParams()
    params.set('workspace', workspace)
    return `/my-work?${params.toString()}`
  }, [])

  useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const workspace = searchParams.get('workspace') as WorkspaceType
    if (
      workspace &&
      [
        'assigned_tasks',
        'assigned_checklist',
        'office_tasks',
        'expenses',
        'office_daily_reports',
      ].includes(workspace)
    ) {
      setActiveWorkspace(workspace)
    }
  }, [searchParams])

  useEffect(() => {
    if (!initializedFromUrl.current) return
    const newUrl = buildUrl(activeWorkspace)
    if (prevUrlRef.current !== null && prevUrlRef.current !== newUrl) {
      router.push(newUrl)
    }
    prevUrlRef.current = newUrl
  }, [activeWorkspace, buildUrl, router])

  /* ================================================================ */
  /*  WORKSPACE NAVIGATION                                             */
  /* ================================================================ */

  function openWorkspace(ws: WorkspaceType) {
    setActiveWorkspace(ws)
  }

  function backToDashboard() {
    setActiveWorkspace(null)
  }

  /* ================================================================ */
  /*  ASSIGNED TASKS                                                   */
  /* ================================================================ */

  const activeTasks = assignedTasks.filter((t) => t.status !== 'completed')
  const completedTasks = assignedTasks.filter((t) => t.status === 'completed')

  async function toggleTaskStatus(task: AssignedTask) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'new_task' : 'completed'
    setAssignedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    )
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
  }

  /* ================================================================ */
  /*  ASSIGNED CHECKLIST                                               */
  /* ================================================================ */

  const activeChecklist = assignedChecklist.filter((c) => !c.is_complete)
  const completedChecklist = assignedChecklist.filter((c) => c.is_complete)

  async function toggleChecklistItem(item: AssignedChecklist) {
    if (!canEditChecklists) return
    const newVal = !item.is_complete
    setAssignedChecklist((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? { ...c, is_complete: newVal, completed_at: newVal ? new Date().toISOString() : null }
          : c
      )
    )
    await supabase
      .from('project_checklist_items')
      .update({
        is_complete: newVal,
        completed_at: newVal ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
  }

  /* ================================================================ */
  /*  OFFICE TASKS (inline card operations)                            */
  /* ================================================================ */

  const myOfficeTasks = officeTasks.filter(
    (t) => t.assigned_to === userId || t.created_by === userId
  )
  const activeOfficeTasks = myOfficeTasks
    .filter((t) => !t.is_completed)
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2
      const pb = priorityOrder[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
  const completedOfficeTasks = myOfficeTasks.filter((t) => t.is_completed)

  async function toggleOfficeTask(task: OfficeTask) {
    const newVal = !task.is_completed
    setOfficeTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_completed: newVal } : t))
    )
    // Routes through the shared utility so any linked equipment scheduled
    // service is kept in sync with the task.
    await toggleOfficeTaskCompletion(supabase, task.id, newVal, userId)
  }

  /* ================================================================ */
  /*  EXPENSES (inline card data)                                      */
  /* ================================================================ */

  const unpaidExpenses = initialExpenses.filter((e) => e.status === 'Unpaid')
  const unpaidTotal = unpaidExpenses.reduce((sum, e) => sum + e.amount, 0)
  // Show up to 8 recent unpaid on card
  const recentUnpaid = unpaidExpenses.slice(0, 8)

  /* ================================================================ */
  /*  RENDER — WORKSPACES                                              */
  /* ================================================================ */

  if (activeWorkspace === 'assigned_tasks') {
    return (
      <MyWorkspaceShell
        title="Assigned Field Tasks"
        icon={<ListTodoIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="divide-y divide-gray-50">
              {activeTasks.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  No tasks assigned to you
                </p>
              )}
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => toggleTaskStatus(task)}
                    className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                  >
                    {task.status === 'completed' && (
                      <CheckIcon className="w-3 h-3 text-amber-500" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {canViewJobBoard ? (
                        <Link
                          href={`/job-board?project=${task.project_id}`}
                          className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                        >
                          {task.project_name}
                          <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-500">{task.project_name}</span>
                      )}
                      {task.due_date && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isOverdue(task.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}
                        >
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(task.due_date)}
                          {isOverdue(task.due_date) && (
                            <AlertCircleIcon className="w-3 h-3 text-red-500" />
                          )}
                        </span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${statusColors[task.status]}`}
                      >
                        {statusLabels[task.status]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {completedTasks.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCompletedTasks ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedTasks.length})
                </button>
                {showCompletedTasks && (
                  <div className="divide-y divide-gray-50">
                    {completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 px-4 sm:px-5 py-3 opacity-60"
                      >
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                        >
                          <CheckIcon className="w-3 h-3 text-amber-500" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through truncate">
                            {task.title}
                          </p>
                          {canViewJobBoard ? (
                            <Link
                              href={`/job-board?project=${task.project_id}`}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              {task.project_name}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-500">{task.project_name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'assigned_checklist') {
    return (
      <MyWorkspaceShell
        title="Assigned Checklist Items"
        icon={<ClipboardCheckIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="divide-y divide-gray-50">
              {activeChecklist.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  No checklist items assigned to you
                </p>
              )}
              {activeChecklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => toggleChecklistItem(item)}
                    disabled={!canEditChecklists}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      canEditChecklists
                        ? 'border-gray-300 hover:border-amber-500 cursor-pointer'
                        : 'border-gray-200 cursor-default'
                    }`}
                  >
                    {item.is_complete && <CheckIcon className="w-3 h-3 text-amber-500" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {canViewJobBoard ? (
                        <Link
                          href={`/job-board?project=${item.project_id}`}
                          className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                        >
                          {item.project_name}
                          <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-500">{item.project_name}</span>
                      )}
                      {item.group_name && (
                        <span className="text-xs text-gray-400">{item.group_name}</span>
                      )}
                      {item.due_date && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isOverdue(item.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}
                        >
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(item.due_date)}
                          {isOverdue(item.due_date) && (
                            <AlertCircleIcon className="w-3 h-3 text-red-500" />
                          )}
                        </span>
                      )}
                      {!canEditChecklists && (
                        <span className="text-xs text-gray-400 italic">Read-only</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {completedChecklist.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setShowCompletedChecklist(!showCompletedChecklist)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCompletedChecklist ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedChecklist.length})
                </button>
                {showCompletedChecklist && (
                  <div className="divide-y divide-gray-50">
                    {completedChecklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 px-4 sm:px-5 py-3 opacity-60"
                      >
                        <button
                          onClick={() => toggleChecklistItem(item)}
                          disabled={!canEditChecklists}
                          className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                        >
                          <CheckIcon className="w-3 h-3 text-amber-500" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through truncate">
                            {item.name}
                          </p>
                          {canViewJobBoard ? (
                            <Link
                              href={`/job-board?project=${item.project_id}`}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              {item.project_name}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-500">{item.project_name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'office_tasks') {
    return (
      <MyWorkspaceShell
        title="Office Tasks"
        icon={<Building2Icon className="w-5 h-5" />}
        onBack={backToDashboard}
        actions={
          <button
            onClick={() => setShowOfficeCreateModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        }
      >
        <OfficeTasksWorkspace
          userId={userId}
          role={userRole}
          initialOfficeTasks={officeTasks}
          onCountChange={() => {}}
          showCreateModal={showOfficeCreateModal}
          onCloseCreateModal={() => setShowOfficeCreateModal(false)}
          hideAllToggle
        />
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'expenses') {
    const expenseTitle = canSeeAllExpenses ? 'Employee Expenses' : 'Personal Expenses'
    return (
      <MyWorkspaceShell
        title={expenseTitle}
        icon={<WalletIcon className="w-5 h-5" />}
        onBack={backToDashboard}
        actions={
          <button
            onClick={() => setShowExpenseCreateModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        }
      >
        <ExpensesWorkspace
          userId={userId}
          userRole={userRole}
          initialExpenses={initialExpenses}
          showCreateModal={showExpenseCreateModal}
          onCloseCreateModal={() => setShowExpenseCreateModal(false)}
        />
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'office_daily_reports') {
    return (
      <MyWorkspaceShell
        title="Office Daily Reports"
        icon={<FileTextIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <OfficeDailyReportsWorkspace userId={userId} userRole={userRole} />
      </MyWorkspaceShell>
    )
  }

  /* ================================================================ */
  /*  RENDER — DASHBOARD CARDS (interactive)                           */
  /* ================================================================ */

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <LayoutDashboardIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Work</h1>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">

        {/* ── Daily Playbook (left column) ── */}
        <MyTasksCard userId={userId} userRole={userRole} />

        {/* ── Assigned Office Work (right column — combined checklist items + office tasks) ── */}
        <InteractiveCard
          icon={<Building2Icon className="w-5 h-5" />}
          title="Assigned office work"
          onExpand={() => openWorkspace('office_tasks')}
          headerActions={
            <button
              onClick={() => { openWorkspace('office_tasks'); setTimeout(() => setShowOfficeCreateModal(true), 100) }}
              className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-white px-2 py-1 rounded-lg text-xs font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-3 h-3" />
              New
            </button>
          }
        >
          {/* ── Checklist items section ── */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Job board checklist items</p>
            {activeChecklist.length === 0 && completedChecklist.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No checklist items assigned</p>
            ) : (
              <>
                {activeChecklist.length > 0 && (
                  <div className="mb-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">{activeChecklist.length} active</span>
                      {activeChecklist.filter((c) => isOverdue(c.due_date)).length > 0 && (
                        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <AlertCircleIcon className="w-3 h-3" />
                          {activeChecklist.filter((c) => isOverdue(c.due_date)).length} overdue
                        </span>
                      )}
                    </div>
                    {(activeChecklist.length + completedChecklist.length) > 0 && (
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((completedChecklist.length / (activeChecklist.length + completedChecklist.length)) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-0 max-h-[200px] overflow-y-auto -mx-4 px-4">
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                    {activeChecklist.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <button
                          onClick={() => toggleChecklistItem(item)}
                          disabled={!canEditChecklists}
                          className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            canEditChecklists ? 'border-gray-300 hover:border-amber-500 cursor-pointer' : 'border-gray-200 cursor-default'
                          }`}
                        >
                          {item.is_complete && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{item.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {canViewJobBoard ? (
                              <Link href={`/job-board?project=${item.project_id}`} className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5">
                                {item.project_name}
                                <ExternalLinkIcon className="w-2.5 h-2.5" />
                              </Link>
                            ) : (
                              <span className="text-[10px] text-gray-500">{item.project_name}</span>
                            )}
                            {item.group_name && <span className="text-[10px] text-gray-400">{item.group_name}</span>}
                            {item.due_date && (
                              <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(item.due_date) ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                <CalendarIcon className="w-2.5 h-2.5" />
                                {formatDate(item.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {completedChecklist.length > 0 && (
                    <button
                      onClick={() => setShowCompletedChecklist(!showCompletedChecklist)}
                      className="w-full flex items-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showCompletedChecklist ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                      {completedChecklist.length} completed
                    </button>
                  )}
                  {showCompletedChecklist && (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden opacity-60">
                      {completedChecklist.map((item) => (
                        <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
                          <button onClick={() => toggleChecklistItem(item)} disabled={!canEditChecklists} className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center">
                            <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                          </button>
                          <p className="text-xs text-gray-500 line-through truncate flex-1">{item.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Office work section ── */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Office tasks</p>
            {activeOfficeTasks.length === 0 && completedOfficeTasks.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No office tasks</p>
            ) : (
              <>
                {activeOfficeTasks.length > 0 && (
                  <div className="mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">{activeOfficeTasks.length} active</span>
                  </div>
                )}
                <div className="space-y-0 max-h-[200px] overflow-y-auto -mx-4 px-4">
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                    {activeOfficeTasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                        <button
                          onClick={() => toggleOfficeTask(task)}
                          className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                        >
                          {task.is_completed && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{task.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {task.priority !== 'Normal' && (
                              <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                            )}
                            {task.due_date && (
                              <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(task.due_date) && !task.is_completed ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                <CalendarIcon className="w-2.5 h-2.5" />
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {completedOfficeTasks.length > 0 && (
                    <button
                      onClick={() => setShowCompletedOffice(!showCompletedOffice)}
                      className="w-full flex items-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showCompletedOffice ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                      {completedOfficeTasks.length} completed
                    </button>
                  )}
                  {showCompletedOffice && (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden opacity-60">
                      {completedOfficeTasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-2.5 px-3 py-2.5">
                          <button onClick={() => toggleOfficeTask(task)} className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center">
                            <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                          </button>
                          <p className="text-xs text-gray-500 line-through truncate flex-1">{task.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </InteractiveCard>

        {/* ── Assigned Field Tasks (foreman only) ── */}
        {isForeman && (
          <InteractiveCard
            icon={<ListTodoIcon className="w-5 h-5" />}
            title="Assigned Field Tasks"
            onExpand={() => openWorkspace('assigned_tasks')}
          >
            {activeTasks.length === 0 && completedTasks.length === 0 ? (
              <div className="text-center py-6">
                <ListTodoIcon className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">No tasks assigned to you</p>
              </div>
            ) : (
              <>
                {activeTasks.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">
                        {activeTasks.length} active
                      </span>
                      {activeTasks.filter((t) => isOverdue(t.due_date)).length > 0 && (
                        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <AlertCircleIcon className="w-3 h-3" />
                          {activeTasks.filter((t) => isOverdue(t.due_date)).length} overdue
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-0 max-h-[400px] overflow-y-auto -mx-4 px-4">
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                    {activeTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                        >
                          {task.status === 'completed' && (
                            <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{task.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {canViewJobBoard ? (
                              <Link
                                href={`/job-board?project=${task.project_id}`}
                                className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5"
                              >
                                {task.project_name}
                                <ExternalLinkIcon className="w-2.5 h-2.5" />
                              </Link>
                            ) : (
                              <span className="text-[10px] text-gray-500">{task.project_name}</span>
                            )}
                            {task.due_date && (
                              <span
                                className={`text-[10px] flex items-center gap-0.5 ${
                                  isOverdue(task.due_date) ? 'text-red-600 font-medium' : 'text-gray-400'
                                }`}
                              >
                                <CalendarIcon className="w-2.5 h-2.5" />
                                {formatDate(task.due_date)}
                              </span>
                            )}
                            <span
                              className={`text-[10px] px-1 py-0.5 rounded ${statusColors[task.status]}`}
                            >
                              {statusLabels[task.status]}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {completedTasks.length > 0 && (
                    <button
                      onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                      className="w-full flex items-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showCompletedTasks ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                      {completedTasks.length} completed
                    </button>
                  )}
                  {showCompletedTasks && (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden opacity-60">
                      {completedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-2.5 px-3 py-2.5"
                        >
                          <button
                            onClick={() => toggleTaskStatus(task)}
                            className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                          >
                            <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                          </button>
                          <p className="text-xs text-gray-500 line-through truncate flex-1">
                            {task.title}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </InteractiveCard>
        )}

        {/* ── Follow-up Reminders ── gated by crm */}
        {canViewCrm && reminders.length > 0 && (
          <InteractiveCard
            icon={<BellIcon className="w-5 h-5" />}
            title="Follow-up reminders"
            onExpand={() => router.push('/sales/crm')}
          >
            {(() => {
              const sorted = [...reminders].sort((a, b) => {
                const aOver = isReminderOverdue(a.reminder_date)
                const bOver = isReminderOverdue(b.reminder_date)
                if (aOver && !bOver) return -1
                if (!aOver && bOver) return 1
                // Both overdue: oldest first. Both upcoming: soonest first.
                return (
                  new Date(a.reminder_date).getTime() -
                  new Date(b.reminder_date).getTime()
                )
              })
              const overdueCount = sorted.filter((r) =>
                isReminderOverdue(r.reminder_date)
              ).length
              return (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">
                      {sorted.length} upcoming
                    </span>
                    {overdueCount > 0 && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <AlertCircleIcon className="w-3 h-3" />
                        {overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <div className="space-y-0 max-h-[400px] overflow-y-auto -mx-4 px-4">
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                      {sorted.map((r) => {
                        const overdue = isReminderOverdue(r.reminder_date)
                        return (
                          <div
                            key={r.id}
                            className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <button
                              onClick={() => toggleReminderComplete(r.id)}
                              className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                              aria-label="Mark complete"
                            >
                              {/* empty checkbox */}
                            </button>
                            <Link
                              href={`/sales/crm/${r.company_id}`}
                              className="flex-1 min-w-0 block"
                            >
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {r.contact_name
                                  ? `${r.contact_name} · ${r.company_name}`
                                  : r.company_name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span
                                  className={`text-[10px] flex items-center gap-0.5 ${
                                    overdue ? 'text-amber-600 font-medium' : 'text-gray-400'
                                  }`}
                                >
                                  <CalendarIcon className="w-2.5 h-2.5" />
                                  {formatReminderDateTime(r.reminder_date)}
                                </span>
                                {overdue && (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                    Overdue
                                  </span>
                                )}
                              </div>
                              {r.note && (
                                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                                  {r.note}
                                </p>
                              )}
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </InteractiveCard>
        )}

      </div>

      {/* ── Quick glance section ── */}
      <div className="px-4 mt-2">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-2.5">Quick glance</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">

          {/* Daily reports tile */}
          <QuickGlanceTile
            icon={<FileTextIcon className="w-4 h-4" />}
            title="Daily reports"
            onClick={() => openWorkspace('office_daily_reports')}
            action={
              <span className="text-xs font-medium text-amber-600 hover:text-amber-700">
                {canSeeAllReports ? 'View all' : 'Open report'}
              </span>
            }
          >
            {canSeeAllReports ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[20px] font-medium tabular-nums text-gray-900 leading-none">
                  {initialTodayReportsCount ?? 0}
                </span>
                <span className="text-xs text-gray-400">today</span>
              </div>
            ) : (
              (() => {
                const r = initialMyTodayReport
                let label = 'Not started'
                let pillClass = 'bg-gray-100 text-gray-600'
                if (r && r.clock_out) {
                  label = 'Completed'
                  pillClass = 'bg-amber-100 text-amber-700'
                } else if (r) {
                  label = 'In progress'
                  pillClass = 'bg-amber-50 text-amber-600'
                }
                return (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${pillClass}`}
                    >
                      {label}
                    </span>
                    <span className="text-xs text-gray-400">today</span>
                  </div>
                )
              })()
            )}
          </QuickGlanceTile>

          {/* Expenses tile */}
          <QuickGlanceTile
            icon={<WalletIcon className="w-4 h-4" />}
            title="Expenses"
            onClick={() => openWorkspace('expenses')}
            action={
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openWorkspace('expenses')
                  setTimeout(() => setShowExpenseCreateModal(true), 100)
                }}
                className="text-xs font-medium text-amber-600 hover:text-amber-700"
              >
                + New
              </button>
            }
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-medium tabular-nums text-gray-900 leading-none">
                {formatCurrency(unpaidTotal)}
              </span>
              <span className="text-xs text-amber-600">
                {unpaidExpenses.length} unpaid
              </span>
            </div>
          </QuickGlanceTile>

          {/* Sales activity tile — any sales feature grants access */}
          {canViewAnySales && initialSalesActivity && (
            <QuickGlanceTile
              icon={<PhoneIcon className="w-4 h-4" />}
              title="Sales activity"
              onClick={() => router.push('/sales')}
            >
              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-[20px] font-medium tabular-nums text-gray-900 leading-none">
                    {initialSalesActivity.callsToday}
                  </span>
                  <span className="text-[11px] text-gray-400">today</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[20px] font-medium tabular-nums text-gray-900 leading-none">
                    {initialSalesActivity.callsWeek}
                  </span>
                  <span className="text-[11px] text-gray-400">this week</span>
                </div>
              </div>
              <p
                className={`text-[11px] mt-1 ${
                  initialSalesActivity.overdueReminderCount > 0
                    ? 'text-amber-600 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {initialSalesActivity.overdueReminderCount} overdue follow-up
                {initialSalesActivity.overdueReminderCount === 1 ? '' : 's'}
              </p>
            </QuickGlanceTile>
          )}

        </div>
      </div>
    </div>
  )
}
