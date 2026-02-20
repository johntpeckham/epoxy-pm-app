'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
import { DailyReportContent } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditDailyReportModal from '@/components/feed/EditDailyReportModal'

interface DailyReportRow {
  id: string
  project_id: string
  created_at: string
  content: DailyReportContent
  project_name: string
}

interface DailyReportCardProps {
  report: DailyReportRow
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

export default function DailyReportCard({ report }: DailyReportCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = report

  // Resolve photo public URLs
  const photoUrls = (content.photos ?? []).map((path) => ({
    path,
    url: supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl,
  }))

  async function handleDelete() {
    setIsDeleting(true)
    // Delete storage photos
    const photos = content.photos ?? []
    if (photos.length > 0) {
      await supabase.storage.from('post-photos').remove(photos)
    }
    await supabase.from('feed_posts').delete().eq('id', report.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateReportPdf } = await import('@/lib/generateReportPdf')
      await generateReportPdf(content, photoUrls.map((p) => p.url))
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden group relative">
        {/* Summary row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
        >
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

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-gray-400 mt-1">
            {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </div>
        </button>

        {/* Action buttons — hover on desktop, visible on mobile */}
        <div className="flex items-center gap-1 px-4 pb-3 sm:absolute sm:top-3 sm:right-10 sm:pb-0 sm:px-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            title="Download PDF"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 rounded-md transition sm:border-0 sm:p-1.5 disabled:opacity-40"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">{pdfLoading ? 'Generating…' : 'PDF'}</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            title="Edit report"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Edit</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete report"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 hover:bg-red-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Delete</span>
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-4 space-y-4">
            {/* Address */}
            {content.address && (
              <p className="text-xs text-amber-700">{content.address}</p>
            )}

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
            </dl>

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

            {/* Footer actions */}
            <div className="pt-3 border-t border-amber-200 flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/projects/${report.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-40"
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
          title="Delete Daily Report"
          message="Are you sure you want to delete this daily report? Photos will also be removed. This cannot be undone."
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
    </>
  )
}
