'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon, SettingsIcon, PlusIcon, DownloadIcon, LoaderIcon, ChevronLeftIcon, CalendarIcon } from 'lucide-react'
import { Project, TimecardContent, DynamicFieldEntry } from '@/types'
import TimecardCard from './TimecardCard'
import ManageEmployeesModal from './ManageEmployeesModal'
import NewTimecardModal from './NewTimecardModal'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { calculateCaliforniaOvertime } from '@/lib/overtimeCalculator'

interface TimecardRow {
  id: string
  project_id: string
  created_at: string
  content: TimecardContent
  dynamic_fields?: DynamicFieldEntry[]
  project_name: string
}

interface TimesheetsPageClientProps {
  initialTimecards: TimecardRow[]
  projects: Project[]
  allProjects: Project[]
  userId: string
}

type SortOption = 'newest' | 'oldest' | 'hours_high' | 'hours_low' | 'project_az'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'hours_high', label: 'Hours (High-Low)' },
  { value: 'hours_low', label: 'Hours (Low-High)' },
  { value: 'project_az', label: 'Project Name (A-Z)' },
]

// ── Week helpers ──────────────────────────────────────────────────────────────

/** Get the Monday of the week containing dateStr (YYYY-MM-DD) */
function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

/** Format a week range like "Week of Feb 24 - Mar 2, 2026" */
function formatWeekRange(weekMonday: string): string {
  const start = new Date(weekMonday + 'T12:00:00')
  const end = new Date(weekMonday + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `Week of ${startStr} – ${endStr}`
}

// ── Grouping ──────────────────────────────────────────────────────────────────

interface WeekGroup {
  weekMonday: string
  weekHours: number
  weekEntries: number
  timecards: TimecardRow[]
}

interface ProjectGroup {
  projectId: string
  projectName: string
  totalHours: number
  totalTimecards: number
  totalEntries: number
  weeks: WeekGroup[]
}

function groupByProjectAndWeek(timecards: TimecardRow[], sort: SortOption): ProjectGroup[] {
  const projectMap = new Map<
    string,
    {
      projectName: string
      weekMap: Map<string, { hours: number; entries: number; timecards: TimecardRow[] }>
      totalHours: number
      totalTimecards: number
      totalEntries: number
      latestDate: string
      oldestDate: string
    }
  >()

  for (const tc of timecards) {
    const dateKey = tc.content.date || tc.created_at.slice(0, 10)
    const weekKey = getWeekMonday(dateKey)
    let project = projectMap.get(tc.project_id)

    if (!project) {
      project = {
        projectName: tc.project_name,
        weekMap: new Map(),
        totalHours: 0,
        totalTimecards: 0,
        totalEntries: 0,
        latestDate: dateKey,
        oldestDate: dateKey,
      }
      projectMap.set(tc.project_id, project)
    }

    if (dateKey > project.latestDate) project.latestDate = dateKey
    if (dateKey < project.oldestDate) project.oldestDate = dateKey
    project.totalHours += tc.content.grand_total_hours
    project.totalTimecards += 1
    project.totalEntries += tc.content.entries.length

    let week = project.weekMap.get(weekKey)
    if (!week) {
      week = { hours: 0, entries: 0, timecards: [] }
      project.weekMap.set(weekKey, week)
    }
    week.hours += tc.content.grand_total_hours
    week.entries += tc.content.entries.length
    week.timecards.push(tc)
  }

  const dateDir = sort === 'oldest' ? 1 : -1

  return Array.from(projectMap.entries())
    .sort(([, a], [, b]) => {
      if (sort === 'project_az') return a.projectName.localeCompare(b.projectName)
      if (sort === 'hours_high') return b.totalHours - a.totalHours
      if (sort === 'hours_low') return a.totalHours - b.totalHours
      if (sort === 'newest') return b.latestDate.localeCompare(a.latestDate)
      return a.oldestDate.localeCompare(b.oldestDate)
    })
    .map(([projectId, project]) => ({
      projectId,
      projectName: project.projectName,
      totalHours: Math.round(project.totalHours * 100) / 100,
      totalTimecards: project.totalTimecards,
      totalEntries: project.totalEntries,
      weeks: Array.from(project.weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b) * dateDir)
        .map(([weekMonday, week]) => ({
          weekMonday,
          weekHours: Math.round(week.hours * 100) / 100,
          weekEntries: week.entries,
          timecards: [...week.timecards].sort((a, b) => {
            const dA = a.content.date || a.created_at.slice(0, 10)
            const dB = b.content.date || b.created_at.slice(0, 10)
            return dA.localeCompare(dB) * dateDir
          }),
        })),
    }))
}

