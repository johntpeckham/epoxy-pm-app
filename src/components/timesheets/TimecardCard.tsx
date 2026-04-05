'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRightIcon,
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
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import { moveToTrash } from '@/lib/trashBin'

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
  expandedId: string | null
  onToggleExpand: (id: string) => void
}

function formatCompactDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default memo(function TimecardCard({ timecard, expandedId, onToggleExpand }: TimecardCardProps) {
  const router = useRouter()
  const { settings: companySettings } = useCompanySettings()
  const expanded = expandedId === timecard.id
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = timecard
  const sectionGroups = groupDynamicFieldsBySection(timecard.dynamic_fields)
  const HANDLED_SECTIONS = ['Project Info', 'Employees']

  // Animation refs
  const contentRef = useRef<HTMLDivElement>(null)
  const [animHeight, setAnimHeight] = useState<number>(0)

  useEffect(() => {
    if (expanded && contentRef.current) {
      setAnimHeight(contentRef.current.scrollHeight)
    } else {
      setAnimHeight(0)
    }
  }, [expanded])

  async function handleDelete() {
    setIsDeleting(true)
    const supabase = createClient()
    const { data: snapshot } = await supabase.from('feed_posts').select('*').eq('id', timecard.id).single()
    if (snapshot) {
      const itemName = 'Timecard - ' + (content.date ?? new Date(timecard.created_at).toLocaleDateString())
      await moveToTrash(supabase, 'feed_post', timecard.id, itemName, snapshot.user_id, snapshot as Record<string, unknown>, timecard.project_name)
    }
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  async function handleDownloadPdf() {
    setPdfLoading(true)
    setPdfError(null)
    setShowPreview(true)
    setPdfPreview(null)
    try {
      const { generateTimecardPdf } = await import('@/lib/generateTimecardPdf')
      const result = await generateTimecardPdf(content, companySettings?.logo_url, timecard.dynamic_fields)
      setPdfPreview({ ...result, title: 'Timecard' })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
      <div className="group relative w-full max-w-full">
        {/* Compact summary row */}
        <button
          onClick={() => onToggleExpand(timecard.id)}
          className="w-full max-w-full text-left px-2 md:px-3 py-2 flex items-center gap-1.5 md:gap-3 hover:bg-gray-50 transition-colors flex-wrap"
        >
          {/* Chevron on LEFT */}
          <ChevronRightIcon
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            }`}
          />

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
        </button>

        {/* Animated expand/collapse */}
        <div
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: expanded ? `${animHeight}px` : '0px' }}
        >
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

            {/* Footer actions — moved here from summary row */}
            <div className="pt-2 border-t border-blue-200 flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/projects/${timecard.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  title="Download PDF"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-md transition"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  <span>{pdfLoading ? 'Generating...' : 'PDF'}</span>
                </button>
                <button
                  onClick={() => setShowEditModal(true)}
                  title="Edit"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-md transition"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Timecard"
          message="Are you sure you want to delete this timecard? It will be moved to the trash bin and can be restored within 1 year."
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

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          loading={pdfLoading}
          error={pdfError}
          title="Timecard"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </>
  )
})
