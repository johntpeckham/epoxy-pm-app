'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  PencilIcon,
  Trash2Icon,
  DownloadIcon,
} from 'lucide-react'
import { DailyReportContent, DynamicFieldEntry } from '@/types'
import { groupDynamicFieldsBySection } from '@/lib/formFieldMaps'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditDailyReportModal from '@/components/feed/EditDailyReportModal'
import { useCompanySettings } from '@/lib/useCompanySettings'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import { moveToTrash } from '@/lib/trashBin'

interface DailyReportRow {
  id: string
  project_id: string
  created_at: string
  content: DailyReportContent
  dynamic_fields?: DynamicFieldEntry[]
  project_name: string
}

interface DailyReportCardProps {
  report: DailyReportRow
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

const progressFields: { label: string; key: keyof DailyReportContent }[] = [
  { label: 'Progress', key: 'progress' },
  { label: 'Delays', key: 'delays' },
  { label: 'Safety', key: 'safety' },
  { label: 'Materials Used', key: 'materials_used' },
  { label: 'Employees', key: 'employees' },
]

export default memo(function DailyReportCard({ report, expandedId, onToggleExpand }: DailyReportCardProps) {
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
  const HANDLED_SECTIONS = ['Header', 'Crew', 'Progress']

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

  // Resolve photo public URLs
  const photoUrls = (content.photos ?? []).map((path) => ({
    path,
    url: supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl,
  }))

  async function handleDelete() {
    setIsDeleting(true)
    const photos = content.photos ?? []
    if (photos.length > 0) {
      await supabase.storage.from('post-photos').remove(photos)
    }
    const { data: snapshot } = await supabase.from('feed_posts').select('*').eq('id', report.id).single()
    if (snapshot) {
      const itemName = 'Daily Report - ' + (content.date ?? new Date(report.created_at).toLocaleDateString())
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
      const { generateReportPdf } = await import('@/lib/generateReportPdf')
      const result = await generateReportPdf(content, photoUrls.map((p) => p.url), companySettings?.logo_url, report.dynamic_fields)
      setPdfPreview({ ...result, title: 'Daily Report' })
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
          <div className="flex-shrink-0 w-12 text-center bg-amber-50 rounded-lg py-2">
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
              <span className="text-sm font-semibold text-gray-900">{report.project_name}</span>
              {content.date && (
                <span className="text-xs text-gray-400">{formatReportDate(content.date)}</span>
              )}
              {photoUrls.length > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  {photoUrls.length} photo{photoUrls.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {content.reported_by && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">By:</span> {content.reported_by}
                </p>
              )}
              {content.project_foreman && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Foreman:</span> {content.project_foreman}
                </p>
              )}
              {content.weather && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Weather:</span> {content.weather}
                </p>
              )}
            </div>
            {content.progress && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{content.progress}</p>
            )}
          </div>
        </button>

        {/* Animated expand/collapse */}
        <div
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: expanded ? `${animHeight}px` : '0px' }}
        >
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-4 space-y-4">
            {/* Address */}
            {content.address && (
              <p className="text-xs text-amber-700">{content.address}</p>
            )}

            {/* Header section dynamic fields */}
            {(sectionGroups.get('Header') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Crew section dynamic fields */}
            {(sectionGroups.get('Crew') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Progress fields */}
            <dl className="space-y-3">
              {progressFields.map(({ label, key }) =>
                content[key] ? (
                  <div key={key}>
                    <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                      {label}
                    </dt>
                    <dd className="text-sm text-gray-700 whitespace-pre-wrap">{content[key]}</dd>
                  </div>
                ) : null
              )}
              {/* Progress section dynamic fields */}
              {(sectionGroups.get('Progress') ?? []).map((f) => (
                <div key={f.id}>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
                </div>
              ))}
            </dl>

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

            {/* Embedded photos */}
            {photoUrls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                  Photos
                </p>
                <div
                  className={`grid gap-2 ${
                    photoUrls.length === 1
                      ? 'grid-cols-1'
                      : photoUrls.length === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-2 sm:grid-cols-3'
                  }`}
                >
                  {photoUrls.map(({ path, url }) => (
                    <a key={path} href={url} target="_blank" rel="noopener noreferrer">
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-amber-100">
                        <Image
                          src={url}
                          alt="Report photo"
                          fill
                          className="object-cover hover:opacity-90 transition"
                          sizes="(max-width: 640px) 45vw, 220px"
                        />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

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
          title="Delete Daily Report"
          message="Are you sure you want to delete this daily report? Photos will be removed from storage. It will be moved to the trash bin and can be restored within 1 year."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditModal && (
        <EditDailyReportModal
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
          title="Daily Report"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </>
  )
})
