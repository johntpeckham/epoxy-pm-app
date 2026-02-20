export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import DailyReportCard from '@/components/daily-reports/DailyReportCard'
import { DailyReportContent } from '@/types'

export default async function DailyReportsPage() {
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('feed_posts')
    .select('id, project_id, created_at, content, projects(name)')
    .eq('post_type', 'daily_report')
    .order('created_at', { ascending: false })

  // Flatten the joined project name and sort by report date descending
  const reports = (posts ?? [])
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      created_at: row.created_at,
      content: row.content as DailyReportContent,
      project_name: (row.projects as unknown as { name: string }[] | null)?.[0]?.name ?? 'Unknown Project',
    }))
    .sort((a, b) => {
      // Sort by the report's date field (YYYY-MM-DD) if present, else fall back to created_at
      const dateA = a.content.date || a.created_at.slice(0, 10)
      const dateB = b.content.date || b.created_at.slice(0, 10)
      return dateB.localeCompare(dateA)
    })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {reports.length} report{reports.length !== 1 ? 's' : ''} across all projects
        </p>
      </div>

      {/* List */}
      {reports.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No daily reports yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Reports submitted in project feeds will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <DailyReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  )
}
