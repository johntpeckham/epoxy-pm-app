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
  Trash2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  XIcon,
  SearchIcon,
  Building2Icon,
  WrenchIcon,
  PackageIcon,
  UsersIcon,
  FileTextIcon,
  ContactIcon,
  BuildingIcon,
  BarChart3Icon,
} from 'lucide-react'
import EmployeeManagement from '@/components/profile/EmployeeManagement'
import EquipmentPageClient from '@/components/equipment/EquipmentPageClient'
import EquipmentDetailLoader from '@/components/equipment/EquipmentDetailLoader'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import { toggleOfficeTaskCompletion } from '@/lib/officeTaskCompletion'

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

function sortTasks(tasks: OfficeTask[]): OfficeTask[] {
  return [...tasks].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 2
    const pb = priorityOrder[b.priority] ?? 2
    if (pa !== pb) return pa - pb
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
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
  customerCount: number
  vendorCount: number
  sopCount: number
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
  customerCount,
  vendorCount,
  sopCount,
}: Props) {
  const supabase = createClient()

  const [tasks, setTasks] = useState<OfficeTask[]>(initialTasks)
  const [profiles] = useState<Profile[]>(initialProfiles)
  const [projects] = useState<ProjectOption[]>(initialProjects)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [collapsedCompleted, setCollapsedCompleted] = useState<Set<string>>(new Set())
  const [view, setView] = useState<OfficeView>({ kind: 'dashboard' })

  // Upcoming scheduled services for the Equipment card preview. Seeded from
  // the server prop (for instant paint) and refetched on mount + whenever the
  // user returns to the dashboard view, so edits made in the embedded
  // equipment detail view are reflected without a hard page refresh.
  const [upcomingServices, setUpcomingServices] = useState<UpcomingScheduledService[]>(
    upcomingScheduledServices
  )

  const canManageEmployees = userRole === 'admin' || userRole === 'office_manager'
  // Foreman gets an Equipment-only view of the Office dashboard (Tasks,
  // Employees, Material Inventory cards are hidden).
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

  // Filter tasks by search
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    )
  }, [tasks, searchQuery])

  // Group tasks by assigned user
  const groupedByUser = useMemo(() => {
    const groups = new Map<string, { name: string; tasks: OfficeTask[] }>()

    for (const task of filteredTasks) {
      const assigneeId = task.assigned_to ?? '__unassigned__'
      const name = task.assigned_to ? getDisplayName(task.assigned_to) : 'Unassigned'

      if (!groups.has(assigneeId)) {
        groups.set(assigneeId, { name, tasks: [] })
      }
      groups.get(assigneeId)!.tasks.push(task)
    }

    // Sort groups alphabetically, Unassigned last
    return Array.from(groups.entries())
      .sort(([aId, a], [bId, b]) => {
        if (aId === '__unassigned__') return 1
        if (bId === '__unassigned__') return -1
        return a.name.localeCompare(b.name)
      })
      .map(([id, g]) => ({
        userId: id,
        name: g.name,
        incomplete: sortTasks(g.tasks.filter((t) => !t.is_completed)),
        completed: g.tasks.filter((t) => t.is_completed),
      }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, profileMap])

  /* ================================================================ */
  /*  CRUD                                                             */
  /* ================================================================ */

  async function toggleComplete(task: OfficeTask) {
    const newVal = !task.is_completed
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_completed: newVal, updated_at: new Date().toISOString() } : t))
    )
    // Routes through the shared utility so any linked equipment scheduled
    // service is kept in sync with the task (reverse of the equipment
    // page's forward cascade).
    await toggleOfficeTaskCompletion(supabase, task.id, newVal, userId)
    // If the toggle completed a service linked via task_id, a new
    // scheduled-service (and new linked task) may have been generated for
    // the next recurrence — refetch so the Equipment preview stays fresh.
    refetchUpcomingServices()
  }

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

  function toggleCollapsedCompleted(userId: string) {
    setCollapsedCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  const totalIncomplete = tasks.filter((t) => !t.is_completed).length

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
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
          {/* Card header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500">
              <Building2Icon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Tasks</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
              {totalIncomplete} active
            </span>
          </div>

          {/* Search + New Task actions */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
              />
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              New Task
            </button>
          </div>

          {/* Task list content */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto -mx-4 px-4">
            {groupedByUser.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Building2Icon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-medium">
                  {searchQuery ? 'No tasks match your search' : 'No office tasks yet'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {searchQuery ? 'Try a different keyword' : 'Click "+ New Task" to create one'}
                </p>
              </div>
            )}

            {groupedByUser.map((group) => (
              <div key={group.userId} className="rounded-lg border border-gray-100 overflow-hidden">
                {/* User section header */}
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-amber-700">
                        {group.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <h2 className="text-xs font-semibold text-gray-900 flex-1">{group.name}</h2>
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                      {group.incomplete.length} active
                    </span>
                  </div>
                </div>

                {/* Incomplete tasks */}
                <div className="divide-y divide-gray-50">
                  {group.incomplete.length === 0 && group.completed.length === 0 && (
                    <p className="px-5 py-6 text-sm text-gray-400 text-center">
                      No tasks
                    </p>
                  )}
                  {group.incomplete.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      getDisplayName={getDisplayName}
                      profiles={profiles}
                      projects={projects}
                      onToggle={toggleComplete}
                      onUpdateField={updateField}
                      onDelete={(id) => setDeleteConfirmId(id)}
                    />
                  ))}
                </div>

                {/* Completed section */}
                {group.completed.length > 0 && (
                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => toggleCollapsedCompleted(group.userId)}
                      className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {!collapsedCompleted.has(group.userId) ? (
                        <ChevronRightIcon className="w-4 h-4" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                      Completed ({group.completed.length})
                    </button>
                    {collapsedCompleted.has(group.userId) && (
                      <div className="divide-y divide-gray-50">
                        {group.completed.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            getDisplayName={getDisplayName}
                            profiles={profiles}
                            projects={projects}
                            onToggle={toggleComplete}
                            onUpdateField={updateField}
                            onDelete={(id) => setDeleteConfirmId(id)}
                            completed
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── Equipment Card (spans 2 columns) ── visible to all roles */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
          {/* Card header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500">
              <WrenchIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Equipment</h3>
          </div>

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

      {/* ── Compact Navigation Sections ── */}

      {/* ── People Section ── hidden for foreman */}
      {!isForeman && (
      <div className="mt-5">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-2.5">People</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {canManageEmployees && (
          <button
            onClick={() => setView({ kind: 'employees' })}
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <UsersIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1 text-left">Employees</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
          )}
          <Link
            href="/office/contacts"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <ContactIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Contacts</span>
            <span className="text-[12px] text-gray-400 mr-2">{contactCount}</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          <Link
            href="/office/customers"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <UsersIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Customers</span>
            <span className="text-[12px] text-gray-400 mr-2">{customerCount}</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
        </div>
      </div>
      )}

      {/* ── Resources Section ── hidden for foreman */}
      {!isForeman && (
      <div className="mt-5">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-2.5">Resources</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Link
            href="/office/vendors"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <Building2Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Vendors</span>
            <span className="text-[12px] text-gray-400 mr-2">{vendorCount}</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          <Link
            href="/inventory"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <PackageIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Material inventory</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          <Link
            href="/scheduling"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <CalendarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Scheduling</span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
        </div>
      </div>
      )}

      {/* ── Admin Section ── */}
      <div className="mt-5">
        <p className="text-[13px] font-medium text-gray-500 tracking-wide mb-2.5">Admin</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Reports tile — admin/office_manager only */}
          {canManageEmployees && (
          <Link
            href="/reports"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <BarChart3Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <div className="ml-2.5 flex-1">
              <span className="text-[13px] font-medium text-gray-900">Reports</span>
              <p className="text-[11px] text-gray-400 mt-0.5">Timesheets, sales, expenses</p>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}
          {/* SOPs & Forms tile — hidden for foreman */}
          {!isForeman && (
          <Link
            href="/sops"
            className="flex items-center bg-white border border-gray-200/80 rounded-md px-4 py-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <FileTextIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">SOPs &amp; forms</span>
            {sopCount > 0 && <span className="text-[12px] text-gray-400 mr-2">{sopCount}</span>}
            <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
          )}

          {/* Company Meetings tile with sub-items */}
          <div className="bg-white border border-gray-200/80 rounded-md overflow-hidden">
            <div className="flex items-center px-4 py-3">
              <UsersIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-gray-900 ml-2.5 flex-1">Company meetings</span>
            </div>
            <div className="border-t border-gray-100">
              <div className="flex items-center justify-between px-4 py-2 pl-10">
                <span className="text-[12px] text-gray-600">Weekly meeting</span>
                <span className="text-[12px] text-gray-400">Coming soon</span>
              </div>
              <div className="border-t border-gray-100 flex items-center justify-between px-4 py-2 pl-10">
                <span className="text-[12px] text-gray-600">Sales meeting</span>
                <span className="text-[12px] text-gray-400">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          userId={userId}
          profiles={profiles}
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => {
            createTask(data)
            setShowCreateModal(false)
          }}
        />
      )}

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
/*  TASK ROW                                                           */
/* ================================================================== */

function TaskRow({
  task,
  getDisplayName,
  profiles,
  projects,
  onToggle,
  onUpdateField,
  onDelete,
  completed,
}: {
  task: OfficeTask
  getDisplayName: (id: string | null) => string
  profiles: Profile[]
  projects: { id: string; name: string }[]
  onToggle: (t: OfficeTask) => void
  onUpdateField: (id: string, field: string, value: string | null) => void
  onDelete: (id: string) => void
  completed?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [expanded, setExpanded] = useState(false)
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

  return (
    <div className={`px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors group ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task)}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.is_completed
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-300 hover:border-amber-500'
          }`}
        >
          {task.is_completed && <CheckIcon className="w-3 h-3 text-amber-500" />}
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
              className="text-sm w-full bg-transparent outline-none border-b border-amber-400 text-gray-900 pb-0.5"
            />
          ) : (
            <p
              onClick={() => !completed && setEditing(true)}
              className={`text-sm cursor-text truncate ${
                completed ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'
              }`}
            >
              {task.title}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>
              {task.priority}
            </span>

            <span className="text-xs text-gray-500">{getDisplayName(task.assigned_to)}</span>

            {projectName && task.project_id && (
              <Link
                href={`/job-board?project=${task.project_id}`}
                className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
              >
                {projectName}
                <ExternalLinkIcon className="w-3 h-3" />
              </Link>
            )}

            {task.due_date && (
              <span
                className={`text-xs flex items-center gap-1 ${
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

            {task.description && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>
            )}
          </div>

          {expanded && task.description && (
            <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">
              {task.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <select
            value={task.assigned_to ?? ''}
            onChange={(e) => onUpdateField(task.id, 'assigned_to', e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white max-w-[100px]"
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || 'Unknown'}
              </option>
            ))}
          </select>

          <select
            value={task.priority}
            onChange={(e) => onUpdateField(task.id, 'priority', e.target.value)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white w-[75px]"
          >
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>

          <input
            type="date"
            value={task.due_date || ''}
            onChange={(e) => onUpdateField(task.id, 'due_date', e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white w-[110px]"
          />

          <button
            onClick={() => onDelete(task.id)}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  CREATE MODAL                                                       */
/* ================================================================== */

function CreateTaskModal({
  userId,
  profiles,
  projects,
  onClose,
  onCreate,
}: {
  userId: string
  profiles: Profile[]
  projects: { id: string; name: string }[]
  onClose: () => void
  onCreate: (data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<OfficePriority>('Normal')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onCreate({
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
          <h3 className="text-base font-semibold text-gray-900">New Office Task</h3>
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

          <div className="flex justify-end gap-2 pt-2">
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
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
