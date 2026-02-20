'use client'

import { useState } from 'react'
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

export default function DailyReportsPageClient({
  initialReports,
  projects,
  userId,
}: DailyReportsPageClientProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

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
            {initialReports.length} report{initialReports.length !== 1 ? 's' : ''} across all projects
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

      {/* List */}
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
        <div className="space-y-3">
          {initialReports.map((report) => (
            <DailyReportCard key={report.id} report={report} />
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
