'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EmployeeProfile, Project } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
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

interface Assignment {
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  /** Keyed by Monday-ISO date string; each value is Mon-Sun booleans */
  weeks: Record<string, DayFlags>
}

interface ScheduleData {
  assignments: Assignment[]
}

interface Props {
  userId: string
  employees: EmployeeProfile[]
  projects: Project[]
  nextWeekISO: string
  initialScheduleData: unknown
}

// ─── Date helpers ─────────────────────────────────────────────────────────
function startOfWeekMonday(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7)
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
interface JobColor {
  bar: string
  dot: string
}

const JOB_COLOR_PALETTE: JobColor[] = [
  { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { bar: 'bg-blue-500', dot: 'bg-blue-500' },
  { bar: 'bg-purple-500', dot: 'bg-purple-500' },
  { bar: 'bg-teal-500', dot: 'bg-teal-500' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { bar: 'bg-rose-500', dot: 'bg-rose-500' },
  { bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  { bar: 'bg-orange-500', dot: 'bg-orange-500' },
]

function colorForProjectId(id: string): JobColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  return JOB_COLOR_PALETTE[Math.abs(hash) % JOB_COLOR_PALETTE.length]
}

interface JobBar {
  project: Project
  startDay: number // 0..6 relative to week's Monday
  endDay: number // 0..6 inclusive
  color: JobColor
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
      color: colorForProjectId(project.id),
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

// ─── Parse initial schedule data safely ────────────────────────────────────
function toDayFlags(v: unknown): DayFlags | null {
  if (!Array.isArray(v) || v.length !== 7) return null
  return v.map(Boolean) as unknown as DayFlags
}

function parseInitialSchedule(raw: unknown, fallbackWeekISO: string): ScheduleData {
  if (!raw || typeof raw !== 'object') return { assignments: [] }
  const obj = raw as { assignments?: unknown }
  if (!Array.isArray(obj.assignments)) return { assignments: [] }
  const assignments: Assignment[] = []
  for (const a of obj.assignments) {
    if (!a || typeof a !== 'object') continue
    const x = a as Record<string, unknown>
    if (typeof x.employee_id !== 'string' || typeof x.project_id !== 'string') continue
    const weeks: Record<string, DayFlags> = {}
    if (x.weeks && typeof x.weeks === 'object' && !Array.isArray(x.weeks)) {
      for (const [k, v] of Object.entries(x.weeks as Record<string, unknown>)) {
        const flags = toDayFlags(v)
        if (flags) weeks[k] = flags
      }
    } else if (Array.isArray(x.days)) {
      // Backward compat: old format used a single `days` array under the row's week
      const flags = toDayFlags(x.days)
      if (flags) weeks[fallbackWeekISO] = flags
    } else {
      continue
    }
    assignments.push({
      employee_id: x.employee_id,
      employee_name: typeof x.employee_name === 'string' ? x.employee_name : '',
      project_id: x.project_id,
      project_name: typeof x.project_name === 'string' ? x.project_name : '',
      weeks,
    })
  }
  return { assignments }
}

// ─── Double-book detection ─────────────────────────────────────────────────
interface Conflict {
  otherProjectName: string
  conflictingDays: number[] // indices 0..6
}

function emptyDaysForWeek(a: Assignment, weekISO: string): DayFlags {
  return a.weeks[weekISO] ?? emptyDays()
}

function findConflictsForWeek(
  assignment: Assignment,
  all: Assignment[],
  weekISO: string
): Conflict[] {
  const out: Conflict[] = []
  const mine = emptyDaysForWeek(assignment, weekISO)
  for (const other of all) {
    if (other === assignment) continue
    if (other.employee_id !== assignment.employee_id) continue
    if (other.project_id === assignment.project_id) continue
    const theirs = emptyDaysForWeek(other, weekISO)
    const conflictingDays: number[] = []
    for (let i = 0; i < 7; i++) {
      if (mine[i] && theirs[i]) conflictingDays.push(i)
    }
    if (conflictingDays.length > 0) {
      out.push({ otherProjectName: other.project_name, conflictingDays })
    }
  }
  return out
}

interface MultiWeekConflict {
  otherProjectName: string
  // weekISO → day indices
  byWeek: Record<string, number[]>
}

/** Find all conflicts across the provided weeks for a prospective assignment */
function findMultiWeekConflicts(
  employeeId: string,
  projectId: string,
  weeks: Record<string, DayFlags>,
  all: Assignment[],
  weekISOs: string[]
): MultiWeekConflict[] {
  const byOther = new Map<string, MultiWeekConflict>()
  for (const other of all) {
    if (other.employee_id !== employeeId) continue
    if (other.project_id === projectId) continue
    for (const w of weekISOs) {
      const mine = weeks[w] ?? emptyDays()
      const theirs = other.weeks[w] ?? emptyDays()
      const days: number[] = []
      for (let i = 0; i < 7; i++) {
        if (mine[i] && theirs[i]) days.push(i)
      }
      if (days.length > 0) {
        const existing = byOther.get(other.project_id) ?? {
          otherProjectName: other.project_name,
          byWeek: {},
        }
        existing.byWeek[w] = days
        byOther.set(other.project_id, existing)
      }
    }
  }
  return Array.from(byOther.values())
}

// ─── Main component ───────────────────────────────────────────────────────
export default function SchedulerClient({
  userId,
  employees,
  projects,
  nextWeekISO,
  initialScheduleData,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { settings: companySettings } = useCompanySettings()

  // Weeks for the top strip (three weeks, starting with "this week")
  const { thisWeek, nextWeek, followingWeek, thisWeekISO, followingWeekISO } = useMemo(() => {
    const today = new Date()
    const t = startOfWeekMonday(today)
    const n = addWeeks(t, 1)
    const f = addWeeks(t, 2)
    return {
      thisWeek: t,
      nextWeek: n,
      followingWeek: f,
      thisWeekISO: toISODate(t),
      followingWeekISO: toISODate(f),
    }
  }, [])

  const weekISOs = useMemo(
    () => [thisWeekISO, nextWeekISO, followingWeekISO],
    [thisWeekISO, nextWeekISO, followingWeekISO]
  )

  // Gantt-style bars for each of the three weeks in the strip
  const barsByWeek = useMemo(() => {
    return {
      [thisWeekISO]: computeBarsForWeek(thisWeek, projects),
      [nextWeekISO]: computeBarsForWeek(nextWeek, projects),
      [followingWeekISO]: computeBarsForWeek(followingWeek, projects),
    }
  }, [thisWeek, nextWeek, followingWeek, thisWeekISO, nextWeekISO, followingWeekISO, projects])

  // Active week (which week's days the buckets show). Defaults to "next week".
  const [activeWeekISO, setActiveWeekISO] = useState<string>(nextWeekISO)

  const employeeGroups = useMemo(() => groupEmployees(employees), [employees])

  // Active project IDs set — used to flag "inactive" saved assignments
  const activeProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])

  // Schedule state
  const [schedule, setSchedule] = useState<ScheduleData>(() =>
    parseInitialSchedule(initialScheduleData, nextWeekISO)
  )

  // Drag state
  const [activeDrag, setActiveDrag] = useState<EmployeeProfile | null>(null)

  // Day-selection popover state
  const [popover, setPopover] = useState<{
    mode: 'add' | 'edit'
    employee: EmployeeProfile
    project: Project
    initialWeeks: Record<string, DayFlags>
    // For edit mode, the index of the existing assignment so we can update in place
    editIndex?: number
  } | null>(null)

  // Duplicate warning popup state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    employeeName: string
    projectName: string
  } | null>(null)

  // Double-book confirmation popup state
  const [doubleBookPrompt, setDoubleBookPrompt] = useState<{
    employeeName: string
    conflicts: MultiWeekConflict[]
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

  // Auto-save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialScheduleRef = useRef(schedule)
  const didMountRef = useRef(false)

  // Sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor))

  // ── Auto-save with debounce ─────────────────────────────────────────────
  const save = useCallback(
    async (data: ScheduleData) => {
      setSaveState('saving')
      const { error } = await supabase
        .from('scheduler_weeks')
        .upsert(
          {
            week_start: nextWeekISO,
            schedule_data: data as unknown as Record<string, unknown>,
            created_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'week_start' }
        )
      if (error) {
        console.error('Failed to save schedule:', error)
        setSaveState('error')
        return
      }
      setSaveState('saved')
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaveState('idle'), 2000)
    },
    [supabase, nextWeekISO, userId]
  )

  useEffect(() => {
    // Skip first mount — avoid saving the loaded state back immediately
    if (!didMountRef.current) {
      didMountRef.current = true
      initialScheduleRef.current = schedule
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(schedule), 700)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [schedule, save])

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ── Download schedule PDF ───────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false)
  const handleDownload = useCallback(async () => {
    if (schedule.assignments.length === 0) return
    setDownloading(true)
    try {
      const { generateSchedulePdf } = await import('@/lib/generateSchedulePdf')
      const scheduleProjects = projects.map((p) => ({
        id: p.id,
        name: p.name,
        estimate_number: p.estimate_number ?? null,
        address: p.address ?? null,
      }))
      // Convert multi-week assignments to single-week format for the active week,
      // filtering out assignments that have no days in the active week.
      const weekAssignments = schedule.assignments
        .map((a) => ({
          employee_id: a.employee_id,
          employee_name: a.employee_name,
          project_id: a.project_id,
          project_name: a.project_name,
          days: (a.weeks[activeWeekISO] ?? emptyDays()) as DayFlags,
        }))
        .filter((a) => a.days.some(Boolean))
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
  }, [schedule.assignments, projects, employees, activeWeekISO, companySettings])

  // ── Assignment mutations ────────────────────────────────────────────────
  const addAssignment = useCallback((assignment: Assignment) => {
    setSchedule((prev) => ({ assignments: [...prev.assignments, assignment] }))
  }, [])

  const updateAssignmentWeeks = useCallback(
    (index: number, weeks: Record<string, DayFlags>) => {
      setSchedule((prev) => ({
        assignments: prev.assignments.map((a, i) => (i === index ? { ...a, weeks } : a)),
      }))
    },
    []
  )

  const removeAssignment = useCallback((index: number) => {
    setSchedule((prev) => ({
      assignments: prev.assignments.filter((_, i) => i !== index),
    }))
  }, [])

  // ── DnD handlers ────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { employee?: EmployeeProfile } | undefined
    if (data?.employee) setActiveDrag(data.employee)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current as { employee?: EmployeeProfile } | undefined
    const overData = over.data.current as { project?: Project } | undefined
    if (!activeData?.employee || !overData?.project) return

    const employee = activeData.employee
    const project = overData.project

    // Duplicate prevention: block drops if employee is already assigned to this project
    const existing = schedule.assignments.find(
      (a) => a.employee_id === employee.id && a.project_id === project.id
    )
    if (existing) {
      setDuplicateWarning({ employeeName: employee.name, projectName: project.name })
      return
    }

    const initialWeeks: Record<string, DayFlags> = {
      [thisWeekISO]: emptyDays(),
      [nextWeekISO]: emptyDays(),
      [followingWeekISO]: emptyDays(),
    }
    setPopover({
      mode: 'add',
      employee,
      project,
      initialWeeks,
    })
  }

  function handleDragCancel() {
    setActiveDrag(null)
  }

  // ── Derived: assignments grouped per project ────────────────────────────
  const assignmentsByProject = useMemo(() => {
    const map = new Map<string, Array<{ assignment: Assignment; index: number }>>()
    schedule.assignments.forEach((a, i) => {
      if (!map.has(a.project_id)) map.set(a.project_id, [])
      map.get(a.project_id)!.push({ assignment: a, index: i })
    })
    return map
  }, [schedule.assignments])

  // Per-employee stats (conflict detection is for the active week)
  const employeeStats = useMemo(() => {
    const map = new Map<string, { projectCount: number; hasConflict: boolean }>()
    for (const a of schedule.assignments) {
      const s = map.get(a.employee_id) ?? { projectCount: 0, hasConflict: false }
      s.projectCount += 1
      const conflicts = findConflictsForWeek(a, schedule.assignments, activeWeekISO)
      if (conflicts.length > 0) s.hasConflict = true
      map.set(a.employee_id, s)
    }
    return map
  }, [schedule.assignments, activeWeekISO])

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
                onClick={handleDownload}
                disabled={schedule.assignments.length === 0 || downloading}
                title={
                  schedule.assignments.length === 0
                    ? 'Add assignments to generate a report'
                    : 'Download weekly schedule PDF'
                }
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
              >
                {downloading ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-4 h-4" />
                    Download Schedule
                  </>
                )}
              </button>
            </div>
          </div>

          {/* TOP: Three-week calendar strip */}
          <div className="flex-none px-6 py-4 bg-white border-b border-gray-200">
            <div className="space-y-2">
              <WeekRow
                label="This Week"
                weekStart={thisWeek}
                active={activeWeekISO === thisWeekISO}
                bars={barsByWeek[thisWeekISO]}
                onClick={() => setActiveWeekISO(thisWeekISO)}
              />
              <WeekRow
                label="Next Week"
                weekStart={nextWeek}
                active={activeWeekISO === nextWeekISO}
                bars={barsByWeek[nextWeekISO]}
                highlighted
                onClick={() => setActiveWeekISO(nextWeekISO)}
              />
              <WeekRow
                label="Following Week"
                weekStart={followingWeek}
                active={activeWeekISO === followingWeekISO}
                bars={barsByWeek[followingWeekISO]}
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
                      allAssignments={schedule.assignments}
                      activeWeekISO={activeWeekISO}
                      weekISOs={weekISOs}
                      color={colorForProjectId(project.id)}
                      onRemove={removeAssignment}
                      onEdit={(index) => {
                        const a = schedule.assignments[index]
                        const emp = employees.find((e) => e.id === a.employee_id)
                        if (!emp) return
                        setPopover({
                          mode: 'edit',
                          employee: emp,
                          project,
                          initialWeeks: {
                            [thisWeekISO]: a.weeks[thisWeekISO] ?? emptyDays(),
                            [nextWeekISO]: a.weeks[nextWeekISO] ?? emptyDays(),
                            [followingWeekISO]: a.weeks[followingWeekISO] ?? emptyDays(),
                          },
                          editIndex: index,
                        })
                      }}
                    />
                  )
                })}

                {/* Also render buckets for inactive projects with existing assignments */}
                {Array.from(assignmentsByProject.entries())
                  .filter(([pid]) => !activeProjectIds.has(pid))
                  .map(([pid, items]) => {
                    const first = items[0]?.assignment
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
                        allAssignments={schedule.assignments}
                        activeWeekISO={activeWeekISO}
                        weekISOs={weekISOs}
                        color={colorForProjectId(pid)}
                        onRemove={removeAssignment}
                        onEdit={(index) => {
                          const a = schedule.assignments[index]
                          const emp = employees.find((e) => e.id === a.employee_id)
                          if (!emp) return
                          setPopover({
                            mode: 'edit',
                            employee: emp,
                            project: fakeProject,
                            initialWeeks: {
                              [thisWeekISO]: a.weeks[thisWeekISO] ?? emptyDays(),
                              [nextWeekISO]: a.weeks[nextWeekISO] ?? emptyDays(),
                              [followingWeekISO]: a.weeks[followingWeekISO] ?? emptyDays(),
                            },
                            editIndex: index,
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
            <div className="h-full overflow-y-auto px-6 py-3">
              {employeeGroups.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-gray-400">No employees found. Add employees in Settings → Employee Management.</p>
                </div>
              ) : (
                <div className="flex gap-6 h-full">
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
          {activeDrag ? <EmployeeCardBody employee={activeDrag} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Day selection popover */}
      {popover && (
        <DaySelectionModal
          title={`${popover.employee.name} → ${popover.project.name}`}
          weekStarts={[
            { iso: thisWeekISO, label: 'This Week', date: thisWeek },
            { iso: nextWeekISO, label: 'Next Week', date: nextWeek },
            { iso: followingWeekISO, label: 'Following Week', date: followingWeek },
          ]}
          initialWeeks={popover.initialWeeks}
          onCancel={() => setPopover(null)}
          onAssign={(weeks) => {
            const commit = () => {
              if (popover.mode === 'add') {
                addAssignment({
                  employee_id: popover.employee.id,
                  employee_name: popover.employee.name,
                  project_id: popover.project.id,
                  project_name: popover.project.name,
                  weeks,
                })
              } else if (popover.editIndex !== undefined) {
                updateAssignmentWeeks(popover.editIndex, weeks)
              }
              setPopover(null)
            }
            // Check double-book across all three weeks vs other assignments
            const others =
              popover.mode === 'edit' && popover.editIndex !== undefined
                ? schedule.assignments.filter((_, i) => i !== popover.editIndex)
                : schedule.assignments
            const conflicts = findMultiWeekConflicts(
              popover.employee.id,
              popover.project.id,
              weeks,
              others,
              weekISOs
            )
            if (conflicts.length > 0) {
              setDoubleBookPrompt({
                employeeName: popover.employee.name,
                conflicts,
                onContinue: () => {
                  setDoubleBookPrompt(null)
                  commit()
                },
                onCancel: () => setDoubleBookPrompt(null),
              })
              return
            }
            commit()
          }}
        />
      )}

      {/* Duplicate employee warning popup */}
      {duplicateWarning && (
        <WarningPopup
          title="Already assigned"
          message={`${duplicateWarning.employeeName} is already assigned to ${duplicateWarning.projectName}. Click on their assignment to edit days.`}
          onDismiss={() => setDuplicateWarning(null)}
        />
      )}

      {/* Double-book confirmation popup */}
      {doubleBookPrompt && (
        <DoubleBookPrompt
          employeeName={doubleBookPrompt.employeeName}
          conflicts={doubleBookPrompt.conflicts}
          weekISOs={weekISOs}
          onContinue={doubleBookPrompt.onContinue}
          onCancel={doubleBookPrompt.onCancel}
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
  onClick,
}: {
  label: string
  weekStart: Date
  active: boolean
  highlighted?: boolean
  bars: JobBar[]
  onClick: () => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`w-full text-left rounded-lg border transition cursor-pointer overflow-hidden ${
        active
          ? highlighted
            ? 'border-amber-400 bg-green-50/80 shadow-sm ring-2 ring-amber-200'
            : 'border-amber-400 bg-amber-50/70 shadow-sm ring-2 ring-amber-200'
          : highlighted
            ? 'border-green-300 bg-green-50/70 ring-1 ring-green-200/80 shadow-[0_0_12px_rgba(134,239,172,0.25)] hover:border-green-400 hover:bg-green-50'
            : 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
      }`}
    >
      {/* Day header row */}
      <div
        className="grid items-stretch"
        style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}
      >
        <div
          className={`px-3 py-1.5 flex flex-col justify-center border-r ${
            active ? 'border-amber-200' : 'border-gray-100'
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${
              active ? 'text-amber-700' : 'text-gray-500'
            }`}
          >
            {label}
          </p>
          <p className={`text-[10px] ${active ? 'text-amber-900' : 'text-gray-500'}`}>
            {rangeLabel(weekStart)}
          </p>
        </div>
        {days.map((d, i) => {
          const isWeekend = i >= 5
          return (
            <div
              key={i}
              className={`px-2 py-1.5 border-r last:border-r-0 flex items-baseline justify-center gap-1 ${
                active ? 'border-amber-100' : 'border-gray-100'
              } ${isWeekend ? 'bg-gray-50/60 dark:bg-[#1e1e1e]' : ''}`}
            >
              <span
                className={`text-[9px] font-bold uppercase tracking-wide ${
                  active ? 'text-amber-700' : 'text-gray-400'
                }`}
              >
                {DAY_LETTERS[i]}
              </span>
              <span
                className={`text-xs font-semibold ${
                  active ? 'text-gray-900' : 'text-gray-600'
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Gantt bars row */}
      {bars.length > 0 && (
        <div
          className={`border-t ${
            active ? 'border-amber-100' : 'border-gray-100'
          }`}
        >
          <div
            className="grid gap-y-0.5 py-1"
            style={{ gridTemplateColumns: WEEK_GRID_COLUMNS }}
          >
            {bars.map((bar, idx) => {
              const barLabel = bar.project.estimate_number
                ? `${bar.project.name} — Est #${bar.project.estimate_number}`
                : bar.project.name
              return (
                <div
                  key={`${bar.project.id}-${idx}`}
                  className={`mx-0.5 min-w-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white truncate shadow-sm ${bar.color.bar}`}
                  style={{
                    gridColumn: `${bar.startDay + 2} / ${bar.endDay + 3}`,
                    gridRow: idx + 1,
                  }}
                  title={barLabel}
                >
                  {barLabel}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Job bucket (droppable) ───────────────────────────────────────────────
function JobBucket({
  project,
  items,
  allAssignments,
  activeWeekISO,
  weekISOs,
  onRemove,
  onEdit,
  inactive = false,
  color,
}: {
  project: Project
  items: Array<{ assignment: Assignment; index: number }>
  allAssignments: Assignment[]
  activeWeekISO: string
  weekISOs: string[]
  onRemove: (index: number) => void
  onEdit: (index: number) => void
  inactive?: boolean
  color: JobColor
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
      <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                inactive ? 'bg-gray-300' : color.dot
              }`}
              aria-hidden="true"
            />
            <p className="text-sm font-bold text-gray-900 truncate">{project.name}</p>
            {inactive && (
              <span className="text-[9px] uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                Inactive
              </span>
            )}
          </div>
          {project.estimate_number && (
            <p className="text-[10px] text-gray-400 font-medium">Est #{project.estimate_number}</p>
          )}
          {project.address && <p className="text-xs text-gray-500 truncate">{project.address}</p>}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center py-2">
          <p className="text-[11px] text-gray-400">Drop employees here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map(({ assignment, index }) => {
            const days = assignment.weeks[activeWeekISO] ?? emptyDays()
            const otherWeeksHaveDays = weekISOs.some(
              (w) => w !== activeWeekISO && (assignment.weeks[w] ?? emptyDays()).some(Boolean)
            )
            return (
              <AssignmentRow
                key={`${assignment.employee_id}-${index}`}
                assignment={assignment}
                days={days}
                conflicts={findConflictsForWeek(assignment, allAssignments, activeWeekISO)}
                otherWeeksHaveDays={otherWeeksHaveDays}
                onRemove={() => onRemove(index)}
                onClick={() => onEdit(index)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Assignment row inside a bucket ───────────────────────────────────────
function AssignmentRow({
  assignment,
  days,
  conflicts,
  otherWeeksHaveDays,
  onRemove,
  onClick,
}: {
  assignment: Assignment
  days: DayFlags
  conflicts: Conflict[]
  otherWeeksHaveDays: boolean
  onRemove: () => void
  onClick: () => void
}) {
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
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-white hover:border-amber-300 cursor-pointer transition"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold text-gray-900 truncate">{assignment.employee_name}</p>
          {hasConflict && (
            <span title={tooltip}>
              <AlertTriangleIcon className="w-3 h-3 text-orange-500 flex-shrink-0" />
            </span>
          )}
          {otherWeeksHaveDays && (
            <span
              title="Also assigned other weeks"
              className="text-[8px] uppercase font-bold tracking-wide bg-amber-100 text-amber-700 px-1 rounded"
            >
              +
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
}: {
  employee: EmployeeProfile
  isDragging: boolean
  projectCount: number
  hasConflict: boolean
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
      className={`${isDragging ? 'opacity-40' : ''} touch-none`}
    >
      <EmployeeCardBody
        employee={employee}
        projectCount={projectCount}
        hasConflict={hasConflict}
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
}: {
  employee: EmployeeProfile
  dragging?: boolean
  projectCount?: number
  hasConflict?: boolean
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
      className={`w-[130px] h-[60px] relative flex items-center gap-2 px-2 py-1.5 bg-white border rounded-lg shadow-sm select-none flex-shrink-0 transition cursor-grab ${
        dragging ? 'shadow-lg border-amber-400' : 'border-gray-200 hover:shadow-md hover:border-amber-300'
      } ${projectCount > 0 && !hasConflict ? 'border-l-4 border-l-green-400' : ''} ${
        hasConflict ? 'border-l-4 border-l-orange-400' : ''
      }`}
      title={name}
    >
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

// ─── Day selection modal (multi-week) ─────────────────────────────────────
interface WeekOption {
  iso: string
  label: string
  date: Date
}

function DaySelectionModal({
  title,
  weekStarts,
  initialWeeks,
  onAssign,
  onCancel,
}: {
  title: string
  weekStarts: WeekOption[]
  initialWeeks: Record<string, DayFlags>
  onAssign: (weeks: Record<string, DayFlags>) => void
  onCancel: () => void
}) {
  const [weeks, setWeeks] = useState<Record<string, DayFlags>>(() => {
    const out: Record<string, DayFlags> = {}
    for (const w of weekStarts) {
      const existing = initialWeeks[w.iso]
      out[w.iso] = existing ? ([...existing] as DayFlags) : emptyDays()
    }
    return out
  })

  // Confirmation dialog state for unchecking a day from a fully-selected week
  const [confirmRemove, setConfirmRemove] = useState<{
    weekISO: string
    dayIndex: number
  } | null>(null)

  function isWholeWeekSelected(weekISO: string): boolean {
    const arr = weeks[weekISO]
    return arr ? arr.every(Boolean) : false
  }

  function toggle(weekISO: string, dayIndex: number) {
    const arr = weeks[weekISO] ?? emptyDays()
    // If unchecking a day and the whole week is currently selected, show confirmation
    if (arr[dayIndex] && isWholeWeekSelected(weekISO)) {
      setConfirmRemove({ weekISO, dayIndex })
      return
    }
    setWeeks((prev) => {
      const next = { ...prev }
      const a = [...(next[weekISO] ?? emptyDays())] as DayFlags
      a[dayIndex] = !a[dayIndex]
      next[weekISO] = a
      return next
    })
  }

  function confirmDayRemove() {
    if (!confirmRemove) return
    const { weekISO, dayIndex } = confirmRemove
    setWeeks((prev) => {
      const next = { ...prev }
      const a = [...(next[weekISO] ?? emptyDays())] as DayFlags
      a[dayIndex] = false
      next[weekISO] = a
      return next
    })
    setConfirmRemove(null)
  }

  function toggleWholeWeek(weekISO: string) {
    const allSelected = isWholeWeekSelected(weekISO)
    setWeeks((prev) => {
      const next = { ...prev }
      next[weekISO] = allSelected
        ? emptyDays()
        : [true, true, true, true, true, true, true]
      return next
    })
  }

  function setWeekdaysAll() {
    setWeeks(() => {
      const out: Record<string, DayFlags> = {}
      for (const w of weekStarts) {
        out[w.iso] = [true, true, true, true, true, false, false]
      }
      return out
    })
  }

  function setAllWeekAll() {
    setWeeks(() => {
      const out: Record<string, DayFlags> = {}
      for (const w of weekStarts) {
        out[w.iso] = [true, true, true, true, true, true, true]
      }
      return out
    })
  }

  function clearAll() {
    setWeeks(() => {
      const out: Record<string, DayFlags> = {}
      for (const w of weekStarts) {
        out[w.iso] = emptyDays()
      }
      return out
    })
  }

  const anyChecked = Object.values(weeks).some((d) => d.some(Boolean))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-xs text-gray-500 mb-4">Select the days this employee will work on this project.</p>

        <div className="space-y-3 mb-4">
          {weekStarts.map((w) => {
            const arr = weeks[w.iso] ?? emptyDays()
            const isNextWeek = w.label === 'Next Week'
            return (
              <div
                key={w.iso}
                className={
                  isNextWeek
                    ? 'rounded-lg bg-green-50/70 ring-1 ring-green-200/80 px-2 py-2 -mx-2'
                    : ''
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <label className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={isWholeWeekSelected(w.iso)}
                      onChange={() => toggleWholeWeek(w.iso)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                      {w.label}
                    </span>
                  </label>
                  <span className="text-[11px] text-gray-400 normal-case font-normal">({rangeLabel(w.date)})</span>
                </div>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(w.iso, i)}
                      className={`flex-1 flex flex-col items-center py-2 rounded-lg border text-xs font-semibold transition ${
                        arr[i]
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="mt-0.5">
                        {arr[i] ? <CheckIcon className="w-3 h-3" /> : <span className="w-3 h-3 block" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={setWeekdaysAll}
            className="text-xs font-medium text-amber-600 hover:text-amber-700 transition"
          >
            Weekdays
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={setAllWeekAll}
            className="text-xs font-medium text-amber-600 hover:text-amber-700 transition"
          >
            All Week
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
          >
            Clear All
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onAssign(weeks)}
            disabled={!anyChecked}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
          >
            Assign
          </button>
        </div>
      </div>

      {/* Confirmation dialog for removing a day from a fully-selected week */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Remove Day?</h3>
                <p className="text-xs text-gray-600">
                  This will uncheck {DAY_FULL_NAMES[confirmRemove.dayIndex]} and the full week selection. Are you sure?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDayRemove}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold transition"
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
  weekISOs,
  onContinue,
  onCancel,
}: {
  employeeName: string
  conflicts: MultiWeekConflict[]
  weekISOs: string[]
  onContinue: () => void
  onCancel: () => void
}) {
  const weekLabels = ['This Week', 'Next Week', 'Following Week']
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
              {conflicts.map((c, idx) => {
                const parts: string[] = []
                for (const w of weekISOs) {
                  const days = c.byWeek[w]
                  if (!days || days.length === 0) continue
                  const wIdx = weekISOs.indexOf(w)
                  parts.push(
                    `${weekLabels[wIdx] ?? w} (${days.map((i) => DAY_LABELS[i]).join(', ')})`
                  )
                }
                return (
                  <p key={idx}>
                    <span className="font-semibold">{employeeName}</span> is already assigned to{' '}
                    <span className="font-semibold">{c.otherProjectName}</span> on {parts.join('; ')}.
                  </p>
                )
              })}
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
