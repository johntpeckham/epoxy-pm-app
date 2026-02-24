'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, ClipboardListIcon } from 'lucide-react'
import { Project, DailyReportContent } from '@/types'
import DailyReportCard from './DailyReportCard'
import NewDailyReportModal from './NewDailyReportModal'

interface DailyReportRow {
  id: string
  project_id: string
  created_at: string
  content: DailyReportContent
  project_name: string
}

interface DailyReportsPageClientProps {
  initialReports: DailyReportRow[]
  projects: Project[]
  userId: string
}

function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Group reports by project, then by date within each project. */
function groupByProjectAndDate(reports: DailyReportRow[]) {
  const projectMap = new Map<
    string,
    { projectName: string; dates: Map<string, DailyReportRow[]> }
  >()

  for (const report of reports) {
    let project = projectMap.get(report.project_id)
    if (!project) {
      project = { projectName: report.project_name, dates: new Map() }
      projectMap.set(report.project_id, project)
    }
    const dateKey = report.content.date || report.created_at.slice(0, 10)
    const existing = project.dates.get(dateKey) ?? []
    existing.push(report)
    project.dates.set(dateKey, existing)
  }

  // Sort projects alphabetically, dates newest-first
  return Array.from(projectMap.entries())
    .sort(([, a], [, b]) => a.projectName.localeCompare(b.projectName))
    .map(([projectId, project]) => ({
      projectId,
      projectName: project.projectName,
      dates: Array.from(project.dates.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, reports]) => ({ date, reports })),
    }))
}

export default function DailyReportsPageClient({
  initialReports,
  projects,
  userId,
}: DailyReportsPageClientProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const grouped = useMemo(() => groupByProjectAndDate(initialReports), [initialReports])

  function handleCreated() {
    setShowModal(false)
    router.refresh()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {initialReports.length} report{initialReports.length !== 1 ? 's' : ''} across {grouped.length} project
            {grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={projects.length === 0}
          title={projects.length === 0 ? 'Create a project first' : undefined}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          New Report
        </button>
      </div>

      {/* List — grouped by project then date */}
      {initialReports.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardListIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No daily reports yet</p>
          <p className="text-gray-400 text-sm mt-1">
            {projects.length > 0
              ? 'Click "New Report" to submit the first one.'
              : 'Create a project first, then submit daily reports.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((project) => (
            <div key={project.projectId}>
              {/* Project heading */}
              <h2 className="text-lg font-bold text-gray-900 mb-3">{project.projectName}</h2>

              <div className="space-y-4">
                {project.dates.map(({ date, reports }) => (
                  <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Date header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                      <span className="text-sm text-gray-400">&middot;</span>
                      <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                      <span className="text-xs text-gray-400">
                        ({reports.length} report{reports.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {/* Report cards within this date */}
                    <div className="divide-y divide-gray-100">
                      {reports.map((report) => (
                        <DailyReportCard key={report.id} report={report} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NewDailyReportModal
          projects={projects}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
