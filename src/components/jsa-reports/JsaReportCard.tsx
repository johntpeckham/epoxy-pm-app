'use client'

import { useState } from 'react'
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
  ShieldIcon,
} from 'lucide-react'
import { JsaReportContent } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditJsaReportModal from '@/components/feed/EditJsaReportModal'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface JsaReportRow {
  id: string
  project_id: string
  created_at: string
  content: JsaReportContent
  project_name: string
}

interface JsaReportCardProps {
  report: JsaReportRow
}

function formatReportDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function JsaReportCard({ report }: JsaReportCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = report

  async function handleDelete() {
    setIsDeleting(true)
    await supabase.from('feed_posts').delete().eq('id', report.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateJsaPdf } = await import('@/lib/generateJsaPdf')
      await generateJsaPdf(content, companySettings?.logo_url)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white overflow-hidden group relative">
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

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-gray-400 mt-1">
            {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-1 px-4 pb-3 sm:absolute sm:top-3 sm:right-10 sm:pb-0 sm:px-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            title="Download PDF"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 rounded-md transition sm:border-0 sm:p-1.5 disabled:opacity-40"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">{pdfLoading ? 'Generating...' : 'PDF'}</span>
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
                {pdfLoading ? 'Generating PDF...' : 'Download PDF'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete JSA Report"
          message="Are you sure you want to delete this JSA report? This cannot be undone."
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
    </>
  )
}
