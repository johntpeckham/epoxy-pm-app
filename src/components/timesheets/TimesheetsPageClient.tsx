'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, SearchIcon, ChevronDownIcon, SettingsIcon } from 'lucide-react'
import { Project, TimecardContent } from '@/types'
import TimecardCard from './TimecardCard'
import ManageEmployeesModal from './ManageEmployeesModal'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'

interface TimecardRow {
  id: string
  project_id: string
  created_at: string
  content: TimecardContent
  project_name: string
}

interface TimesheetsPageClientProps {
  initialTimecards: TimecardRow[]
  projects: Project[]
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

function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function groupByProjectAndDate(timecards: TimecardRow[], sort: SortOption) {
  const projectMap = new Map<
    string,
    { projectName: string; dates: Map<string, TimecardRow[]>; latestDate: string; oldestDate: string; totalHours: number }
  >()

  for (const tc of timecards) {
    let project = projectMap.get(tc.project_id)
    const dateKey = tc.content.date || tc.created_at.slice(0, 10)
    if (!project) {
      project = { projectName: tc.project_name, dates: new Map(), latestDate: dateKey, oldestDate: dateKey, totalHours: 0 }
      projectMap.set(tc.project_id, project)
    }
    if (dateKey > project.latestDate) project.latestDate = dateKey
    if (dateKey < project.oldestDate) project.oldestDate = dateKey
    project.totalHours += tc.content.grand_total_hours
    const existing = project.dates.get(dateKey) ?? []
    existing.push(tc)
    project.dates.set(dateKey, existing)
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
      dates: Array.from(project.dates.entries())
        .sort(([a], [b]) => a.localeCompare(b) * dateDir)
        .map(([date, timecards]) => ({ date, timecards })),
    }))
}

export default function TimesheetsPageClient({
  initialTimecards,
  projects,
  userId,
}: TimesheetsPageClientProps) {
  const router = useRouter()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const [showManageEmployees, setShowManageEmployees] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')

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

  const totalHours = useMemo(
    () => Math.round(filtered.reduce((sum, tc) => sum + tc.content.grand_total_hours, 0) * 100) / 100,
    [filtered]
  )

  const totalEmployeeEntries = useMemo(
    () => filtered.reduce((sum, tc) => sum + tc.content.entries.length, 0),
    [filtered]
  )

  const grouped = useMemo(() => groupByProjectAndDate(filtered, sortOption), [filtered, sortOption])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} timecard{filtered.length !== 1 ? 's' : ''} across {grouped.length} project
            {grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowManageEmployees(true)}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition"
        >
          <SettingsIcon className="w-4 h-4" />
          Manage Employees
        </button>
      </div>

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Total Hours</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalHours.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-blue-600">{filtered.length} timecard{filtered.length !== 1 ? 's' : ''}</p>
          <p className="text-xs text-blue-600">{totalEmployeeEntries} employee entries</p>
          {(filterProject || filterDateFrom || filterDateTo) && (
            <p className="text-xs text-blue-500 mt-0.5">Filtered</p>
          )}
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[180px]">
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
        <div className="space-y-8">
          {grouped.map((project) => (
            <div key={project.projectId}>
              <h2 className="text-lg font-bold text-gray-900 mb-3">{project.projectName}</h2>

              <div className="space-y-4">
                {project.dates.map(({ date, timecards }) => (
                  <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Date header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                      <span className="text-sm text-gray-400">&middot;</span>
                      <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                      <span className="text-xs text-gray-400">
                        ({timecards.length} timecard{timecards.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {/* Timecard cards within this date */}
                    <div className="divide-y divide-gray-100">
                      {timecards.map((tc) => (
                        <TimecardCard key={tc.id} timecard={tc} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showManageEmployees && (
        <ManageEmployeesModal onClose={() => setShowManageEmployees(false)} />
      )}
    </div>
  )
}
