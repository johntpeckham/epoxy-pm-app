'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon, SettingsIcon, PlusIcon } from 'lucide-react'
import { Project, TimecardContent, DynamicFieldEntry } from '@/types'
import TimecardCard from './TimecardCard'
import ManageEmployeesModal from './ManageEmployeesModal'
import NewTimecardModal from './NewTimecardModal'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'

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
  const [showManageEmployees, setShowManageEmployees] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allProjects) map.set(p.id, p.status)
    return map
  }, [allProjects])

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    initialTimecards.forEach((tc) => names.add(tc.project_name))
    return Array.from(names).sort()
  }, [initialTimecards])

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
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) !== 'Complete'),
    [grouped, projectStatusMap]
  )
  const completedGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) === 'Complete'),
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
                  <span className="text-xs font-bold text-blue-700 tabular-nums">
                    {week.weekHours.toFixed(2)} hrs
                  </span>
                </div>
                {/* Timecard rows */}
                <div className="divide-y divide-gray-100">
                  {week.timecards.map((tc) => (
                    <TimecardCard key={tc.id} timecard={tc} />
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
    <div className="w-full max-w-full md:max-w-3xl mx-auto px-4 py-6 sm:px-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} timecard{filtered.length !== 1 ? 's' : ''} across {grouped.length} project
            {grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowManageEmployees(true)}
            className="flex items-center gap-1.5 md:gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 md:px-4 md:py-2.5 rounded-lg text-sm font-semibold transition"
          >
            <SettingsIcon className="w-4 h-4" />
            Manage Employees
          </button>
          {canCreate('timesheets') && (
            <button
              onClick={() => setShowModal(true)}
              disabled={projects.length === 0}
              title={projects.length === 0 ? 'Create a project first' : undefined}
              className="flex items-center gap-1.5 md:gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 md:px-4 md:py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              New Timesheet
            </button>
          )}
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-0 md:min-w-[180px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search project, employee, date..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
          >
            <option value="">All Projects</option>
            {projectNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear dates
          </button>
        )}
      </div>

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
