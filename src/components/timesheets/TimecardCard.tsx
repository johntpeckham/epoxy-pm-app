'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PencilIcon,
  Trash2Icon,
  DownloadIcon,
} from 'lucide-react'
import { TimecardContent, DynamicFieldEntry } from '@/types'
import { groupDynamicFieldsBySection } from '@/lib/formFieldMaps'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditTimecardModal from '@/components/feed/EditTimecardModal'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface TimecardRow {
  id: string
  project_id: string
  created_at: string
  content: TimecardContent
  dynamic_fields?: DynamicFieldEntry[]
  project_name: string
}

interface TimecardCardProps {
  timecard: TimecardRow
}

function formatCompactDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default memo(function TimecardCard({ timecard }: TimecardCardProps) {
  const router = useRouter()
  const { settings: companySettings } = useCompanySettings()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = timecard
  const sectionGroups = groupDynamicFieldsBySection(timecard.dynamic_fields)
  const HANDLED_SECTIONS = ['Project Info', 'Employees']

  async function handleDelete() {
    setIsDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('feed_posts').delete().eq('id', timecard.id)
    if (error) {
      console.error('[TimecardCard] Delete failed:', error)
    }
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateTimecardPdf } = await import('@/lib/generateTimecardPdf')
      await generateTimecardPdf(content, companySettings?.logo_url, timecard.dynamic_fields)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
      <div className="group relative w-full max-w-full">
        {/* Compact summary row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full max-w-full text-left px-2 md:px-3 py-2 flex items-center gap-1.5 md:gap-3 hover:bg-gray-50 transition-colors flex-wrap"
        >
          <span className="text-sm text-gray-700 whitespace-nowrap">
            {content.date ? formatCompactDate(content.date) : '—'}
          </span>
          <span className="text-xs text-gray-400">&middot;</span>
          <span className="text-xs text-gray-500">
            {content.entries.length} employee{content.entries.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-400">&middot;</span>
          <span className="text-xs font-bold text-blue-700 tabular-nums">
            {content.grand_total_hours.toFixed(2)} hrs
          </span>

          {/* Action buttons — inline on mobile, hover-reveal on desktop */}
          <span
            className="ml-auto flex items-center gap-0 md:gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              role="button"
              onClick={handleDownloadPdf}
              className="p-0.5 md:p-1 text-gray-400 hover:text-blue-600 rounded transition"
              title="Download PDF"
            >
              <DownloadIcon className="w-3 h-3 md:w-3.5 md:h-3.5" />
            </span>
            <span
              role="button"
              onClick={() => setShowEditModal(true)}
              className="p-2 md:p-1 text-gray-400 hover:text-blue-600 rounded transition"
              title="Edit"
            >
              <PencilIcon className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </span>
            <span
              role="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 md:p-1 text-gray-400 hover:text-red-600 rounded transition"
              title="Delete"
            >
              <Trash2Icon className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </span>
          </span>

          <span className="flex-shrink-0 text-gray-400">
            {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </span>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-blue-100 bg-blue-50 px-2 md:px-4 py-3 space-y-3 max-w-full">
            {content.address && (
              <p className="text-xs text-blue-700">{content.address}</p>
            )}

            {/* Project Info section dynamic fields */}
            {(sectionGroups.get('Project Info') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Employee time table */}
            {content.entries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-200">
                      <th className="text-left py-1 px-2 font-semibold text-blue-700 uppercase tracking-wide">Employee</th>
                      <th className="text-center py-1 px-2 font-semibold text-blue-700 uppercase tracking-wide">In</th>
                      <th className="text-center py-1 px-2 font-semibold text-blue-700 uppercase tracking-wide">Out</th>
                      <th className="text-center py-1 px-2 font-semibold text-blue-700 uppercase tracking-wide">Lunch</th>
                      <th className="text-right py-1 px-2 font-semibold text-blue-700 uppercase tracking-wide">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.entries.map((entry, i) => (
                      <tr key={i} className={i < content.entries.length - 1 ? 'border-b border-blue-100' : ''}>
                        <td className="py-1.5 px-2 text-sm text-gray-900 font-medium">{entry.employee_name}</td>
                        <td className="py-1.5 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.time_in}</td>
                        <td className="py-1.5 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.time_out}</td>
                        <td className="py-1.5 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.lunch_minutes} min</td>
                        <td className="py-1.5 px-2 text-sm text-gray-900 text-right font-bold tabular-nums">{entry.total_hours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-blue-200">
                      <td colSpan={4} className="py-1.5 px-2 text-sm font-semibold text-blue-800">Grand Total</td>
                      <td className="py-1.5 px-2 text-sm font-bold text-blue-900 text-right tabular-nums">{content.grand_total_hours.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Employees section dynamic fields */}
            {(sectionGroups.get('Employees') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Custom sections not in the hardcoded form */}
            {Array.from(sectionGroups.entries())
              .filter(([section]) => !HANDLED_SECTIONS.includes(section) && section !== '')
              .map(([section, fields]) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">{section}</p>
                  <dl className="space-y-2">
                    {fields.map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

            {/* Dynamic fields without a section (legacy data) */}
            {(sectionGroups.get('') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Footer actions */}
            <div className="pt-2 border-t border-blue-200 flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/projects/${timecard.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors disabled:opacity-40"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Timecard"
          message="Are you sure you want to delete this timecard? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditModal && (
        <EditTimecardModal
          postId={timecard.id}
          initialContent={content}
          onClose={() => setShowEditModal(false)}
          onUpdated={() => {
            setShowEditModal(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
})
