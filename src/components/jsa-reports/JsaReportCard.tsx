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
  ShieldIcon,
} from 'lucide-react'
import { JsaReportContent, DynamicFieldEntry } from '@/types'
import { groupDynamicFieldsBySection } from '@/lib/formFieldMaps'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditJsaReportModal from '@/components/feed/EditJsaReportModal'
import { useCompanySettings } from '@/lib/useCompanySettings'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import { moveToTrash } from '@/lib/trashBin'

interface JsaReportRow {
  id: string
  project_id: string
  created_at: string
  content: JsaReportContent
  dynamic_fields?: DynamicFieldEntry[]
  project_name: string
}

interface JsaReportCardProps {
  report: JsaReportRow
  expandedId: string | null
  onToggleExpand: (id: string) => void
}

function formatReportDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default memo(function JsaReportCard({ report, expandedId, onToggleExpand }: JsaReportCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()
  const expanded = expandedId === report.id
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = report
  const sectionGroups = groupDynamicFieldsBySection(report.dynamic_fields)
  const HANDLED_SECTIONS = ['Project Info', 'Personnel', 'Tasks', 'Employee Acknowledgment & Signatures']

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
    const { data: snapshot } = await supabase.from('feed_posts').select('*').eq('id', report.id).single()
    if (snapshot) {
      const itemName = 'JSA Report - ' + (content.date ?? new Date(report.created_at).toLocaleDateString())
      await moveToTrash(supabase, 'feed_post', report.id, itemName, snapshot.user_id, snapshot as Record<string, unknown>, report.project_name)
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
      const { generateJsaPdf } = await import('@/lib/generateJsaPdf')
      const result = await generateJsaPdf(content, companySettings?.logo_url, report.dynamic_fields)
      setPdfPreview({ ...result, title: 'JSA Report' })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white overflow-hidden group relative">
        {/* Summary row */}
        <button
          onClick={() => onToggleExpand(report.id)}
          className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
        >
          {/* Chevron on LEFT */}
          <div className="flex-shrink-0 mt-3">
            <ChevronRightIcon
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </div>

          {/* Date block */}
          <div className="flex-shrink-0 w-12 text-center bg-gray-50 border border-gray-200 rounded-lg py-2">
            <div className="text-xl font-bold text-gray-900 leading-none">
              {content.date ? content.date.split('-')[2] : '—'}
            </div>
            <div className="text-xs text-amber-600 mt-0.5 font-semibold uppercase">
              {content.date
                ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
                : ''}
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldIcon className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900">{report.project_name}</span>
              {content.date && (
                <span className="text-xs text-gray-400">{formatReportDate(content.date)}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {content.preparedBy && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">By:</span> {content.preparedBy}
                </p>
              )}
              {content.siteSupervisor && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Supervisor:</span> {content.siteSupervisor}
                </p>
              )}
              {content.weather && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Weather:</span> {content.weather}
                </p>
              )}
            </div>
            {content.tasks && content.tasks.length > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-1">
                {content.tasks.length} task{content.tasks.length !== 1 ? 's' : ''}: {content.tasks.map((t) => t.name).join(', ')}
              </p>
            )}
          </div>
        </button>

        {/* Animated expand/collapse */}
        <div
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: expanded ? `${animHeight}px` : '0px' }}
        >
          <div className="border-t border-gray-200 px-5 py-4 space-y-4">
            {/* Base fields */}
            {content.address && (
              <p className="text-xs text-amber-700">{content.address}</p>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {content.preparedBy && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Prepared By</dt>
                  <dd className="text-sm text-gray-700">{content.preparedBy}</dd>
                </div>
              )}
              {content.siteSupervisor && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Site Supervisor</dt>
                  <dd className="text-sm text-gray-700">{content.siteSupervisor}</dd>
                </div>
              )}
              {content.competentPerson && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Competent Person</dt>
                  <dd className="text-sm text-gray-700">{content.competentPerson}</dd>
                </div>
              )}
            </dl>

            {content.weather && (
              <div>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Weather</dt>
                <dd className="text-sm text-gray-700">{content.weather}</dd>
              </div>
            )}

            {/* Project Info section dynamic fields */}
            {(sectionGroups.get('Project Info') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Personnel section dynamic fields */}
            {(sectionGroups.get('Personnel') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Task sections */}
            {content.tasks && content.tasks.length > 0 && (
              <div className="space-y-4 pt-2">
                {content.tasks.map((task, i) => (
                  <div key={i} className="border border-amber-200 rounded-lg p-3 bg-white space-y-2">
                    <p className="text-sm font-bold text-amber-800">{task.name}</p>
                    {task.hazards && (
                      <div>
                        <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Hazards</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{task.hazards}</dd>
                      </div>
                    )}
                    {task.precautions && (
                      <div>
                        <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Precautions</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{task.precautions}</dd>
                      </div>
                    )}
                    {task.ppe && (
                      <div>
                        <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">PPE Required</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{task.ppe}</dd>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tasks section dynamic fields */}
            {(sectionGroups.get('Tasks') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Custom sections not in the hardcoded form */}
            {Array.from(sectionGroups.entries())
              .filter(([section]) => !HANDLED_SECTIONS.includes(section) && section !== '')
              .map(([section, fields]) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">{section}</p>
                  <dl className="space-y-3">
                    {fields.map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

            {/* Dynamic fields without a section (legacy data) */}
            {(sectionGroups.get('') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Signatures */}
            {(() => {
              const filled = (content.signatures ?? []).filter((s) => s.name || s.signature)
              return filled.length > 0 ? (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Employee Signatures</dt>
                  <div className="space-y-3">
                    {filled.map((sig, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {sig.signature && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sig.signature} alt={`Signature of ${sig.name}`} className="h-12 border border-gray-200 rounded bg-white" />
                        )}
                        {sig.name && <span className="text-sm text-gray-700 font-medium">{sig.name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            })()}

            {/* Footer actions — moved here from summary row */}
            <div className="pt-3 border-t border-amber-200 flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/projects/${report.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  title="Download PDF"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-md transition disabled:opacity-40"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  <span>{pdfLoading ? 'Generating...' : 'PDF'}</span>
                </button>
                <button
                  onClick={() => setShowEditModal(true)}
                  title="Edit report"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-md transition"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete report"
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
          title="Delete JSA Report"
          message="Are you sure you want to delete this JSA report? It will be moved to the trash bin and can be restored within 1 year."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditModal && (
        <EditJsaReportModal
          postId={report.id}
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
          title="JSA Report"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </>
  )
})
