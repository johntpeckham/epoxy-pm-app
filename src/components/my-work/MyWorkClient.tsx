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
  is_completed: boolean
}

export interface MyWorkEstimatingReminder {
  id: string
  title: string
  description: string | null
  due_date: string
  status: string
  completed_at: string | null
  project_id: string
  project_name: string
  company_id: string
  company_name: string
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
  initialEstimatingReminders?: MyWorkEstimatingReminder[]
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
  className,
  children,
}: {
  icon: React.ReactNode
  title: string
  onExpand: () => void
  headerActions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-3.5 col-span-2 transition-all hover:shadow-sm hover:border-gray-300 flex flex-col${className ? ` ${className}` : ''}`}>
      <div className="flex items-center gap-2 mb-2 flex-none">
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
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
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
  initialEstimatingReminders,
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
  // Per-card My Work gates. Individual cards can be hidden per user via the
  // permission editor; defaults seeded to match role expectations.
  const showDailyPlaybook = canView('daily_playbook')
  const showAssignedOfficeWork = canView('assigned_office_work')
  const showOfficeDailyReport = canView('office_daily_reports')
  const showAssignedFieldTasks = canView('assigned_field_tasks')
  const showExpensesSummary = canView('expenses_summary')

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

  /* ---- Unified Assigned Work tab toggle (Active / Completed) ---- */
  const [assignedWorkTab, setAssignedWorkTab] = useState<'active' | 'completed'>('active')

  /* ---- Unified Assigned Work pending-complete window (shared 3s delay
         before the underlying source actions fire; the user can uncheck
         inside the window to cancel). A single timer drains the whole
         pending set together so rapid completions don't cause the list
         to jump as items disappear staggered. Keys are `${source}-${id}`
         so the three sources can't collide. The runComplete callback for
         each pending key is held in a ref so the shared timer can fire
         them all on expiration. ---- */
  const [pendingCompleteIds, setPendingCompleteIds] = useState<Set<string>>(new Set())
  const pendingRunsRef = useRef<Map<string, () => void>>(new Map())
  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const sharedTimer = sharedTimerRef
    const pendingRuns = pendingRunsRef.current
    return () => {
      if (sharedTimer.current) {
        clearTimeout(sharedTimer.current)
        sharedTimer.current = null
      }
      pendingRuns.clear()
    }
  }, [])
  const commitAllPending = useCallback(() => {
    const runs = Array.from(pendingRunsRef.current.values())
    pendingRunsRef.current.clear()
    sharedTimerRef.current = null
    if (runs.length === 0) return
    setPendingCompleteIds(new Set())
    for (const run of runs) {
      try {
        run()
      } catch (err) {
        console.error('[commitAllPending] source action failed:', err)
      }
    }
  }, [])
  const schedulePendingComplete = useCallback(
    (key: string, runComplete: () => void) => {
      // Add (or overwrite) the runComplete for this key, then reset the
      // shared timer so a fresh 3s window covers all currently-pending items.
      pendingRunsRef.current.set(key, runComplete)
      setPendingCompleteIds((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
      sharedTimerRef.current = setTimeout(() => commitAllPending(), 3000)
    },
    [commitAllPending]
  )
  // Remove a single pending completion. The shared timer is NOT reset —
  // remaining pending items disappear at the originally-scheduled time.
  // If the set becomes empty, clear the timer.
  const cancelPendingComplete = useCallback((key: string) => {
    pendingRunsRef.current.delete(key)
    setPendingCompleteIds((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    if (pendingRunsRef.current.size === 0 && sharedTimerRef.current) {
      clearTimeout(sharedTimerRef.current)
      sharedTimerRef.current = null
    }
  }, [])

  /* ---- Expenses state ---- */
  const [showExpenseCreateModal, setShowExpenseCreateModal] = useState(false)

  /* ---- Reminders state ---- */
  const [reminders, setReminders] = useState<MyWorkReminder[]>(initialReminders ?? [])
  const [estimatingReminders, setEstimatingReminders] = useState<MyWorkEstimatingReminder[]>(
    initialEstimatingReminders ?? []
  )

  // Toggle local state optimistically so the row moves to/from the Completed
  // section. On DB error, revert.
  const toggleReminderComplete = useCallback(
    async (id: string, target: boolean) => {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_completed: target } : r))
      )
      const { error } = await supabase
        .from('crm_follow_up_reminders')
        .update({ is_completed: target })
        .eq('id', id)
      if (error) {
        console.error('[CRM REMINDER COMPLETE ERROR]', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        })
        setReminders((prev) =>
          prev.map((r) => (r.id === id ? { ...r, is_completed: !target } : r))
        )
      }
    },
    [supabase]
  )

  const completeEstimatingReminder = useCallback(
    async (id: string, target: 'pending' | 'completed') => {
      const nowIso = new Date().toISOString()
      const completedAt = target === 'completed' ? nowIso : null
      setEstimatingReminders((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: target, completed_at: completedAt } : r
        )
      )
      const { error } = await supabase
        .from('estimating_reminders')
        .update({ status: target, completed_at: completedAt })
        .eq('id', id)
      if (error) {
        console.error('[ESTIMATING REMINDER COMPLETE ERROR]', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        })
        const reverted = target === 'completed' ? 'pending' : 'completed'
        setEstimatingReminders((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: reverted, completed_at: reverted === 'completed' ? nowIso : null }
              : r
          )
        )
      }
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

  /* ---- Unified Assigned Work checkbox handlers (route through the 2s
         pending window before invoking the existing source action). ---- */
  function handleOfficeTaskCheckbox(task: OfficeTask) {
    const key = `ot-${task.id}`
    if (pendingCompleteIds.has(key)) cancelPendingComplete(key)
    else schedulePendingComplete(key, () => { void toggleOfficeTask(task) })
  }
  function handleChecklistCheckbox(item: AssignedChecklist) {
    if (!canEditChecklists) return
    const key = `cl-${item.id}`
    if (pendingCompleteIds.has(key)) cancelPendingComplete(key)
    else schedulePendingComplete(key, () => { void toggleChecklistItem(item) })
  }
  function handleFieldTaskCheckbox(task: AssignedTask) {
    const key = `ft-${task.id}`
    if (pendingCompleteIds.has(key)) cancelPendingComplete(key)
    else schedulePendingComplete(key, () => { void toggleTaskStatus(task) })
  }
  function handleReminderCheckbox(id: string) {
    const key = `rem-${id}`
    if (pendingCompleteIds.has(key)) cancelPendingComplete(key)
    else schedulePendingComplete(key, () => { void toggleReminderComplete(id, true) })
  }
  function handleEstimatingReminderCheckbox(id: string) {
    const key = `est-${id}`
    if (pendingCompleteIds.has(key)) cancelPendingComplete(key)
    else schedulePendingComplete(key, () => { void completeEstimatingReminder(id, 'completed') })
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

  const allCardsHidden =
    !showDailyPlaybook &&
    !showAssignedOfficeWork &&
    !showOfficeDailyReport &&
    !showAssignedFieldTasks &&
    !showExpensesSummary

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <LayoutDashboardIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Work</h1>
        </div>
      </div>
      {allCardsHidden && (
        <p className="text-sm text-gray-400 text-center py-16">
          Nothing assigned to you right now.
        </p>
      )}
      {!allCardsHidden && (
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">

        {/* ── Daily Playbook (left column) ── */}
        {showDailyPlaybook && <MyTasksCard userId={userId} userRole={userRole} />}

        {/* ── Assigned Work (combined office tasks + checklist items + field tasks) ── */}
        {(showAssignedOfficeWork || showAssignedFieldTasks) && (
        <InteractiveCard
          icon={<Building2Icon className="w-5 h-5" />}
          title="Assigned Work"
          onExpand={() => openWorkspace('office_tasks')}
          className="md:h-[560px]"
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
          {(() => {
            const showReminders = canViewCrm
            const visibleReminders = showReminders ? reminders : []
            const activeReminders = visibleReminders.filter((r) => !r.is_completed)
            const completedReminders = visibleReminders.filter((r) => r.is_completed)
            const activeEstimatingReminders = estimatingReminders.filter(
              (r) => r.status === 'pending'
            )
            const completedEstimatingReminders = estimatingReminders.filter(
              (r) => r.status === 'completed'
            )
            const totalActive =
              activeOfficeTasks.length +
              activeChecklist.length +
              activeTasks.length +
              activeReminders.length +
              activeEstimatingReminders.length
            const totalCompleted =
              completedOfficeTasks.length +
              completedChecklist.length +
              completedTasks.length +
              completedReminders.length +
              completedEstimatingReminders.length
            const overdueCount =
              activeOfficeTasks.filter((t) => isOverdue(t.due_date) && !t.is_completed).length +
              activeChecklist.filter((c) => isOverdue(c.due_date)).length +
              activeTasks.filter((t) => isOverdue(t.due_date)).length +
              activeReminders.filter((r) => isReminderOverdue(r.reminder_date)).length +
              activeEstimatingReminders.filter((r) => Date.parse(r.due_date) <= Date.now()).length

            if (totalActive === 0 && totalCompleted === 0) {
              return <p className="text-xs text-gray-400 py-2">No work assigned</p>
            }

            return (
              <>
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-gray-200 -mx-3.5 px-3.5">
                  <div className="flex items-center gap-4">
                    {(['active', 'completed'] as const).map((key) => {
                      const isActive = assignedWorkTab === key
                      return (
                        <button
                          key={key}
                          onClick={() => setAssignedWorkTab(key)}
                          className={`-mb-px py-2 text-sm whitespace-nowrap transition-colors ${
                            isActive
                              ? 'text-amber-500 border-b-[1.5px] border-amber-500 font-medium'
                              : 'text-gray-400 hover:text-gray-600 border-b-[1.5px] border-transparent'
                          }`}
                        >
                          {key === 'active' ? 'Active' : 'Completed'}
                        </button>
                      )
                    })}
                  </div>
                  {assignedWorkTab === 'active' && overdueCount > 0 && (
                    <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircleIcon className="w-3 h-3" />
                      {overdueCount} overdue
                    </span>
                  )}
                </div>
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
                  {assignedWorkTab === 'active' && (
                  <>
                  {totalActive === 0 && (
                    <p className="text-xs text-gray-400 py-2">No active work</p>
                  )}
                  {(() => {
                    type CombinedItem =
                      | { kind: 'office'; date: number; task: typeof activeOfficeTasks[number] }
                      | { kind: 'reminder'; date: number; reminder: typeof activeReminders[number] }
                      | { kind: 'estimating'; date: number; reminder: typeof activeEstimatingReminders[number] }
                    const combined: CombinedItem[] = [
                      ...activeOfficeTasks.map<CombinedItem>((task) => ({
                        kind: 'office',
                        date: task.due_date
                          ? new Date(task.due_date).getTime()
                          : new Date(task.created_at ?? 0).getTime() || Number.POSITIVE_INFINITY,
                        task,
                      })),
                      ...activeReminders.map<CombinedItem>((r) => ({
                        kind: 'reminder',
                        date: new Date(r.reminder_date).getTime(),
                        reminder: r,
                      })),
                      ...activeEstimatingReminders.map<CombinedItem>((r) => ({
                        kind: 'estimating',
                        date: new Date(r.due_date).getTime(),
                        reminder: r,
                      })),
                    ].sort((a, b) => a.date - b.date)
                    return combined.map((it) => {
                      if (it.kind === 'office') {
                        const task = it.task
                        const key = `ot-${task.id}`
                        const isPending = pendingCompleteIds.has(key)
                        return (
                          <div key={key} className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition duration-200 group${isPending ? ' opacity-60' : ''}`}>
                            <div className="flex items-stretch">
                              <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                              <div className="flex-1 min-w-0 px-4 py-3">
                                <div className="flex items-start gap-2.5">
                                  <button
                                    onClick={() => handleOfficeTaskCheckbox(task)}
                                    className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                                  >
                                    {(task.is_completed || isPending) && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-medium text-gray-900 truncate${isPending ? ' line-through' : ''}`}>{task.title}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700">Office Tasks</span>
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
                              </div>
                            </div>
                          </div>
                        )
                      }
                      if (it.kind === 'reminder') {
                        const r = it.reminder
                        const overdue = isReminderOverdue(r.reminder_date)
                        const key = `rem-${r.id}`
                        const isPending = pendingCompleteIds.has(key)
                        return (
                          <div
                            key={key}
                            className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition duration-200 group cursor-pointer${isPending ? ' opacity-60' : ''}`}
                            onClick={() => router.push(`/sales/crm/${r.company_id}`)}
                          >
                            <div className="flex items-stretch">
                              <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                              <div className="flex-1 min-w-0 px-4 py-3">
                                <div className="flex items-start gap-2.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleReminderCheckbox(r.id)
                                    }}
                                    className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                                    aria-label="Mark complete"
                                  >
                                    {isPending && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-medium text-gray-900 truncate${isPending ? ' line-through' : ''}`}>
                                      {r.contact_name
                                        ? `${r.contact_name} · ${r.company_name}`
                                        : r.company_name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700">CRM Reminder</span>
                                      <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
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
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      const r = it.reminder
                      const overdue = Date.parse(r.due_date) <= Date.now()
                      const key = `est-${r.id}`
                      const isPending = pendingCompleteIds.has(key)
                      return (
                        <div
                          key={key}
                          className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition duration-200 group cursor-pointer${isPending ? ' opacity-60' : ''}`}
                          onClick={() =>
                            router.push(
                              `/estimating?customer=${r.company_id}&project=${r.project_id}`
                            )
                          }
                        >
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleEstimatingReminderCheckbox(r.id)
                                  }}
                                  className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                                  aria-label="Mark complete"
                                >
                                  {isPending && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium text-gray-900 truncate${isPending ? ' line-through' : ''}`}>
                                    {r.title}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">Estimating Reminder</span>
                                    <span className="text-[10px] text-gray-500 truncate">
                                      {r.project_name} · {r.company_name}
                                    </span>
                                    <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                      <CalendarIcon className="w-2.5 h-2.5" />
                                      {formatReminderDateTime(r.due_date)}
                                    </span>
                                    {overdue && (
                                      <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                                        Overdue
                                      </span>
                                    )}
                                  </div>
                                  {r.description && (
                                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                                      {r.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                  {activeChecklist.map((item) => {
                    const key = `cl-${item.id}`
                    const isPending = pendingCompleteIds.has(key)
                    return (
                    <div key={key} className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition duration-200 group${isPending ? ' opacity-60' : ''}`}>
                      <div className="flex items-stretch">
                        <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                        <div className="flex-1 min-w-0 px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => handleChecklistCheckbox(item)}
                              disabled={!canEditChecklists}
                              className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                canEditChecklists ? 'border-gray-300 hover:border-amber-500 cursor-pointer' : 'border-gray-200 cursor-default'
                              }`}
                            >
                              {(item.is_complete || isPending) && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium text-gray-900 truncate${isPending ? ' line-through' : ''}`}>{item.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700">Job Board Checklist</span>
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
                        </div>
                      </div>
                    </div>
                    )
                  })}
                  {activeTasks.map((task) => {
                    const key = `ft-${task.id}`
                    const isPending = pendingCompleteIds.has(key)
                    return (
                    <div key={key} className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition duration-200 group${isPending ? ' opacity-60' : ''}`}>
                      <div className="flex items-stretch">
                        <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                        <div className="flex-1 min-w-0 px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => handleFieldTaskCheckbox(task)}
                              className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                            >
                              {(task.status === 'completed' || isPending) && (
                                <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium text-gray-900 truncate${isPending ? ' line-through' : ''}`}>{task.title}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">Field Tasks</span>
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
                                <span className={`text-[10px] px-1 py-0.5 rounded ${statusColors[task.status]}`}>
                                  {statusLabels[task.status]}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                  </>
                  )}
                  {assignedWorkTab === 'completed' && (
                    <div className="space-y-2 opacity-60">
                      {totalCompleted === 0 && (
                        <p className="text-xs text-gray-400 py-2 opacity-100">No completed work yet</p>
                      )}
                      {completedOfficeTasks.map((task) => (
                        <div key={`ot-c-${task.id}`} className="rounded-lg overflow-hidden bg-gray-50 transition-colors">
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button onClick={() => toggleOfficeTask(task)} className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center">
                                  <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                                </button>
                                <p className="text-xs text-gray-500 line-through truncate flex-1">{task.title}</p>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">Office Tasks</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {completedChecklist.map((item) => (
                        <div key={`cl-c-${item.id}`} className="rounded-lg overflow-hidden bg-gray-50 transition-colors">
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button onClick={() => toggleChecklistItem(item)} disabled={!canEditChecklists} className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center">
                                  <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                                </button>
                                <p className="text-xs text-gray-500 line-through truncate flex-1">{item.name}</p>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">Job Board Checklist</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {completedTasks.map((task) => (
                        <div key={`ft-c-${task.id}`} className="rounded-lg overflow-hidden bg-gray-50 transition-colors">
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button onClick={() => toggleTaskStatus(task)} className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center">
                                  <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                                </button>
                                <p className="text-xs text-gray-500 line-through truncate flex-1">{task.title}</p>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0">Field Tasks</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {completedReminders.map((r) => (
                        <div
                          key={`rem-c-${r.id}`}
                          className="rounded-lg overflow-hidden bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/sales/crm/${r.company_id}`)}
                        >
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void toggleReminderComplete(r.id, false)
                                  }}
                                  className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                                  aria-label="Mark incomplete"
                                >
                                  <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                                </button>
                                <p className="text-xs text-gray-500 line-through truncate flex-1">
                                  {r.contact_name
                                    ? `${r.contact_name} · ${r.company_name}`
                                    : r.company_name}
                                </p>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">CRM Reminder</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {completedEstimatingReminders.map((r) => (
                        <div
                          key={`est-c-${r.id}`}
                          className="rounded-lg overflow-hidden bg-gray-50 transition-colors cursor-pointer"
                          onClick={() =>
                            router.push(
                              `/estimating?customer=${r.company_id}&project=${r.project_id}`
                            )
                          }
                        >
                          <div className="flex items-stretch">
                            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: 'rgba(239, 159, 39, 0.55)' }} aria-hidden />
                            <div className="flex-1 min-w-0 px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void completeEstimatingReminder(r.id, 'pending')
                                  }}
                                  className="mt-0.5 w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                                  aria-label="Mark incomplete"
                                >
                                  <CheckIcon className="w-2.5 h-2.5 text-amber-500" />
                                </button>
                                <p className="text-xs text-gray-500 line-through truncate flex-1">
                                  {r.title}
                                </p>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0">Estimating Reminder</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </InteractiveCard>
        )}

      </div>
      )}

      {/* ── Quick glance section ── */}
      {!allCardsHidden && (showOfficeDailyReport || showExpensesSummary) && (
      <div className="px-4 mt-2">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-2.5">Quick glance</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

          {/* Office Daily Report tile */}
          {showOfficeDailyReport && (
          <QuickGlanceTile
            icon={<FileTextIcon className="w-4 h-4" />}
            title="Office Daily Report"
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
          )}

          {/* Expenses tile */}
          {showExpensesSummary && (
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
          )}

        </div>
      </div>
      )}
    </div>
  )
}