// ── Weekly Hours Summary ─────────────────────────────────────────────────────

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCurrentWeekMonday(): string {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff)
  return now.toISOString().split('T')[0]
}

function shiftWeek(mondayISO: string, delta: number): string {
  const d = new Date(mondayISO + 'T12:00:00')
  d.setDate(d.getDate() + delta * 7)
  return d.toISOString().split('T')[0]
}

function formatSummaryRange(mondayISO: string): string {
  const start = new Date(mondayISO + 'T12:00:00')
  const end = new Date(mondayISO + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function WeeklyHoursSummary({ timecards }: { timecards: TimecardRow[] }) {
  const [weekMonday, setWeekMonday] = useState(getCurrentWeekMonday)

  const { summaries, driveByEmployee } = useMemo(() => {
    const sundayISO = (() => {
      const d = new Date(weekMonday + 'T12:00:00')
      d.setDate(d.getDate() + 6)
      return d.toISOString().split('T')[0]
    })()

    // Filter timecards to the selected week
    const weekTimecards = timecards.filter((tc) => {
      const d = tc.content.date || tc.created_at.slice(0, 10)
      return d >= weekMonday && d <= sundayISO
    })

    if (weekTimecards.length === 0) return { summaries: [], driveByEmployee: new Map<string, number>() }

    // Aggregate work hours and drive time per employee per day (Mon=0 .. Sun=6)
    const employeeMap = new Map<string, number[]>()
    const driveMap = new Map<string, number>()

    for (const tc of weekTimecards) {
      const tcDate = tc.content.date || tc.created_at.slice(0, 10)
      const d = new Date(tcDate + 'T12:00:00')
      const jsDay = d.getDay()
      const dayIndex = jsDay === 0 ? 6 : jsDay - 1

      for (const entry of tc.content.entries) {
        const name = entry.employee_name
        if (!employeeMap.has(name)) {
          employeeMap.set(name, [0, 0, 0, 0, 0, 0, 0])
        }
        employeeMap.get(name)![dayIndex] += entry.total_hours

        if (entry.drive_time != null && entry.drive_time > 0) {
          driveMap.set(name, (driveMap.get(name) ?? 0) + entry.drive_time)
        }
      }
    }

    return { summaries: calculateCaliforniaOvertime(employeeMap), driveByEmployee: driveMap }
  }, [timecards, weekMonday])

  // Compute totals row
  const totals = useMemo(() => {
    const daily = [0, 0, 0, 0, 0, 0, 0]
    let regular = 0, overtime = 0, doubleTime = 0, total = 0, drive = 0
    for (const s of summaries) {
      for (let i = 0; i < 7; i++) daily[i] += s.daily[i].total
      regular += s.regular
      overtime += s.overtime
      doubleTime += s.doubleTime
      total += s.total
      drive += driveByEmployee.get(s.employeeName) ?? 0
    }
    return { daily, regular, overtime, doubleTime, total, drive }
  }, [summaries, driveByEmployee])

  const fmt = (n: number) => n === 0 ? '—' : n % 1 === 0 ? String(n) : n.toFixed(1)
  const fmtTotal = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)

  function dayCellBgClass(total: number): string {
    if (total <= 0) return ''
    if (total <= 8) return 'bg-[rgba(99,153,34,0.08)] dark:bg-[rgba(99,153,34,0.22)]'
    if (total <= 12) return 'bg-[rgba(186,117,23,0.12)] dark:bg-[rgba(186,117,23,0.28)]'
    return 'bg-[rgba(163,45,45,0.12)] dark:bg-[rgba(163,45,45,0.28)]'
  }

  const BAR_COLORS = { reg: '#639922', ot: '#BA7517', dt: '#A32D2D', drive: '#185FA5' }

  function StackedBar({ regular, overtime, doubleTime, total }: { regular: number; overtime: number; doubleTime: number; total: number }) {
    if (total <= 0) return null
    const regPct = (regular / total) * 100
    const otPct = (overtime / total) * 100
    const dtPct = (doubleTime / total) * 100
    return (
      <div className="flex w-full rounded overflow-hidden" style={{ height: 16 }}>
        {regular > 0 && <div style={{ width: `${regPct}%`, backgroundColor: BAR_COLORS.reg }} />}
        {overtime > 0 && <div style={{ width: `${otPct}%`, backgroundColor: BAR_COLORS.ot }} />}
        {doubleTime > 0 && <div style={{ width: `${dtPct}%`, backgroundColor: BAR_COLORS.dt }} />}
      </div>
    )
  }

  const separatorLeft = '1.5px solid #e5e7eb'

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-gray-900">Weekly Hours Summary</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekMonday((m) => shiftWeek(m, -1))}
            className="p-1 rounded hover:bg-gray-100 transition text-gray-500"
            title="Previous week"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-gray-600 px-1 tabular-nums whitespace-nowrap">
            {formatSummaryRange(weekMonday)}
          </span>
          <button
            onClick={() => setWeekMonday((m) => shiftWeek(m, 1))}
            className="p-1 rounded hover:bg-gray-100 transition text-gray-500"
            title="Next week"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No timecard entries for this week.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 dark:bg-[#2e2e2e]">
                  <th className="text-left font-semibold text-gray-400 pl-4 pr-2 py-2 whitespace-nowrap sticky left-0 bg-gray-50/60 dark:bg-[#2e2e2e] z-10 text-[11px]">Employee</th>
                  {WEEK_DAY_LABELS.map((d) => (
                    <th key={d} className="text-center font-semibold text-gray-400 px-1.5 py-2 whitespace-nowrap text-[11px]">{d}</th>
                  ))}
                  <th className="text-center font-semibold text-gray-400 px-2 py-2 whitespace-nowrap text-[11px]" style={{ minWidth: 80 }}>Breakdown</th>
                  <th className="text-center font-semibold text-gray-400 px-2 py-2 whitespace-nowrap text-[11px]" style={{ borderLeft: separatorLeft }}>Reg</th>
                  <th className="text-center font-semibold px-2 py-2 whitespace-nowrap text-[11px]" style={{ color: BAR_COLORS.ot }}>OT</th>
                  <th className="text-center font-semibold px-2 py-2 whitespace-nowrap text-[11px]" style={{ color: BAR_COLORS.dt }}>DT</th>
                  <th className="text-center font-semibold text-gray-700 px-2 py-2 whitespace-nowrap text-[11px]">Total</th>
                  <th className="text-center font-semibold px-2 pr-4 py-2 whitespace-nowrap text-[11px]" style={{ color: BAR_COLORS.drive, borderLeft: separatorLeft }}>Drive</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s, rowIdx) => {
                  const empDrive = driveByEmployee.get(s.employeeName) ?? 0
                  const isStripe = rowIdx % 2 === 1
                  const rowBgClass = isStripe
                    ? 'bg-gray-50/60 dark:bg-[#2a2a2a]'
                    : 'bg-white dark:bg-[#242424]'
                  return (
                    <tr key={s.employeeName} className={`border-b border-gray-50 ${rowBgClass}`}>
                      <td className={`pl-4 pr-2 py-1.5 font-medium text-gray-800 whitespace-nowrap sticky left-0 z-10 ${rowBgClass}`}>{s.employeeName}</td>
                      {s.daily.map((d, i) => (
                        <td key={i} className="text-center px-1.5 py-1.5">
                          {d.total > 0 ? (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded tabular-nums text-gray-700 dark:text-[#e5e5e5] font-medium ${dayCellBgClass(d.total)}`}
                            >
                              {fmt(d.total)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <StackedBar regular={s.regular} overtime={s.overtime} doubleTime={s.doubleTime} total={s.total} />
                      </td>
                      <td className="text-center text-gray-700 px-2 py-1.5 tabular-nums" style={{ borderLeft: separatorLeft }}>{fmt(s.regular)}</td>
                      <td className="text-center font-medium px-2 py-1.5 tabular-nums" style={{ color: BAR_COLORS.ot }}>{fmt(s.overtime)}</td>
                      <td className="text-center font-medium px-2 py-1.5 tabular-nums" style={{ color: BAR_COLORS.dt }}>{fmt(s.doubleTime)}</td>
                      <td className="text-center font-bold text-gray-900 px-2 py-1.5 tabular-nums">{fmtTotal(s.total)}</td>
                      <td className="text-center font-medium px-2 pr-4 py-1.5 tabular-nums" style={{ color: BAR_COLORS.drive, borderLeft: separatorLeft }}>{fmt(empDrive)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 dark:bg-[#2e2e2e] border-t-2 border-gray-300 dark:border-[#3a3a3a]">
                  <td className="pl-4 pr-2 py-2 font-medium text-gray-500 sticky left-0 z-10 bg-gray-100 dark:bg-[#2e2e2e]">Totals</td>
                  {totals.daily.map((h, i) => (
                    <td key={i} className="text-center text-gray-500 font-medium px-1.5 py-2 tabular-nums">{fmt(h)}</td>
                  ))}
                  <td className="px-2 py-2">
                    <StackedBar regular={totals.regular} overtime={totals.overtime} doubleTime={totals.doubleTime} total={totals.total} />
                  </td>
                  <td className="text-center text-gray-500 font-medium px-2 py-2 tabular-nums" style={{ borderLeft: separatorLeft }}>{fmt(totals.regular)}</td>
                  <td className="text-center font-medium px-2 py-2 tabular-nums" style={{ color: BAR_COLORS.ot }}>{fmt(totals.overtime)}</td>
                  <td className="text-center font-medium px-2 py-2 tabular-nums" style={{ color: BAR_COLORS.dt }}>{fmt(totals.doubleTime)}</td>
                  <td className="text-center font-bold text-gray-900 px-2 py-2 tabular-nums">{fmtTotal(totals.total)}</td>
                  <td className="text-center font-medium px-2 pr-4 py-2 tabular-nums" style={{ color: BAR_COLORS.drive, borderLeft: separatorLeft }}>{fmt(totals.drive)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.reg }} />
              <span className="text-[11px] text-gray-500">Regular</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.ot }} />
              <span className="text-[11px] text-gray-500">Overtime 1.5x</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.dt }} />
              <span className="text-[11px] text-gray-500">Double time 2x</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.drive }} />
              <span className="text-[11px] text-gray-500">Drive time (not in totals)</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimesheetsPageClient({
  initialTimecards,
  projects,
  allProjects,
  userId,
}: TimesheetsPageClientProps) {
  const router = useRouter()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const { settings: companySettings } = useCompanySettings()
  const canDownloadPdf = role === 'admin' || role === 'office_manager'
  const [showManageEmployees, setShowManageEmployees] = useState(false)
  const [downloadingWeek, setDownloadingWeek] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [filterProject, _setFilterProject] = useState<string>('')
  const [filterDateFrom, _setFilterDateFrom] = useState<string>('')
  const [filterDateTo, _setFilterDateTo] = useState<string>('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [expandedTimecardId, setExpandedTimecardId] = useState<string | null>(null)

  function handleToggleExpand(id: string) {
    setExpandedTimecardId((prev) => (prev === id ? null : id))
  }

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allProjects) map.set(p.id, p.status)
    return map
  }, [allProjects])


  const filtered = useMemo(() => {
    let result = initialTimecards

    if (filterProject) {
      result = result.filter((tc) => tc.project_name === filterProject)
    }

    if (filterDateFrom) {
      result = result.filter((tc) => {
        const d = tc.content.date || tc.created_at.slice(0, 10)
        return d >= filterDateFrom
      })
    }

    if (filterDateTo) {
      result = result.filter((tc) => {
        const d = tc.content.date || tc.created_at.slice(0, 10)
        return d <= filterDateTo
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((tc) => {
        return (
          tc.project_name.toLowerCase().includes(q) ||
          tc.content.date.includes(q) ||
          tc.content.entries.some((e) => e.employee_name.toLowerCase().includes(q))
        )
      })
    }

    return [...result].sort((a, b) => {
      switch (sortOption) {
        case 'newest': {
          const dateA = a.content.date || a.created_at.slice(0, 10)
          const dateB = b.content.date || b.created_at.slice(0, 10)
          return dateB.localeCompare(dateA)
        }
        case 'oldest': {
          const dateA = a.content.date || a.created_at.slice(0, 10)
          const dateB = b.content.date || b.created_at.slice(0, 10)
          return dateA.localeCompare(dateB)
        }
        case 'hours_high':
          return b.content.grand_total_hours - a.content.grand_total_hours
        case 'hours_low':
          return a.content.grand_total_hours - b.content.grand_total_hours
        case 'project_az':
          return a.project_name.localeCompare(b.project_name)
        default:
          return 0
      }
    })
  }, [initialTimecards, searchQuery, sortOption, filterProject, filterDateFrom, filterDateTo])

  const grouped = useMemo(() => groupByProjectAndWeek(filtered, sortOption), [filtered, sortOption])

  const inProgressGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) !== 'Completed'),
    [grouped, projectStatusMap]
  )
  const completedGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) === 'Completed'),
    [grouped, projectStatusMap]
  )

  function isProjectCollapsed(projectId: string, isCompleted: boolean) {
    if (projectId in collapsedProjects) return collapsedProjects[projectId]
    return isCompleted
  }

  function toggleProject(projectId: string, isCompleted: boolean) {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !(prev[projectId] ?? isCompleted),
    }))
  }

  async function handleDownloadWeekPdf(projectName: string, weekMonday: string, timecards: TimecardRow[]) {
    const key = `${projectName}-${weekMonday}`
    setDownloadingWeek(key)
    try {
      const { generateWeeklyTimesheetPdf } = await import('@/lib/generateWeeklyTimesheetPdf')
      await generateWeeklyTimesheetPdf(projectName, weekMonday, timecards, companySettings?.logo_url)
    } catch {
      // silently fail
    } finally {
      setDownloadingWeek(null)
    }
  }

  function renderProjectGroup(project: ProjectGroup, isCompleted: boolean) {
    const collapsed = isProjectCollapsed(project.projectId, isCompleted)

    return (
      <div key={project.projectId}>
        {/* Project header — collapsible with inline summary */}
        <button
          onClick={() => toggleProject(project.projectId, isCompleted)}
          className="flex items-center flex-wrap gap-1 md:gap-2 w-full max-w-full text-left py-1.5 group/proj"
        >
          <ChevronRightIcon
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
              !collapsed ? 'rotate-90' : ''
            }`}
          />
          <h2 className="text-base font-bold text-gray-900 truncate">{project.projectName}</h2>
          <span className="text-xs text-gray-400 md:whitespace-nowrap flex-shrink min-w-0">
            — {project.totalHours.toFixed(2)} hrs · {project.totalTimecards} timecard{project.totalTimecards !== 1 ? 's' : ''} · {project.totalEntries} {project.totalEntries === 1 ? 'entry' : 'entries'}
          </span>
        </button>

        {/* Week groups — shown when expanded */}
        {!collapsed && (
          <div className="ml-2 mt-1 space-y-2 mb-4 max-w-full">
            {project.weeks.map((week) => (
              <div key={week.weekMonday} className="bg-white border border-gray-200 rounded-lg overflow-hidden w-full max-w-full">
                {/* Week header */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-600">
                    {formatWeekRange(week.weekMonday)}
                  </span>
                  <div className="flex items-center gap-3">
                    {canDownloadPdf && (
                      <button
                        onClick={() => handleDownloadWeekPdf(project.projectName, week.weekMonday, week.timecards)}
                        disabled={downloadingWeek === `${project.projectName}-${week.weekMonday}`}
                        className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium disabled:opacity-50 transition"
                      >
                        {downloadingWeek === `${project.projectName}-${week.weekMonday}` ? (
                          <LoaderIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <DownloadIcon className="w-4 h-4" />
                        )}
                        Week PDF
                      </button>
                    )}
                    <span className="text-xs font-bold text-blue-700 tabular-nums">
                      {week.weekHours.toFixed(2)} hrs
                    </span>
                  </div>
                </div>
                {/* Timecard rows */}
                <div className="divide-y divide-gray-100">
                  {week.timecards.map((tc) => (
                    <TimecardCard key={tc.id} timecard={tc} expandedId={expandedTimecardId} onToggleExpand={handleToggleExpand} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowManageEmployees(true)}
            className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 p-2 md:p-2.5 rounded-lg transition"
            title="Manage Employees"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          {canCreate('timesheets') && (
            <button
              onClick={() => setShowModal(true)}
              disabled={projects.length === 0}
              title={projects.length === 0 ? 'Create a project first' : undefined}
              className="flex items-center gap-1.5 md:gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 md:px-4 md:py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              New
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-full md:max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Search & Sort Controls */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search project, employee, date..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Weekly Hours Summary — always use full unfiltered timecards */}
      {initialTimecards.length > 0 && (
        <WeeklyHoursSummary timecards={initialTimecards} />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClockIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">
            {searchQuery.trim() || filterProject || filterDateFrom || filterDateTo
              ? 'No timecards match your filters'
              : 'No timecards yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery.trim() || filterProject || filterDateFrom || filterDateTo
              ? 'Try a different search or filter.'
              : 'Create a timecard from a project feed to get started.'}
          </p>
        </div>
      ) : (
        <div>
          {/* In Progress section */}
          {inProgressGroups.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">In Progress</p>
              <div className="space-y-3">
                {inProgressGroups.map((project) => renderProjectGroup(project, false))}
              </div>
            </>
          )}

          {/* Completed section */}
          {completedGroups.length > 0 && (
            <div className={inProgressGroups.length > 0 ? 'border-t border-gray-200 mt-6 pt-4' : ''}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Completed</p>
              <div className="space-y-3">
                {completedGroups.map((project) => renderProjectGroup(project, true))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {showManageEmployees && (
        <ManageEmployeesModal onClose={() => setShowManageEmployees(false)} />
      )}

      {showModal && (
        <NewTimecardModal
          projects={projects}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
