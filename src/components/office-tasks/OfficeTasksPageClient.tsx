'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { OfficeTask, OfficePriority, Profile, UserRole } from '@/types'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  Undo2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  XIcon,
  Building2Icon,
  WrenchIcon,
  PackageIcon,
  UsersIcon,
  FileTextIcon,
  ContactIcon,
  BuildingIcon,
  BarChart3Icon,
  GraduationCapIcon,
  ScaleIcon,
} from 'lucide-react'
import EmployeeManagement from '@/components/profile/EmployeeManagement'
import EquipmentPageClient from '@/components/equipment/EquipmentPageClient'
import EquipmentDetailLoader from '@/components/equipment/EquipmentDetailLoader'
import { usePermissions } from '@/lib/usePermissions'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import { toggleOfficeTaskCompletion } from '@/lib/officeTaskCompletion'
import ExecutiveTasksCard from '@/components/office-tasks/ExecutiveTasksCard'
import CheckDepositsCard from '@/components/office-tasks/CheckDepositsCard'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string | null) {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(d: string | null) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(d + 'T00:00:00') < today
}

/**
 * Compact assignee label for the row pill: "First L." for multi-part names,
 * the single token otherwise, and pass-through for "Unassigned" / "Unknown".
 */
function formatAssigneePill(name: string): string {
  if (name === 'Unassigned' || name === 'Unknown') return name
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase()
  return `${first} ${lastInitial}.`
}

/**
 * Derive the display status for a scheduled service. Matches the bands used
 * by EquipmentDetailClient so the Office card pill and the detail page pill
 * stay in sync:
 *   - 'in_progress' is a DB-driven override ("Working on it")
 *   - 'overdue'  → scheduled_date < today
 *   - 'due'      → scheduled_date == today
 *   - 'due_soon' → 1–7 days out
 *   - 'upcoming' → > 7 days out
 */
type ScheduledDisplayStatus =
  | 'in_progress'
  | 'overdue'
  | 'due'
  | 'due_soon'
  | 'upcoming'

