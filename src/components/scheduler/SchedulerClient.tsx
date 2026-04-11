'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmployeeProfile, Project } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useTheme } from '@/components/theme/ThemeProvider'
import SchedulePreviewModal from './SchedulePreviewModal'
import {
  CalendarRangeIcon,
  MonitorIcon,
  AlertTriangleIcon,
  XIcon,
  CheckIcon,
  Loader2Icon,
  DownloadIcon,
  Maximize2Icon,
  Minimize2Icon,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'

// ─── Types ────────────────────────────────────────────────────────────────
type DayFlags = [boolean, boolean, boolean, boolean, boolean, boolean, boolean]

/**
 * A single (employee, job, week) assignment row stored in the
 * scheduler_assignments table. Day flags are Mon..Sun and the assignment
 * is scoped to a specific week identified by week_start (Monday ISO).
 */
interface Assignment {
  id: string
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  week_start: string
  days: DayFlags
}

interface SchedulerAssignmentRow {
  id: string
  job_id: string
  employee_id: string
  week_start: string
  day_mon: boolean
  day_tue: boolean
  day_wed: boolean
  day_thu: boolean
  day_fri: boolean
  day_sat: boolean
  day_sun: boolean
}

interface Props {
  userId: string
  employees: EmployeeProfile[]
  projects: Project[]
  thisWeekISO: string
  nextWeekISO: string
  followingWeekISO: string
  initialAssignments: SchedulerAssignmentRow[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function rangeLabel(start: Date): string {
  const end = addDays(start, 6)
  return `${formatShort(start)} – ${formatShort(end)}`
}

function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_FULL_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// ─── Deterministic job color palette ─────────────────────────────────────
// Each palette entry has a light-mode and a dark-mode hex. The dark tones
// are deliberately desaturated so they blend into the dark UI instead of
// looking neon, while still remaining distinguishable from each other.
interface JobColorPair {
  light: string
  dark: string
}

const JOB_COLOR_PALETTE: JobColorPair[] = [
  { light: '#d97706', dark: '#8a5a18' }, // amber
  { light: '#4a6fa5', dark: '#3e5c85' }, // slate blue
  { light: '#7c6b9e', dark: '#5e527a' }, // muted purple
  { light: '#3f8a7e', dark: '#336b62' }, // muted teal
  { light: '#6b7c4a', dark: '#556038' }, // muted olive
  { light: '#b05a4a', dark: '#8a4938' }, // muted coral
  { light: '#4682b4', dark: '#3a6a92' }, // steel blue
  { light: '#9c7c4a', dark: '#7a6138' }, // muted bronze
]

function colorForProjectId(id: string, isDark: boolean): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  const entry = JOB_COLOR_PALETTE[Math.abs(hash) % JOB_COLOR_PALETTE.length]
  return isDark ? entry.dark : entry.light
}

interface JobBar {
  project: Project
  startDay: number // 0..6 relative to week's Monday
  endDay: number // 0..6 inclusive
}

function computeBarsForWeek(weekStart: Date, projects: Project[]): JobBar[] {
  const weekEnd = addDays(weekStart, 6)
  const bars: JobBar[] = []
  for (const project of projects) {
    if (!project.start_date || !project.end_date) continue
    const start = parseISODateLocal(project.start_date)
    const end = parseISODateLocal(project.end_date)
    if (end < weekStart || start > weekEnd) continue
    const clampedStart = start < weekStart ? weekStart : start
    const clampedEnd = end > weekEnd ? weekEnd : end
    const startDay = Math.max(0, Math.min(6, daysBetween(weekStart, clampedStart)))
    const endDay = Math.max(0, Math.min(6, daysBetween(weekStart, clampedEnd)))
    bars.push({
      project,
      startDay,
      endDay,
    })
  }
  bars.sort((a, b) => {
    if (a.startDay !== b.startDay) return a.startDay - b.startDay
    if (a.endDay !== b.endDay) return b.endDay - a.endDay
    return a.project.name.localeCompare(b.project.name)
  })
  return bars
}

function emptyDays(): DayFlags {
  return [false, false, false, false, false, false, false]
}

// ─── Employee grouping ────────────────────────────────────────────────────
const ROLE_ORDER = ['Foreman', 'Laborer', 'Crew']

function groupEmployees(employees: EmployeeProfile[]): Array<{ label: string; members: EmployeeProfile[] }> {
  const buckets = new Map<string, EmployeeProfile[]>()
  for (const e of employees) {
    const key = (e.role || 'Other').trim()
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(e)
  }
  const knownKeys = Array.from(buckets.keys())
  knownKeys.sort((a, b) => {
    const ia = ROLE_ORDER.findIndex((r) => r.toLowerCase() === a.toLowerCase())
    const ib = ROLE_ORDER.findIndex((r) => r.toLowerCase() === b.toLowerCase())
    const ra = ia === -1 ? 99 : ia
    const rb = ib === -1 ? 99 : ib
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
  return knownKeys.map((key) => ({
    label: pluralizeGroupLabel(key),
    members: buckets.get(key)!,
  }))
}

function pluralizeGroupLabel(role: string): string {
  const t = role.trim()
  if (!t) return 'OTHER'
  const upper = t.toUpperCase()
  if (upper === 'FOREMAN') return 'FOREMAN'
  if (upper.endsWith('S')) return upper
  return `${upper}S`
}

// ─── Parse initial assignment rows ─────────────────────────────────────────
function rowToDayFlags(row: SchedulerAssignmentRow): DayFlags {
  return [
    Boolean(row.day_mon),
    Boolean(row.day_tue),
    Boolean(row.day_wed),
    Boolean(row.day_thu),
    Boolean(row.day_fri),
    Boolean(row.day_sat),
    Boolean(row.day_sun),
  ]
}

function dayFlagsToRowPatch(days: DayFlags): {
  day_mon: boolean
  day_tue: boolean
  day_wed: boolean
  day_thu: boolean
  day_fri: boolean
  day_sat: boolean
  day_sun: boolean
} {
  return {
    day_mon: days[0],
    day_tue: days[1],
    day_wed: days[2],
    day_thu: days[3],
    day_fri: days[4],
    day_sat: days[5],
    day_sun: days[6],
  }
}

function parseInitialAssignments(
  rows: SchedulerAssignmentRow[],
  employees: EmployeeProfile[],
  projects: Project[]
): Assignment[] {
  const empById = new Map(employees.map((e) => [e.id, e] as const))
  const projById = new Map(projects.map((p) => [p.id, p] as const))
  return rows.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: empById.get(r.employee_id)?.name ?? '',
    project_id: r.job_id,
    project_name: projById.get(r.job_id)?.name ?? '',
    week_start: r.week_start,
    days: rowToDayFlags(r),
  }))
}

// ─── Double-book detection ─────────────────────────────────────────────────
interface Conflict {
  otherProjectName: string
  conflictingDays: number[] // indices 0..6
}

/**
 * Returns conflicts for the given assignment within the same week — i.e.
 * other assignments for the same employee on different projects sharing
 * any of the assignment's checked days.
 */
function findConflictsForAssignment(
  assignment: Assignment,
  all: Assignment[]
): Conflict[] {
  const out: Conflict[] = []
  for (const other of all) {
    if (other === assignment) continue
    if (other.id === assignment.id) continue
    if (other.employee_id !== assignment.employee_id) continue
    if (other.project_id === assignment.project_id) continue
    if (other.week_start !== assignment.week_start) continue
    const conflictingDays: number[] = []
    for (let i = 0; i < 7; i++) {
      if (assignment.days[i] && other.days[i]) conflictingDays.push(i)
    }
    if (conflictingDays.length > 0) {
      out.push({ otherProjectName: other.project_name, conflictingDays })
    }
  }
  return out
}

/**
 * Find double-book conflicts for a prospective set of days for a given
 * (employee, project, week) — used when adding/editing via the popover.
 */
function findConflictsForProposed(
  employeeId: string,
  projectId: string,
  weekISO: string,
  days: DayFlags,
  all: Assignment[],
  excludeId?: string
): Conflict[] {
  const out: Conflict[] = []
  for (const other of all) {
    if (excludeId && other.id === excludeId) continue
    if (other.employee_id !== employeeId) continue
    if (other.project_id === projectId) continue
    if (other.week_start !== weekISO) continue
    const conflictingDays: number[] = []
    for (let i = 0; i < 7; i++) {
      if (days[i] && other.days[i]) conflictingDays.push(i)
    }
    if (conflictingDays.length > 0) {
      out.push({ otherProjectName: other.project_name, conflictingDays })
    }
  }
  return out
}

// ─── Main component ───────────────────────────────────────────────────────
export default function SchedulerClient({
  userId: _userId,
  employees,
  projects,
  thisWeekISO,
  nextWeekISO,
  followingWeekISO,
  initialAssignments,
}: Props) {
  void _userId
  const supabase = useMemo(() => createClient(), [])
  const { settings: companySettings } = useCompanySettings()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Weeks for the top strip — derived from the server-provided ISO dates so
  // client and server stay in lockstep.
  const { thisWeek, nextWeek, followingWeek } = useMemo(() => {
    const t = parseISODateLocal(thisWeekISO)
    const n = parseISODateLocal(nextWeekISO)
    const f = parseISODateLocal(followingWeekISO)
    return { thisWeek: t, nextWeek: n, followingWeek: f }
  }, [thisWeekISO, nextWeekISO, followingWeekISO])

  // Gantt-style bars for each of the three weeks in the strip
  const barsByWeek = useMemo(() => {
    return {
      [thisWeekISO]: computeBarsForWeek(thisWeek, projects),
      [nextWeekISO]: computeBarsForWeek(nextWeek, projects),
      [followingWeekISO]: computeBarsForWeek(followingWeek, projects),
    }
  }, [thisWeek, nextWeek, followingWeek, thisWeekISO, nextWeekISO, followingWeekISO, projects])

  // Active week (which week's bucket assignments are shown). Defaults to
  // the current week so users land on "today".
  const [activeWeekISO, setActiveWeekISO] = useState<string>(thisWeekISO)

  const employeeGroups = useMemo(() => groupEmployees(employees), [employees])

  // Active project IDs set — used to flag "inactive" saved assignments
  const activeProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])

  // Flat assignments state — one row per (employee, job, week)
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    parseInitialAssignments(initialAssignments, employees, projects)
  )

  // Drag state
  const [activeDrag, setActiveDrag] = useState<EmployeeProfile | null>(null)
  const [activeDragCount, setActiveDragCount] = useState<number>(1)

  // Multi-select state for the employee pool — when ON, clicking an
  // employee chip toggles selection and dragging any selected chip moves
  // the whole selected group as a single drop.
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    () => new Set()
  )

  // Day-selection popover state — scoped to a single week. The employees
  // array has length 1 for a single-employee assignment and length N for a
  // group drop from the multi-select pool.
  const [popover, setPopover] = useState<{
    mode: 'add' | 'edit'
    employees: EmployeeProfile[]
    project: Project
    weekISO: string
    initialDays: DayFlags
    /** id of the existing assignment row when editing */
    editId?: string
  } | null>(null)

  // Duplicate warning popup state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    employeeName: string
    projectName: string
  } | null>(null)

  // Double-book confirmation popup state
  const [doubleBookPrompt, setDoubleBookPrompt] = useState<{
    employeeName: string
    conflicts: Conflict[]
    onContinue: () => void
    onCancel: () => void
  } | null>(null)

  // Fullscreen state — kept in sync with the browser's Fullscreen API so
  // pressing Escape (or any other exit path) updates the button label. A
  // ref on the outermost container is what we pass to requestFullscreen().
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function handleChange() {
      const fsElement =
        document.fullscreenElement ??
        (document as unknown as { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement ??
        null
      setIsFullscreen(Boolean(fsElement))
    }
    document.addEventListener('fullscreenchange', handleChange)
    document.addEventListener('webkitfullscreenchange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
      document.removeEventListener('webkitfullscreenchange', handleChange)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const fsElement =
      document.fullscreenElement ??
      (document as unknown as { webkitFullscreenElement?: Element | null })
        .webkitFullscreenElement ??
      null
    if (!fsElement) {
      const req =
        el.requestFullscreen?.bind(el) ??
        (
          el as unknown as {
            webkitRequestFullscreen?: () => Promise<void> | void
          }
        ).webkitRequestFullscreen?.bind(el)
      try {
        const r = req?.()
        if (r && typeof (r as Promise<void>).catch === 'function') {
          ;(r as Promise<void>).catch(() => setIsFullscreen(true))
        }
      } catch {
        // Fall back to CSS-based fullscreen if the API throws.
        setIsFullscreen(true)
      }
    } else {
      const exit =
        document.exitFullscreen?.bind(document) ??
        (
          document as unknown as {
            webkitExitFullscreen?: () => Promise<void> | void
          }
        ).webkitExitFullscreen?.bind(document)
      try {
        const r = exit?.()
        if (r && typeof (r as Promise<void>).catch === 'function') {
          ;(r as Promise<void>).catch(() => setIsFullscreen(false))
        }
      } catch {
        setIsFullscreen(false)
      }
    }
  }, [])

  // Save indicator state — toggled by per-row CRUD operations.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashSaved() {
    setSaveState('saved')
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSaveState('idle'), 1500)
  }

  // Sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor))

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    }
  }, [])

  // ── Per-row CRUD against scheduler_assignments ──────────────────────────
  const insertAssignment = useCallback(
    async (
      employee: EmployeeProfile,
      project: Project,
      weekISO: string,
      days: DayFlags
    ): Promise<Assignment | null> => {
      setSaveState('saving')
      const patch = dayFlagsToRowPatch(days)
      const { data, error } = await supabase
        .from('scheduler_assignments')
        .insert({
          job_id: project.id,
          employee_id: employee.id,
          week_start: weekISO,
          ...patch,
        })
        .select('*')
        .single()
      if (error || !data) {
        console.error('Failed to insert scheduler assignment:', error)
        setSaveState('error')
        return null
      }
      flashSaved()
      const row = data as SchedulerAssignmentRow
      return {
        id: row.id,
        employee_id: row.employee_id,
        employee_name: employee.name,
        project_id: row.job_id,
        project_name: project.name,
        week_start: row.week_start,
        days: rowToDayFlags(row),
      }
    },
    [supabase]
  )

  const updateAssignmentDaysRemote = useCallback(
    async (id: string, days: DayFlags): Promise<boolean> => {
      setSaveState('saving')
      const patch = dayFlagsToRowPatch(days)
      const { error } = await supabase
        .from('scheduler_assignments')
        .update(patch)
        .eq('id', id)
      if (error) {
        console.error('Failed to update scheduler assignment:', error)
        setSaveState('error')
        return false
      }
      flashSaved()
      return true
    },
    [supabase]
  )

  const deleteAssignmentRemote = useCallback(
    async (id: string): Promise<boolean> => {
      setSaveState('saving')
      const { error } = await supabase
        .from('scheduler_assignments')
        .delete()
        .eq('id', id)
      if (error) {
        console.error('Failed to delete scheduler assignment:', error)
        setSaveState('error')
        return false
      }
      flashSaved()
      return true
    },
    [supabase]
  )

  // ── Download schedule PDF ───────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const handleDownload = useCallback(async () => {
    const weekAssignments = assignments
      .filter((a) => a.week_start === activeWeekISO && a.days.some(Boolean))
      .map((a) => ({
        employee_id: a.employee_id,
        employee_name: a.employee_name,
        project_id: a.project_id,
        project_name: a.project_name,
        days: a.days,
      }))
    if (weekAssignments.length === 0) return
    setDownloading(true)
    try {
      const { generateSchedulePdf } = await import('@/lib/generateSchedulePdf')
      const scheduleProjects = projects.map((p) => ({
        id: p.id,
        name: p.name,
        estimate_number: p.estimate_number ?? null,
        address: p.address ?? null,
      }))
      const { blob, filename } = await generateSchedulePdf(
        activeWeekISO,
        weekAssignments,
        scheduleProjects,
        employees.map((e) => ({ id: e.id, name: e.name })),
        companySettings
          ? {
              dba: companySettings.dba,
              legal_name: companySettings.legal_name,
              company_address: companySettings.company_address,
              phone: companySettings.phone,
              email: companySettings.email,
              cslb_licenses: companySettings.cslb_licenses,
            }
          : null,
        companySettings?.logo_url ?? null
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to generate schedule PDF:', err)
    } finally {
      setDownloading(false)
    }
  }, [assignments, projects, employees, activeWeekISO, companySettings])

  // ── Preview modal data ─────────────────────────────────────────────────
  // Atomically derive the data the SchedulePreviewModal needs from the
  // currently selected active week. Memoizing the payload here (instead of
  // computing it inline in JSX) makes the binding to `activeWeekISO`
  // explicit and guarantees the modal's header, daily table, and employee
  // summary all reflect the SAME selected week — matching the PDF.
  const previewWeekAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.week_start === activeWeekISO && a.days.some(Boolean))
        .map((a) => ({
          employee_id: a.employee_id,
          employee_name: a.employee_name,
          project_id: a.project_id,
          project_name: a.project_name,
          days: a.days,
        })),
    [assignments, activeWeekISO]
  )

  // ── Assignment mutations (local state) ──────────────────────────────────
  const updateLocalAssignmentDays = useCallback(
    (id: string, days: DayFlags) => {
      setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, days } : a)))
    },
    []
  )

  const removeLocalAssignment = useCallback((id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleRemoveAssignment = useCallback(
    async (id: string) => {
      const ok = await deleteAssignmentRemote(id)
      if (ok) removeLocalAssignment(id)
    },
    [deleteAssignmentRemote, removeLocalAssignment]
  )

  // ── DnD handlers ────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { employee?: EmployeeProfile } | undefined
    if (!data?.employee) return
    setActiveDrag(data.employee)
    if (
      multiSelectMode &&
      selectedEmployeeIds.has(data.employee.id) &&
      selectedEmployeeIds.size > 1
    ) {
      setActiveDragCount(selectedEmployeeIds.size)
    } else {
      setActiveDragCount(1)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    setActiveDragCount(1)
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current as { employee?: EmployeeProfile } | undefined
    const overData = over.data.current as { project?: Project } | undefined
    if (!activeData?.employee || !overData?.project) return

    const draggedEmployee = activeData.employee
    const project = overData.project

    // Determine if this is a group drop from multi-select mode
    const isGroup =
      multiSelectMode &&
      selectedEmployeeIds.has(draggedEmployee.id) &&
      selectedEmployeeIds.size > 1

    const employeesToAssign = isGroup
      ? employees.filter((e) => selectedEmployeeIds.has(e.id))
      : [draggedEmployee]

    // Filter out employees already assigned to this project for this week.
    // The unique constraint (job_id, employee_id, week_start) would block
    // these and the user shouldn't be re-prompted in the modal for them.
    const eligible = employeesToAssign.filter(
      (emp) =>
        !assignments.some(
          (a) =>
            a.employee_id === emp.id &&
            a.project_id === project.id &&
            a.week_start === activeWeekISO
        )
    )

    if (eligible.length === 0) {
      setDuplicateWarning({
        employeeName: isGroup ? 'All selected employees' : draggedEmployee.name,
        projectName: project.name,
      })
      return
    }

    setPopover({
      mode: 'add',
      employees: eligible,
      project,
      weekISO: activeWeekISO,
      initialDays: emptyDays(),
    })
  }

  function handleDragCancel() {
    setActiveDrag(null)
    setActiveDragCount(1)
  }

  // ── Derived: per-bucket items filtered to the active week ───────────────
  const assignmentsByProject = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of assignments) {
      if (a.week_start !== activeWeekISO) continue
      if (!map.has(a.project_id)) map.set(a.project_id, [])
      map.get(a.project_id)!.push(a)
    }
    return map
  }, [assignments, activeWeekISO])

  // Per-employee stats — restricted to the active week so the badges in
  // the employee strip reflect what's currently visible above.
  const employeeStats = useMemo(() => {
    const map = new Map<string, { projectCount: number; hasConflict: boolean }>()
    for (const a of assignments) {
      if (a.week_start !== activeWeekISO) continue
      const s = map.get(a.employee_id) ?? { projectCount: 0, hasConflict: false }
      s.projectCount += 1
      const conflicts = findConflictsForAssignment(a, assignments)
      if (conflicts.length > 0) s.hasConflict = true
      map.set(a.employee_id, s)
    }
    return map
  }, [assignments, activeWeekISO])

  // ─── Render ───────────────────────────────────────────────────────────
  const content = (
    <div
      ref={containerRef}
      className={`flex flex-col bg-gray-50 ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen overflow-y-auto'
          : 'h-full w-full overflow-hidden'
      }`}
    >
      {/* Mobile fallback */}
      <div className="lg:hidden flex-1 flex flex-col items-center justify-center p-6 text-center">
        <MonitorIcon className="w-10 h-10 text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Scheduler is optimized for desktop</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Open this page on a larger screen to build weekly crew schedules.
        </p>
      </div>

      {/* Desktop layout */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="hidden lg:flex flex-col h-full w-full">
          {/* Header */}
          <div className="flex-none px-6 pt-5 pb-3 border-b border-gray-200 bg-white flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarRangeIcon className="w-5 h-5 text-amber-500" />
                <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Drag employees onto a project bucket and pick which days they&apos;ll be there.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SaveIndicator state={saveState} />
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2Icon className="w-4 h-4" />
                    Exit Full Screen
                  </>
                ) : (
                  <>
                    <Maximize2Icon className="w-4 h-4" />
                    Full Screen
                  </>
                )}
              </button>
              <button
                onClick={() => setPreviewOpen(true)}
                disabled={
                  assignments.filter(
                    (a) => a.week_start === activeWeekISO && a.days.some(Boolean)
                  ).length === 0
                }
                title={
                  assignments.filter(
                    (a) => a.week_start === activeWeekISO && a.days.some(Boolean)
                  ).length === 0
                    ? 'Add assignments to generate a report'
                    : 'Preview the weekly schedule before downloading or printing'
                }
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
              >
                <DownloadIcon className="w-4 h-4" />
                Download Schedule
              </button>
            </div>
          </div>

          {/* TOP: Three-week calendar strip */}
          <div className="flex-none px-4 py-2 bg-white border-b border-gray-200">
            <div className="space-y-1">
              <WeekRow
                label="This Week"
                weekStart={thisWeek}
                active={activeWeekISO === thisWeekISO}
                bars={barsByWeek[thisWeekISO]}
                isDark={isDark}
                onClick={() => setActiveWeekISO(thisWeekISO)}
              />
              <WeekRow
                label="Next Week"
                weekStart={nextWeek}
                active={activeWeekISO === nextWeekISO}
                bars={barsByWeek[nextWeekISO]}
                isDark={isDark}
                onClick={() => setActiveWeekISO(nextWeekISO)}
              />
              <WeekRow
                label="Following Week"
                weekStart={followingWeek}
                active={activeWeekISO === followingWeekISO}
                bars={barsByWeek[followingWeekISO]}
                isDark={isDark}
                onClick={() => setActiveWeekISO(followingWeekISO)}
              />
            </div>
          </div>

          {/* MIDDLE: Scheduling area — job buckets */}
          <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
            {projects.length === 0 ? (
              <div className="h-full min-h-[240px] rounded-xl border-2 border-dashed border-gray-200 dark:border-[#3a3a3a] bg-gray-100/60 dark:bg-[#2a2a2a] flex items-center justify-center">
                <p className="text-sm text-gray-500">No active projects found</p>
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  isFullscreen ? 'xl:grid-cols-4 2xl:grid-cols-5' : 'xl:grid-cols-3'
                }`}
              >
                {projects.map((project) => {
                  const items = assignmentsByProject.get(project.id) ?? []
                  return (
                    <JobBucket
                      key={project.id}
                      project={project}
                      items={items}
                      allAssignments={assignments}
                      color={colorForProjectId(project.id, isDark)}
                      onRemove={handleRemoveAssignment}
                      onEdit={(assignment) => {
                        const emp = employees.find((e) => e.id === assignment.employee_id)
                        if (!emp) return
                        setPopover({
                          mode: 'edit',
                          employees: [emp],
                          project,
                          weekISO: assignment.week_start,
                          initialDays: [...assignment.days] as DayFlags,
                          editId: assignment.id,
                        })
                      }}
                    />
                  )
                })}

                {/* Also render buckets for inactive projects with existing assignments */}
                {Array.from(assignmentsByProject.entries())
                  .filter(([pid]) => !activeProjectIds.has(pid))
                  .map(([pid, items]) => {
                    const first = items[0]
                    if (!first) return null
                    const fakeProject: Project = {
                      id: pid,
                      name: first.project_name || 'Inactive Project',
                      client_name: '',
                      address: '',
                      status: 'Closed',
                      created_at: '',
                    }
                    return (
                      <JobBucket
                        key={pid}
                        project={fakeProject}
                        inactive
                        items={items}
                        allAssignments={assignments}
                        color={colorForProjectId(pid, isDark)}
                        onRemove={handleRemoveAssignment}
                        onEdit={(assignment) => {
                          const emp = employees.find((e) => e.id === assignment.employee_id)
                          if (!emp) return
                          setPopover({
                            mode: 'edit',
                            employees: [emp],
                            project: fakeProject,
                            weekISO: assignment.week_start,
                            initialDays: [...assignment.days] as DayFlags,
                            editId: assignment.id,
                          })
                        }}
                      />
                    )
                  })}
              </div>
            )}
          </div>

          {/* BOTTOM: Employee strip */}
          <div className="flex-none border-t border-gray-200 bg-white" style={{ height: '22vh', minHeight: 180 }}>
            <div className="h-full overflow-y-auto px-6 py-2">
              {/* Multi-select toolbar */}
              <div className="flex items-center gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    if (multiSelectMode) {
                      setMultiSelectMode(false)
                      setSelectedEmployeeIds(new Set())
                    } else {
                      setMultiSelectMode(true)
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition border ${
                    multiSelectMode
                      ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-400'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50'
                  }`}
                  title={multiSelectMode ? 'Exit multi-select mode' : 'Select multiple employees to assign as a group'}
                >
                  {multiSelectMode ? 'Cancel Selection' : 'Select Multiple'}
                </button>
                {multiSelectMode && (
                  <span className="text-[11px] font-medium text-gray-500">
                    {selectedEmployeeIds.size} selected
                  </span>
                )}
                {multiSelectMode && selectedEmployeeIds.size === 0 && (
                  <span className="text-[11px] text-gray-400 italic">
                    Click employees to select, then drag any one onto a job bucket.
                  </span>
                )}
              </div>
              {employeeGroups.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-gray-400">No employees found. Add employees in Settings → Employee Management.</p>
                </div>
              ) : (
                <div className="flex gap-6">
                  {employeeGroups.map((group) => (
                    <div key={group.label} className="flex flex-col min-w-0 flex-shrink-0">
                      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
                        {group.label}
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pt-2 pr-2 pb-1">
                        {group.members.map((emp) => {
                          const stats = employeeStats.get(emp.id)
                          return (
                            <DraggableEmployeeCard
                              key={emp.id}
                              employee={emp}
                              isDragging={activeDrag?.id === emp.id}
                              projectCount={stats?.projectCount ?? 0}
                              hasConflict={Boolean(stats?.hasConflict)}
                              multiSelectMode={multiSelectMode}
                              isSelected={selectedEmployeeIds.has(emp.id)}
                              onToggleSelect={() => {
                                setSelectedEmployeeIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(emp.id)) next.delete(emp.id)
                                  else next.add(emp.id)
                                  return next
                                })
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="relative">
              {activeDragCount > 1 && (
                <>
                  <div
                    className="absolute inset-0 bg-white border border-gray-200 rounded-lg shadow-sm"
                    style={{ transform: 'translate(8px, 8px)' }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute inset-0 bg-white border border-gray-200 rounded-lg shadow-sm"
                    style={{ transform: 'translate(4px, 4px)' }}
                    aria-hidden="true"
                  />
                </>
              )}
              <EmployeeCardBody employee={activeDrag} dragging />
              {activeDragCount > 1 && (
                <div className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-white z-10">
                  {activeDragCount}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Day selection popover (single week — the active week) */}
      {popover && (
        <DaySelectionModal
          employees={popover.employees}
          project={popover.project}
          weekISO={popover.weekISO}
          weekDate={parseISODateLocal(popover.weekISO)}
          weekLabel={
            popover.weekISO === thisWeekISO
              ? 'This Week'
              : popover.weekISO === nextWeekISO
                ? 'Next Week'
                : 'Following Week'
          }
          initialDays={popover.initialDays}
          onCancel={() => setPopover(null)}
          onAssign={async (days) => {
            const isMulti = popover.employees.length > 1
            const commit = async () => {
              if (popover.mode === 'add') {
                // Insert one row per employee in parallel. Each insert
                // creates an independent assignment so days can be edited
                // per-employee after the group drop completes.
                const results = await Promise.all(
                  popover.employees.map((emp) =>
                    insertAssignment(emp, popover.project, popover.weekISO, days)
                  )
                )
                const created = results.filter(
                  (r): r is Assignment => r !== null
                )
                if (created.length > 0) {
                  setAssignments((prev) => [...prev, ...created])
                }
                if (isMulti) {
                  // Clear group selection after a successful group drop so
                  // the user returns to normal single-drag behavior.
                  setSelectedEmployeeIds(new Set())
                  setMultiSelectMode(false)
                }
              } else if (popover.editId !== undefined) {
                const ok = await updateAssignmentDaysRemote(popover.editId, days)
                if (ok) updateLocalAssignmentDays(popover.editId, days)
              }
              setPopover(null)
            }
            // Same-week double-book check across all employees being
            // assigned. For multi-employee drops we aggregate conflicts and
            // prefix the conflicting project name with the employee name so
            // the user can tell which person triggered which conflict.
            const aggregated: Conflict[] = []
            let firstConflictName = ''
            for (const emp of popover.employees) {
              const conflicts = findConflictsForProposed(
                emp.id,
                popover.project.id,
                popover.weekISO,
                days,
                assignments,
                popover.editId
              )
              if (conflicts.length > 0) {
                if (!firstConflictName) firstConflictName = emp.name
                for (const c of conflicts) {
                  aggregated.push(
                    isMulti
                      ? { ...c, otherProjectName: `${c.otherProjectName} (${emp.name})` }
                      : c
                  )
                }
              }
            }
            if (aggregated.length > 0) {
              setDoubleBookPrompt({
                employeeName: isMulti
                  ? 'One or more selected employees'
                  : firstConflictName,
                conflicts: aggregated,
                onContinue: () => {
                  setDoubleBookPrompt(null)
                  void commit()
                },
                onCancel: () => setDoubleBookPrompt(null),
              })
              return
            }
            await commit()
          }}
        />
      )}

      {/* Duplicate employee warning popup */}
      {duplicateWarning && (
        <WarningPopup
          title="Already assigned"
          message={`${duplicateWarning.employeeName} is already assigned to ${duplicateWarning.projectName} for the selected week. Click on their assignment to edit days.`}
          onDismiss={() => setDuplicateWarning(null)}
        />
      )}

      {/* Double-book confirmation popup */}
      {doubleBookPrompt && (
        <DoubleBookPrompt
          employeeName={doubleBookPrompt.employeeName}
          conflicts={doubleBookPrompt.conflicts}
          onContinue={doubleBookPrompt.onContinue}
          onCancel={doubleBookPrompt.onCancel}
        />
      )}

      {/* Schedule preview modal — opens before download/print so the user
          can verify the report before saving or sending it to the printer.
          The `key` forces a fresh mount whenever the active week changes,
          guaranteeing the modal can never display data from a previously
          selected week. */}
      {previewOpen && (
        <SchedulePreviewModal
          key={activeWeekISO}
          weekStartISO={activeWeekISO}
          thisWeekISO={thisWeekISO}
          nextWeekISO={nextWeekISO}
          followingWeekISO={followingWeekISO}
          assignments={previewWeekAssignments}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            estimate_number: p.estimate_number ?? null,
            address: p.address ?? null,
            start_date: p.start_date ?? null,
            end_date: p.end_date ?? null,
          }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          companyInfo={
            companySettings
              ? {
                  dba: companySettings.dba,
                  legal_name: companySettings.legal_name,
                  company_address: companySettings.company_address,
                  phone: companySettings.phone,
                  email: companySettings.email,
                  cslb_licenses: companySettings.cslb_licenses,
                }
              : null
          }
          logoUrl={companySettings?.logo_url ?? null}
          onClose={() => setPreviewOpen(false)}
          onDownload={handleDownload}
          downloading={downloading}
        />
      )}
    </div>
  )

  return content
}

// ─── Save indicator ───────────────────────────────────────────────────────
function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return <div className="h-5 w-20" />
  if (state === 'saving')
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </div>
    )
  if (state === 'saved')
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600">
        <CheckIcon className="w-3.5 h-3.5" />
        Saved
      </div>
    )
  return (
    <div className="flex items-center gap-1.5 text-xs text-red-500">
      <AlertTriangleIcon className="w-3.5 h-3.5" />
      Save failed
    </div>
  )
}

// ─── Week row ─────────────────────────────────────────────────────────────
const WEEK_GRID_COLUMNS = '144px repeat(7, minmax(0, 1fr))'

function WeekRow({
  label,
  weekStart,
  active,
  highlighted = false,
  bars,
  isDark,
  onClick,
}: {
  label: string
  weekStart: Date
  active: boolean
  highlighted?: boolean
  bars: JobBar[]
  isDark: boolean
  onClick: () => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }
  const barTextColor = isDark ? '#e5e5e5' : '#ffffff'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`w-full text-left rounded-lg border transition cursor-pointer overflow-hidden ${
        active
          ? 'border-amber-300/70 dark:border-[rgba(245,158,11,0.22)] bg-amber-50/30 dark:bg-[rgba(180,83,9,0.05)] shadow-sm ring-1 ring-amber-200/40 dark:ring-[rgba(245,158,11,0.12)]'
          : highlighted
            ? 'border-amber-200/60 dark:border-[rgba(245,158,11,0.15)] bg-amber-50/20 dark:bg-[rgba(180,83,9,0.04)] hover:border-amber-300/70 dark:hover:border-[rgba(245,158,11,0.22)] hover:bg-amber-50/30 dark:hover:bg-[rgba(180,83,9,0.06)]'
            : 'border-gray-200 bg-white hover:border-amber-200/60 hover:bg-amber-50/20'
      }`}
    >
      {/* Day header row — single line, minimal padding */}
      <div
        className="grid items-stretch"
        style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}
      >
        <div
          className={`px-1.5 py-0.5 flex items-center border-r ${
            active
              ? 'border-amber-200 dark:border-[rgba(245,158,11,0.15)]'
              : 'border-gray-100'
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-wider leading-none ${
              active
                ? 'text-amber-700 dark:text-[#c4a776]'
                : 'text-gray-500'
            }`}
          >
            {label}
          </p>
        </div>
        {days.map((d, i) => {
          const isWeekend = i >= 5
          const weekendBg =
            isWeekend && !highlighted ? 'bg-gray-50/60 dark:bg-[#1e1e1e]' : ''
          return (
            <div
              key={i}
              className={`px-1 py-0.5 border-r last:border-r-0 ${
                active
                  ? 'border-amber-100 dark:border-[rgba(245,158,11,0.10)]'
                  : 'border-gray-100'
              } ${weekendBg}`}
            >
              <span
                className={`block text-[10px] font-medium leading-none ${
                  active
                    ? 'text-amber-700 dark:text-[#c4a776]'
                    : 'text-gray-400'
                }`}
              >
                {DAY_LABELS[i]} {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Content row: date range in label column, Gantt bars in day columns */}
      <div
        className={`border-t ${
          active
            ? 'border-amber-100 dark:border-[rgba(245,158,11,0.10)]'
            : 'border-gray-100'
        }`}
      >
        <div
          className="grid gap-y-px py-0.5"
          style={{
            gridTemplateColumns: WEEK_GRID_COLUMNS,
            gridAutoRows: '18px',
            minHeight: '20px',
          }}
        >
          <div
            className={`flex items-center px-1.5 text-[9px] leading-none truncate ${
              active
                ? 'text-amber-700 dark:text-[#c4a776]'
                : 'text-gray-400'
            }`}
            style={{ gridColumn: 1, gridRow: 1 }}
            title={rangeLabel(weekStart)}
          >
            {rangeLabel(weekStart)}
          </div>
          {bars.map((bar, idx) => {
            const barLabel = bar.project.estimate_number
              ? `${bar.project.name} — Est #${bar.project.estimate_number}`
              : bar.project.name
            const barColor = colorForProjectId(bar.project.id, isDark)
            return (
              <div
                key={`${bar.project.id}-${idx}`}
                className="mx-0.5 flex items-center min-w-0 px-2 text-[10px] font-semibold truncate"
                style={{
                  gridColumn: `${bar.startDay + 2} / ${bar.endDay + 3}`,
                  gridRow: idx + 1,
                  backgroundColor: barColor,
                  color: barTextColor,
                  borderRadius: '3px',
                  height: '17px',
                }}
                title={barLabel}
              >
                {barLabel}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Job bucket (droppable) ───────────────────────────────────────────────
function JobBucket({
  project,
  items,
  allAssignments,
  onRemove,
  onEdit,
  inactive = false,
  color,
}: {
  project: Project
  items: Assignment[]
  allAssignments: Assignment[]
  onRemove: (id: string) => void | Promise<void>
  onEdit: (assignment: Assignment) => void
  inactive?: boolean
  color: string
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `bucket-${project.id}`,
    data: { project },
    disabled: inactive,
  })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-white p-3 flex flex-col transition ${
        isOver
          ? 'border-amber-400 border-dashed bg-amber-50/60 shadow-sm'
          : inactive
            ? 'border-gray-200 bg-gray-50 opacity-75'
            : 'border-gray-200'
      }`}
      style={{ minHeight: 120 }}
    >
      <div className="flex items-start gap-2 mb-2 pb-2 border-b border-gray-100">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-1"
          style={{ backgroundColor: inactive ? '#d1d5db' : color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-semibold truncate">
              {project.estimate_number && (
                <>
                  <span className="text-gray-900">Est #{project.estimate_number}</span>
                  <span className="text-gray-400"> — </span>
                </>
              )}
              <span className="text-gray-900">{project.name}</span>
              {project.start_date && project.end_date && (
                <>
                  <span className="text-gray-400"> — </span>
                  <span className="font-normal text-gray-500">
                    {formatShort(parseISODateLocal(project.start_date))} – {formatShort(parseISODateLocal(project.end_date))}
                  </span>
                </>
              )}
            </p>
            {inactive && (
              <span className="flex-shrink-0 text-[9px] uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                Inactive
              </span>
            )}
          </div>
          {project.address && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5">{project.address}</p>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center py-2">
          <p className="text-[11px] text-gray-400">Drop employees here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 justify-items-start">
          {items.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              conflicts={findConflictsForAssignment(assignment, allAssignments)}
              onRemove={() => onRemove(assignment.id)}
              onClick={() => onEdit(assignment)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Assignment row inside a bucket ───────────────────────────────────────
function AssignmentRow({
  assignment,
  conflicts,
  onRemove,
  onClick,
}: {
  assignment: Assignment
  conflicts: Conflict[]
  onRemove: () => void
  onClick: () => void
}) {
  const days = assignment.days
  const conflictingDaySet = new Set<number>()
  for (const c of conflicts) for (const d of c.conflictingDays) conflictingDaySet.add(d)
  const hasConflict = conflicts.length > 0
  const tooltip = hasConflict
    ? conflicts
        .map(
          (c) =>
            `Also assigned to ${c.otherProjectName} on ${c.conflictingDays.map((i) => DAY_LABELS[i]).join(', ')}`
        )
        .join('\n')
    : undefined

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-2 max-w-full px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-white hover:border-amber-300 cursor-pointer transition"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold text-gray-900 truncate">{assignment.employee_name}</p>
          {hasConflict && (
            <span title={tooltip}>
              <AlertTriangleIcon className="w-3 h-3 text-orange-500 flex-shrink-0" />
            </span>
          )}
        </div>
        <div className="flex gap-0.5 mt-0.5">
          {days.map((on, i) => {
            const conflict = conflictingDaySet.has(i)
            const base = 'w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center'
            let cls = `${base} bg-gray-200 text-gray-400`
            if (on && conflict) cls = `${base} bg-orange-500 text-white`
            else if (on) cls = `${base} bg-amber-500 text-white`
            return (
              <span key={i} className={cls}>
                {DAY_LETTERS[i]}
              </span>
            )
          })}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
        title="Remove"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Draggable employee card ──────────────────────────────────────────────
function DraggableEmployeeCard({
  employee,
  isDragging,
  projectCount,
  hasConflict,
  multiSelectMode,
  isSelected,
  onToggleSelect,
}: {
  employee: EmployeeProfile
  isDragging: boolean
  projectCount: number
  hasConflict: boolean
  multiSelectMode: boolean
  isSelected: boolean
  onToggleSelect: () => void
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `employee-${employee.id}`,
    data: { employee },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // In multi-select mode, a plain click (no drag) toggles selection.
        // dnd-kit's PointerSensor only starts a drag after the activation
        // distance is met, so click events still fire on a stationary tap.
        if (multiSelectMode) {
          e.stopPropagation()
          onToggleSelect()
        }
      }}
      className={`${isDragging ? 'opacity-40' : ''} touch-none`}
    >
      <EmployeeCardBody
        employee={employee}
        projectCount={projectCount}
        hasConflict={hasConflict}
        selectable={multiSelectMode}
        selected={isSelected}
      />
    </div>
  )
}

// ─── Employee card visual body (used by list + drag overlay) ──────────────
function EmployeeCardBody({
  employee,
  dragging = false,
  projectCount = 0,
  hasConflict = false,
  selectable = false,
  selected = false,
}: {
  employee: EmployeeProfile
  dragging?: boolean
  projectCount?: number
  hasConflict?: boolean
  selectable?: boolean
  selected?: boolean
}) {
  const name = employee.name || 'Unnamed'
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  return (
    <div
      className={`w-[130px] h-[60px] relative flex items-center gap-2 px-2 py-1.5 border rounded-lg shadow-sm select-none flex-shrink-0 transition cursor-grab ${
        dragging
          ? 'bg-white shadow-lg border-amber-400'
          : selected
            ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-300'
            : 'bg-white border-gray-200 hover:shadow-md hover:border-amber-300'
      } ${projectCount > 0 && !hasConflict ? 'border-l-4 border-l-green-400' : ''} ${
        hasConflict ? 'border-l-4 border-l-orange-400' : ''
      }`}
      title={name}
    >
      {selectable && (
        <div
          className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm transition ${
            selected
              ? 'bg-amber-500 text-white'
              : 'bg-white border border-gray-300'
          }`}
          aria-hidden="true"
        >
          {selected && <CheckIcon className="w-2.5 h-2.5" />}
        </div>
      )}
      <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {employee.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-gray-500">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{name}</p>
        {employee.role && <p className="text-[10px] text-gray-400 truncate leading-tight">{employee.role}</p>}
      </div>
      {projectCount > 0 && (
        <div
          className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
            hasConflict ? 'bg-orange-500' : 'bg-amber-500'
          }`}
        >
          {hasConflict ? <AlertTriangleIcon className="w-2.5 h-2.5" /> : projectCount}
        </div>
      )}
    </div>
  )
}

// ─── Day selection modal (single week — the active week) ─────────────────
function DaySelectionModal({
  employees,
  project,
  weekISO,
  weekDate,
  weekLabel,
  initialDays,
  onAssign,
  onCancel,
}: {
  employees: EmployeeProfile[]
  project: Project
  weekISO: string
  weekDate: Date
  weekLabel: string
  initialDays: DayFlags
  onAssign: (days: DayFlags) => void | Promise<void>
  onCancel: () => void
}) {
  void weekISO
  const isMulti = employees.length > 1
  const headerTitle = isMulti
    ? `Assigning ${employees.length} employees to ${project.name}`
    : `${employees[0]?.name ?? ''} → ${project.name}`
  const subtitleText = isMulti
    ? 'Select the days these employees will work on this project for the selected week. Each employee can be edited independently after the group is assigned.'
    : 'Select the days this employee will work on this project for the selected week.'
  const [days, setDays] = useState<DayFlags>(() => [...initialDays] as DayFlags)

  // Confirmation dialog for unchecking a day from a fully-selected week
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null)

  const isWholeWeekSelected = days.every(Boolean)

  function toggle(dayIndex: number) {
    if (days[dayIndex] && isWholeWeekSelected) {
      setConfirmRemoveIdx(dayIndex)
      return
    }
    setDays((prev) => {
      const next = [...prev] as DayFlags
      next[dayIndex] = !next[dayIndex]
      return next
    })
  }

  function confirmDayRemove() {
    if (confirmRemoveIdx === null) return
    setDays((prev) => {
      const next = [...prev] as DayFlags
      next[confirmRemoveIdx] = false
      return next
    })
    setConfirmRemoveIdx(null)
  }

  function toggleWholeWeek() {
    setDays(() =>
      isWholeWeekSelected
        ? emptyDays()
        : ([true, true, true, true, true, true, true] as DayFlags)
    )
  }

  function setWeekdays() {
    setDays([true, true, true, true, true, false, false])
  }

  function setAllWeek() {
    setDays([true, true, true, true, true, true, true])
  }

  function clear() {
    setDays(emptyDays())
  }

  const anyChecked = days.some(Boolean)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#3a3a3a] shadow-xl p-5 w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e5e5e5] mb-1">{headerTitle}</h3>
        {isMulti && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {employees.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-[#3a2a18] text-amber-800 dark:text-[#c4a776] text-[11px] font-medium"
              >
                {e.name}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-[#9a9a9a] mb-4">
          {subtitleText}
        </p>

        <div className="space-y-3 mb-4">
          <div className="rounded-lg bg-amber-50/70 dark:bg-[#2a2a2a] ring-1 ring-amber-200/80 dark:ring-[#3a3a3a] px-2 py-2 -mx-2">
            <div className="flex items-center gap-2 mb-1">
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isWholeWeekSelected}
                  onChange={toggleWholeWeek}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#4a4a4a] dark:bg-[#1e1e1e] text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-[11px] font-semibold text-gray-600 dark:text-[#c4a776] uppercase tracking-wide">
                  {weekLabel}
                </span>
              </label>
              <span className="text-[11px] text-gray-400 dark:text-[#7a7a7a] normal-case font-normal">
                ({rangeLabel(weekDate)})
              </span>
            </div>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(i)}
                  className={`flex-1 flex flex-col items-center py-2 rounded-lg border text-xs font-semibold transition ${
                    days[i]
                      ? 'bg-amber-500 border-amber-500 text-white dark:bg-[#b45309] dark:border-[#b45309]'
                      : 'bg-white dark:bg-[#1e1e1e] border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#c0c0c0] hover:border-amber-300 dark:hover:bg-[#2a2a2a] dark:hover:border-[#4a4a4a]'
                  }`}
                >
                  <span>{label}</span>
                  <span className="mt-0.5">
                    {days[i] ? <CheckIcon className="w-3 h-3" /> : <span className="w-3 h-3 block" />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={setWeekdays}
            className="text-xs font-medium text-amber-600 dark:text-[#c4a776] hover:text-amber-700 dark:hover:text-[#d4b886] transition"
          >
            Weekdays
          </button>
          <span className="text-gray-300 dark:text-[#4a4a4a]">·</span>
          <button
            type="button"
            onClick={setAllWeek}
            className="text-xs font-medium text-amber-600 dark:text-[#c4a776] hover:text-amber-700 dark:hover:text-[#d4b886] transition"
          >
            All Week
          </button>
          <span className="text-gray-300 dark:text-[#4a4a4a]">·</span>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-gray-500 dark:text-[#9a9a9a] hover:text-gray-700 dark:hover:text-[#c0c0c0] transition"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1e1e1e] rounded-lg text-sm text-gray-600 dark:text-[#c0c0c0] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onAssign(days)}
            disabled={!anyChecked}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 dark:bg-[#b45309] dark:hover:bg-[#c66510] disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
          >
            Assign
          </button>
        </div>
      </div>

      {/* Confirmation dialog for removing a day from a fully-selected week */}
      {confirmRemoveIdx !== null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 dark:bg-black/70"
          onClick={() => setConfirmRemoveIdx(null)}
        >
          <div
            className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#3a3a3a] shadow-xl p-5 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangleIcon className="w-5 h-5 text-amber-500 dark:text-[#c4a776] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e5e5e5] mb-1">Remove Day?</h3>
                <p className="text-xs text-gray-600 dark:text-[#9a9a9a]">
                  This will uncheck {DAY_FULL_NAMES[confirmRemoveIdx]} and the full week selection. Are you sure?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemoveIdx(null)}
                className="px-4 py-2 border border-gray-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1e1e1e] rounded-lg text-sm text-gray-600 dark:text-[#c0c0c0] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDayRemove}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 dark:bg-[#b45309] dark:hover:bg-[#c66510] text-white rounded-lg text-sm font-semibold transition"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Generic warning popup (duplicate employee) ───────────────────────────
function WarningPopup({
  title,
  message,
  onDismiss,
}: {
  title: string
  message: string
  onDismiss: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onDismiss}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
            <p className="text-xs text-gray-600">{message}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold transition"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Double-book confirmation popup ──────────────────────────────────────
function DoubleBookPrompt({
  employeeName,
  conflicts,
  onContinue,
  onCancel,
}: {
  employeeName: string
  conflicts: Conflict[]
  onContinue: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangleIcon className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Schedule conflict</h3>
            <div className="text-xs text-gray-600 space-y-1">
              {conflicts.map((c, idx) => (
                <p key={idx}>
                  <span className="font-semibold">{employeeName}</span> is already assigned to{' '}
                  <span className="font-semibold">{c.otherProjectName}</span> on{' '}
                  {c.conflictingDays.map((i) => DAY_LABELS[i]).join(', ')}.
                </p>
              ))}
              <p className="pt-1">Do you want to continue anyway?</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold transition"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