function scheduledDisplayStatus(
  scheduledDate: string,
  dbStatus: string
): ScheduledDisplayStatus {
  if (dbStatus === 'in_progress') return 'in_progress'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sd = new Date(scheduledDate + 'T00:00:00')
  const diffDays = Math.round((sd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due'
  if (diffDays <= 7) return 'due_soon'
  return 'upcoming'
}

/** Sort order for the Equipment card preview: most-urgent first. */
const scheduledUrgencyOrder: Record<ScheduledDisplayStatus, number> = {
  overdue: 0,
  due: 1,
  due_soon: 2,
  in_progress: 3,
  upcoming: 4,
}

function formatScheduledDate(d: string) {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const priorityColors: Record<OfficePriority, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Normal: 'bg-blue-100 text-blue-700',
  High: 'bg-orange-100 text-orange-700',
  Urgent: 'bg-red-100 text-red-700',
}

type ProjectOption = { id: string; name: string }

export interface UpcomingScheduledService {
  id: string
  equipment_id: string
  description: string
  scheduled_date: string
  status: string
  /** Joined from equipment table on the server; may be null if the join fails. */
  equipment_name?: string | null
}

type OfficeTasksView = 'all' | 'mine'

interface Props {
  userId: string
  userRole: UserRole
  userDisplayName: string
  initialTasks: OfficeTask[]
  initialProfiles: Profile[]
  initialProjects: ProjectOption[]
  initialEquipment: EquipmentRow[]
  upcomingScheduledServices: UpcomingScheduledService[]
  employeeCount: number
  supplierCount: number
  productCount: number
  contactCount: number
  vendorCount: number
  sopCount: number
  initialOfficeTasksViewPreference: OfficeTasksView
}

type OfficeView =
  | { kind: 'dashboard' }
  | { kind: 'employees' }
  | { kind: 'equipment' }
  | { kind: 'equipment-detail'; equipmentId: string }

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function OfficeTasksPageClient({
  userId,
  userRole,
  userDisplayName,
  initialTasks,
  initialProfiles,
  initialProjects,
  initialEquipment,
  upcomingScheduledServices,
  employeeCount,
  supplierCount,
  productCount,
  contactCount,
  vendorCount,
  sopCount,
  initialOfficeTasksViewPreference,
}: Props) {
  const supabase = createClient()

  const [tasks, setTasks] = useState<OfficeTask[]>(initialTasks)
  const [profiles] = useState<Profile[]>(initialProfiles)
  const [projects] = useState<ProjectOption[]>(initialProjects)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [completedExpanded, setCompletedExpanded] = useState(false)
  // Tasks the user has just checked off but for which the 2s pause hasn't yet
  // elapsed. While in this set: row shows strikethrough + Undo button, no DB
  // write has fired, and the task stays in the active list.
  const [pendingCompleteIds, setPendingCompleteIds] = useState<Set<string>>(() => new Set())
  // Live setTimeout handles per pending task — kept in a ref so the unmount
  // cleanup can flush them without re-running on every state change.
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [view, setView] = useState<OfficeView>({ kind: 'dashboard' })

  // Office Tasks card view toggle ("all" vs "mine"). Seeded from the user's
  // saved preference on profiles.office_tasks_view_preference; toggle changes
  // are written back optimistically and reverted on error.
  const [officeTasksView, setOfficeTasksView] = useState<OfficeTasksView>(
    initialOfficeTasksViewPreference
  )

  // Upcoming scheduled services for the Equipment card preview. Seeded from
  // the server prop (for instant paint) and refetched on mount + whenever the
  // user returns to the dashboard view, so edits made in the embedded
  // equipment detail view are reflected without a hard page refresh.
  const [upcomingServices, setUpcomingServices] = useState<UpcomingScheduledService[]>(
    upcomingScheduledServices
  )

  const { canView } = usePermissions()
  // Employees card and the embedded EmployeeManagement modal were
  // admin+OM-only; now driven by the employee_management feature key.
  const canManageEmployees = canView('employee_management')
  // Foreman gets an Equipment-only view of the Office dashboard (Tasks,
  // Employees, Material Inventory cards are hidden). This is role-shaped
  // UI with no clean feature mapping, so it stays as a direct role check.
  const isForeman = userRole === 'foreman'

  // Build a preview list of upcoming scheduled services enriched with the
  // equipment name, sorted by urgency (overdue first), deduped so only the
  // NEXT / most-urgent service per equipment is shown, and capped at 5 for
  // the Equipment dashboard card. The full list is reachable via "View all".
  const equipmentNameById = useMemo(
    () => new Map(initialEquipment.map((e) => [e.id, e.name])),
    [initialEquipment]
  )
  const upcomingServicesPreview = useMemo(() => {
    const enriched = upcomingServices.map((s) => ({
      ...s,
      equipment_name: s.equipment_name ?? equipmentNameById.get(s.equipment_id) ?? 'Unknown',
      displayStatus: scheduledDisplayStatus(s.scheduled_date, s.status),
    }))
    // Sort by urgency bucket first, then by date ascending within each bucket.
    enriched.sort((a, b) => {
      const oa = scheduledUrgencyOrder[a.displayStatus]
      const ob = scheduledUrgencyOrder[b.displayStatus]
      if (oa !== ob) return oa - ob
      return a.scheduled_date.localeCompare(b.scheduled_date)
    })
    // Dedupe: keep only the first (most urgent) row per equipment_id.
    const seen = new Set<string>()
    return enriched.filter((s) => {
      if (seen.has(s.equipment_id)) return false
      seen.add(s.equipment_id)
      return true
    })
  }, [upcomingServices, equipmentNameById])
  const upcomingServicesTop = upcomingServicesPreview.slice(0, 5)
  const upcomingServicesHasMore = upcomingServicesPreview.length > 5

  // Refetch upcoming scheduled services from Supabase whenever the user is
  // viewing the dashboard (on mount and when returning from the embedded
  // equipment views). This keeps the Equipment card preview in sync with
  // any edits, deletes, or recurring-service rollovers made on the detail
  // page — without it the prop stays frozen at the original server snapshot.
  const refetchUpcomingServices = useCallback(async () => {
    const { data, error } = await supabase
      .from('equipment_scheduled_services')
      .select('id, equipment_id, description, scheduled_date, status, equipment:equipment_id ( name )')
      .neq('status', 'completed')
      .order('scheduled_date', { ascending: true })
      .limit(50)
    if (error || !data) return
    const rows: UpcomingScheduledService[] = data.map((row) => {
      const eq = (row as { equipment?: { name?: string } | { name?: string }[] | null }).equipment
      const equipmentName = Array.isArray(eq) ? eq[0]?.name ?? null : eq?.name ?? null
      return {
        id: row.id as string,
        equipment_id: row.equipment_id as string,
        description: row.description as string,
        scheduled_date: row.scheduled_date as string,
        status: row.status as string,
        equipment_name: equipmentName,
      }
    })
    setUpcomingServices(rows)
  }, [supabase])

  useEffect(() => {
    if (view.kind !== 'dashboard') return
    refetchUpcomingServices()
  }, [view.kind, refetchUpcomingServices])

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const getDisplayName = (id: string | null) => {
    if (!id) return 'Unassigned'
    return profileMap.get(id)?.display_name ?? 'Unknown'
  }

  // Apply the My/All toggle filter to the full task list. "mine" keeps tasks
  // assigned to the current user; "all" keeps every task.
  const visibleTasks = useMemo(() => {
    if (officeTasksView === 'mine') {
      return tasks.filter((t) => t.assigned_to === userId)
    }
    return tasks
  }, [tasks, officeTasksView, userId])

  // Sort active tasks: due date ascending (closest first); tasks without a
  // due date are pushed to the bottom and ordered by creation date (newest
  // first) so freshly added items are easy to spot.
  const activeTasks = useMemo(() => {
    const incomplete = visibleTasks.filter((t) => !t.is_completed)
    return [...incomplete].sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })
  }, [visibleTasks])

  const completedTasksList = useMemo(
    () => visibleTasks.filter((t) => t.is_completed),
    [visibleTasks]
  )

  /* ================================================================ */
  /*  CRUD                                                             */
  /* ================================================================ */

  // Commit a pending completion: optimistically flip the task's completed
  // flag (which moves it to the Completed group) and fire the cascading
  // Supabase write. Used by both the 2s timer and the unmount-flush.
  const commitComplete = useCallback(
    (taskId: string) => {
      setPendingCompleteIds((prev) => {
        if (!prev.has(taskId)) return prev
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      pendingTimersRef.current.delete(taskId)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, is_completed: true, updated_at: new Date().toISOString() } : t
        )
      )
      // Fire-and-forget: the helper handles the cascade to linked equipment
      // services and inventory checks; refetch services after so the
      // Equipment card preview stays in sync.
      toggleOfficeTaskCompletion(supabase, taskId, true, userId)
        .then(() => refetchUpcomingServices())
        .catch((err) => console.error('[commitComplete] cascade failed:', err))
    },
    [supabase, userId, refetchUpcomingServices]
  )

  // Cancel a pending completion: clear the timer, drop the row from the
  // pending set, no DB write. Row reverts to its un-checked active state.
  const cancelPendingComplete = useCallback((taskId: string) => {
    const timer = pendingTimersRef.current.get(taskId)
    if (timer) clearTimeout(timer)
    pendingTimersRef.current.delete(taskId)
    setPendingCompleteIds((prev) => {
      if (!prev.has(taskId)) return prev
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }, [])

  // Checkbox click handler. Three branches:
  //   - row is pending → treat as Undo (cancel timer, no write)
  //   - row is completed → instant un-complete (immediate DB write)
  //   - row is active → schedule a 2s pending window (no write yet)
  function handleCheckbox(task: OfficeTask) {
    if (pendingCompleteIds.has(task.id)) {
      cancelPendingComplete(task.id)
      return
    }
    if (task.is_completed) {
      // Un-complete is instant.
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, is_completed: false, updated_at: new Date().toISOString() } : t
        )
      )
      toggleOfficeTaskCompletion(supabase, task.id, false, userId)
        .then(() => refetchUpcomingServices())
        .catch((err) => console.error('[handleCheckbox] un-complete failed:', err))
      return
    }
    // Active → pending: schedule the commit, but don't write yet.
    setPendingCompleteIds((prev) => {
      const next = new Set(prev)
      next.add(task.id)
      return next
    })
    const timerId = setTimeout(() => commitComplete(task.id), 2000)
    pendingTimersRef.current.set(task.id, timerId)
  }

  // Flush any still-pending completions on unmount so a navigation away
  // doesn't drop a check-off the user had already committed to visually.
  useEffect(() => {
    const timers = pendingTimersRef.current
    return () => {
      timers.forEach((timerId, taskId) => {
        clearTimeout(timerId)
        // Fire-and-forget the cascade; we're leaving the page anyway.
        toggleOfficeTaskCompletion(supabase, taskId, true, userId).catch((err) =>
          console.error('[unmount flush] cascade failed:', err)
        )
      })
      timers.clear()
    }
  }, [supabase, userId])

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setDeleteConfirmId(null)
    await supabase.from('office_tasks').delete().eq('id', id)
  }

  async function updateField(id: string, field: string, value: string | null) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value, updated_at: new Date().toISOString() } : t))
    )
    await supabase
      .from('office_tasks')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function updateTask(id: string, data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) {
    const patch = {
      title: data.title,
      description: data.description || null,
      assigned_to: data.assigned_to || null,
      project_id: data.project_id || null,
      due_date: data.due_date || null,
      priority: data.priority,
      updated_at: new Date().toISOString(),
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    await supabase.from('office_tasks').update(patch).eq('id', id)
  }

  async function createTask(data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) {
    const newTask: OfficeTask = {
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description || null,
      assigned_to: data.assigned_to || null,
      project_id: data.project_id || null,
      is_completed: false,
      due_date: data.due_date || null,
      priority: data.priority,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks((prev) => [newTask, ...prev])
    const { data: inserted } = await supabase
      .from('office_tasks')
      .insert({
        title: data.title,
        description: data.description || null,
        assigned_to: data.assigned_to || null,
        project_id: data.project_id || null,
        due_date: data.due_date || null,
        priority: data.priority,
        created_by: userId,
      })
      .select()
      .single()
    if (inserted) {
      setTasks((prev) => prev.map((t) => (t.id === newTask.id ? (inserted as OfficeTask) : t)))
    }
  }

  // Persist the My/All toggle choice to profiles.office_tasks_view_preference.
  // Optimistic: update local state immediately so the toggle feels instant,
  // fire-and-forget the write, revert local state on error.
  async function handleViewToggle(next: OfficeTasksView) {
    if (next === officeTasksView) return
    const prev = officeTasksView
    setOfficeTasksView(next)
    const { error } = await supabase
      .from('profiles')
      .update({ office_tasks_view_preference: next })
      .eq('id', userId)
    if (error) setOfficeTasksView(prev)
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  /* ── Inline workspaces (fill full work area right of sidebar) ── */
  if (view.kind === 'employees' && canManageEmployees) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col bg-white">
        <EmployeeManagement
          hideTrigger
          open
          mode="inline"
          onBack={() => setView({ kind: 'dashboard' })}
        />
      </div>
    )
  }

  if (view.kind === 'equipment') {
    return (
      <div className="w-full h-full min-h-0 flex flex-col bg-white">
        <EquipmentPageClient
          initialEquipment={initialEquipment}
          userId={userId}
          userRole={userRole}
          onBack={() => setView({ kind: 'dashboard' })}
          onViewItem={(id) => setView({ kind: 'equipment-detail', equipmentId: id })}
        />
      </div>
    )
  }

  if (view.kind === 'equipment-detail') {
    return (
      <div className="w-full h-full min-h-0 flex flex-col bg-gray-50 overflow-y-auto">
        <EquipmentDetailLoader
          equipmentId={view.equipmentId}
          userId={userId}
          userRole={userRole}
          userDisplayName={userDisplayName}
          onBack={() => setView({ kind: 'equipment' })}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <BuildingIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Office</h1>
        </div>
      </div>

      {/* Dashboard grid — matches My Work layout */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">

        {/* ── Tasks Card (spans 2 columns) ── hidden for foreman */}
        {!isForeman && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300 flex flex-col lg:h-[560px]">
          {/* Card header */}
          <div className="flex items-center gap-2 mb-3 flex-none">
            <span className="text-amber-500">
              <Building2Icon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Tasks</h3>
          </div>

          {/* My/All toggle (left) + New Task button (right) */}
          <div className="flex items-center gap-2 mb-3 flex-none">
            <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => handleViewToggle('mine')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  officeTasksView === 'mine'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Tasks
              </button>
              <button
                onClick={() => handleViewToggle('all')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  officeTasksView === 'all'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Tasks
              </button>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              New Task
            </button>
          </div>

          {/* Flat task list */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
            {activeTasks.length === 0 && completedTasksList.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Building2Icon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-medium">
                  {officeTasksView === 'mine' ? 'No tasks assigned to you.' : 'No tasks yet.'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Click &quot;+ New Task&quot; to create one
                </p>
              </div>
            )}

            {activeTasks.length > 0 && (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getDisplayName={getDisplayName}
                    projects={projects}
                    onToggle={handleCheckbox}
                    onUndo={cancelPendingComplete}
                    pending={pendingCompleteIds.has(task.id)}
                    onUpdateField={updateField}
                    onEdit={(id) => setEditTaskId(id)}
                  />
                ))}
              </div>
            )}

            {/* Combined Completed group at the bottom (hidden when count = 0) */}
            {completedTasksList.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setCompletedExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {completedExpanded ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedTasksList.length})
                </button>
                {completedExpanded && (
                  <div className="border-t border-gray-100 p-2 space-y-2">
                    {completedTasksList.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        getDisplayName={getDisplayName}
                        projects={projects}
                        onToggle={handleCheckbox}
                        onUndo={cancelPendingComplete}
                        pending={pendingCompleteIds.has(task.id)}
                        onUpdateField={updateField}
                        onEdit={(id) => setEditTaskId(id)}
                        completed
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Equipment Card (spans 2 columns) ── gated on equipment feature */}
        {canView('equipment') && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300 flex flex-col lg:h-[560px]">
          {/* Card header */}
          <div className="flex items-center gap-2 mb-3 flex-none">
            <span className="text-amber-500">
              <WrenchIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Equipment</h3>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Upcoming scheduled services preview */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Upcoming Services
            </p>
            {upcomingServicesTop.length === 0 ? (
              <p className="text-xs text-gray-400">No upcoming services</p>
            ) : (
              <div className="space-y-1.5">
                {upcomingServicesTop.map((s) => {
                  // Pill palette mirrors EquipmentDetailClient so the card
                  // preview matches the detail page exactly.
                  const pillCls =
                    s.displayStatus === 'in_progress'
                      ? 'bg-orange-100 text-orange-700'
                      : s.displayStatus === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : s.displayStatus === 'due'
                      ? 'bg-amber-100 text-amber-700'
                      : s.displayStatus === 'due_soon'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  const pillLabel =
                    s.displayStatus === 'in_progress'
                      ? 'Working on it'
                      : s.displayStatus === 'overdue'
                      ? 'Overdue'
                      : s.displayStatus === 'due'
                      ? 'Due'
                      : s.displayStatus === 'due_soon'
                      ? 'Due soon'
                      : 'Upcoming'
                  return (
                    <button
                      key={s.id}
                      onClick={() => setView({ kind: 'equipment-detail', equipmentId: s.equipment_id })}
                      className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${pillCls}`}>
                        {pillLabel}
                      </span>
                      <span className="text-xs text-gray-900 font-medium truncate flex-1 min-w-0">
                        {s.equipment_name}: {s.description}
                      </span>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {formatScheduledDate(s.scheduled_date)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {upcomingServicesHasMore && (
              <button
                onClick={() => setView({ kind: 'equipment' })}
                className="mt-2 text-[11px] font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                View all →
              </button>
            )}
          </div>

          {/* Opens the Equipment workspace in the full work area */}
          <button
            onClick={() => setView({ kind: 'equipment' })}
            className="text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            View All Equipment →
          </button>
          </div>
        </div>
        )}

      </div>

      {/* ── Compact Navigation Sections ── */}

      {/* ── People Section ── hidden for foreman */}
      {!isForeman && (
      <div className="mt-5 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-3">People</p>
        <div className="flex flex-wrap gap-2">
          {canManageEmployees && (
          <button
            onClick={() => setView({ kind: 'employees' })}
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <UsersIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Employees</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
          )}
          {canView('office') && (
          <Link
            href="/office/contacts"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <ContactIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Contacts</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
        </div>
        </div>
      </div>
      )}

      {/* ── Resources Section ── gated per-tile by feature */}
      {(canView('vendor_management') || canView('material_management') || canView('scheduling')) && (
      <div className="mt-5 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-3">Resources</p>
        <div className="flex flex-wrap gap-2">
          {canView('vendor_management') && (
          <Link
            href="/office/vendors"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Building2Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Vendors</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
          {canView('material_management') && (
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <PackageIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Material inventory</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
          {canView('scheduling') && (
          <Link
            href="/scheduling"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <CalendarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Scheduling</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
        </div>
        </div>
      </div>
      )}

      {/* ── Admin Section ── */}
      <div className="mt-5 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-3">Admin</p>
        <div className="flex flex-wrap gap-2">
          {/* Reports tile — gated on reports feature */}
          {canView('reports') && (
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <BarChart3Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Reports</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
          {/* SOPs & Forms tile — gated on sops feature */}
          {canView('sops') && (
          <Link
            href="/sops"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <FileTextIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>SOPs &amp; forms</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
          {/* Training & Certifications tile — gated on training_certifications feature */}
          {canView('training_certifications') && (
          <Link
            href="/training-certifications"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <GraduationCapIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Training &amp; certifications</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}

          {/* Company meetings — no route today; render styled like the others
              with chevron for visual consistency, click is a no-op until a
              destination exists. */}
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <UsersIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span>Company meetings</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>

          {/* Material Balances placeholder — click swaps the label to
              "Coming soon" with a subtle pulse for 2s, then reverts. */}
          <MaterialBalancesButton />
        </div>
        </div>
      </div>

      {/* ── Executive Area ── admin-only (mapped to command_center). */}
      {canView('command_center') && (
      <div className="mt-8 pb-6">
        <div className="border-t border-gray-200/60" />
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 px-4">Executive Area</p>
          <div className="px-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <ExecutiveTasksCard userId={userId} />
            <CheckDepositsCard userId={userId} />
          </div>
        </div>
      </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <TaskModal
          profiles={profiles}
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => {
            createTask(data)
            setShowCreateModal(false)
          }}
        />
      )}

      {/* Edit modal — same component, dual mode */}
      {editTaskId && (() => {
        const task = tasks.find((t) => t.id === editTaskId)
        if (!task) return null
        return (
          <TaskModal
            task={task}
            profiles={profiles}
            projects={projects}
            onClose={() => setEditTaskId(null)}
            onSubmit={(data) => {
              updateTask(task.id, data)
              setEditTaskId(null)
            }}
            onDelete={() => {
              setEditTaskId(null)
              setDeleteConfirmId(task.id)
            }}
          />
        )
      })()}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Task</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this task? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTask(deleteConfirmId)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  MATERIAL BALANCES BUTTON                                           */
/* ================================================================== */

function MaterialBalancesButton() {
  const [showingComingSoon, setShowingComingSoon] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function handleClick() {
    if (showingComingSoon) return
    setShowingComingSoon(true)
    timerRef.current = setTimeout(() => {
      setShowingComingSoon(false)
      timerRef.current = null
    }, 2000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 bg-white border border-gray-200/80 rounded-md px-3 py-2 text-[13px] font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors${showingComingSoon ? ' animate-pulse' : ''}`}
    >
      <ScaleIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
      <span>{showingComingSoon ? 'Coming soon' : 'Material Balances'}</span>
    </button>
  )
}

/* ================================================================== */
/*  TASK ROW                                                           */
/* ================================================================== */

function TaskRow({
  task,
  getDisplayName,
  projects,
  onToggle,
  onUpdateField,
  onEdit,
  onUndo,
  pending = false,
  completed,
}: {
  task: OfficeTask
  getDisplayName: (id: string | null) => string
  projects: { id: string; name: string }[]
  onToggle: (t: OfficeTask) => void
  onUpdateField: (id: string, field: string, value: string | null) => void
  onEdit: (id: string) => void
  onUndo: (taskId: string) => void
  pending?: boolean
  completed?: boolean
}) {
  // While the row is in the 2s pending-complete window we mirror the visual
  // state of a completed row (strikethrough + dimmed) and also show the
  // checkbox as checked, so the user can see exactly what the task will look
  // like once the timer fires.
  const dimmed = completed || pending
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTitle(task.title) }, [task.title])
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function commitTitle() {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdateField(task.id, 'title', trimmed)
    } else {
      setTitle(task.title)
    }
  }

  const projectName = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null

  // Solid amber accent bar — purely decorative, matches the orange/amber
  // accent used elsewhere in the UI (e.g. the "+ New Task" button).

  return (
    <div className={`rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors group ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-stretch">
        <div className="w-[3px] flex-shrink-0 bg-amber-500" aria-hidden />
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggle(task)}
              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                task.is_completed || pending
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-300 hover:border-amber-500'
              }`}
            >
              {(task.is_completed || pending) && <CheckIcon className="w-3 h-3 text-amber-500" />}
            </button>

            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle()
                    if (e.key === 'Escape') { setTitle(task.title); setEditing(false) }
                  }}
                  className="text-base w-full bg-transparent outline-none border-b border-amber-400 text-gray-900 pb-0.5"
                />
              ) : (
                <p
                  onClick={() => !dimmed && setEditing(true)}
                  className={`text-base cursor-text truncate ${
                    dimmed ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'
                  }`}
                >
                  {task.title}
                </p>
              )}
            </div>

            <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>
              {task.priority}
            </span>

            {(() => {
              const name = getDisplayName(task.assigned_to)
              const isUnassigned = !task.assigned_to
              return (
                <span
                  className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                    isUnassigned ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {formatAssigneePill(name)}
                </span>
              )
            })()}

            {projectName && task.project_id && (
              <Link
                href={`/job-board?project=${task.project_id}`}
                className="flex-shrink-0 text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
              >
                {projectName}
                <ExternalLinkIcon className="w-3 h-3" />
              </Link>
            )}

            {task.due_date && (
              <span
                className={`flex-shrink-0 text-xs flex items-center gap-1 ${
                  isOverdue(task.due_date) && !task.is_completed ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}
              >
                <CalendarIcon className="w-3 h-3" />
                {formatDate(task.due_date)}
                {isOverdue(task.due_date) && !task.is_completed && (
                  <AlertCircleIcon className="w-3 h-3 text-red-500" />
                )}
              </span>
            )}

            {pending ? (
              // Undo affordance is persistently visible (not hover-gated) for the
              // full 2s pending window so it's easy to find. Replaces the Edit
              // button so the two don't fight for the same slot.
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onUndo(task.id) }}
                  aria-label="Undo complete"
                  title="Undo"
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-800 text-white rounded-md hover:bg-amber-600 transition-colors"
                >
                  <Undo2Icon className="w-3 h-3" />
                  Undo
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task.id) }}
                  aria-label="Edit task"
                  title="Edit task"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  TASK MODAL (create + edit)                                         */
/* ================================================================== */

function TaskModal({
  task,
  profiles,
  projects,
  onClose,
  onSubmit,
  onDelete,
}: {
  task?: OfficeTask
  profiles: Profile[]
  projects: { id: string; name: string }[]
  onClose: () => void
  onSubmit: (data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) => void
  onDelete?: () => void
}) {
  const isEdit = Boolean(task)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? '')
  const [projectId, setProjectId] = useState(task?.project_id ?? '')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [priority, setPriority] = useState<OfficePriority>(task?.priority ?? 'Normal')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      description,
      assigned_to: assignedTo,
      project_id: projectId,
      due_date: dueDate,
      priority,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Office Task' : 'New Office Task'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OfficePriority)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit && onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2Icon className="w-4 h-4" />
                Delete task
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-lg transition-colors"
              >
                {isEdit ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
