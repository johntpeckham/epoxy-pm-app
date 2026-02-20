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
  // dateStr is YYYY-MM-DD from the form
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const detailFields: { label: string; key: keyof DailyReportContent }[] = [
  { label: 'Surface Prep Notes', key: 'surface_prep_notes' },
  { label: 'Epoxy Product Used', key: 'epoxy_product_used' },
  { label: 'Coats Applied', key: 'coats_applied' },
  { label: 'Weather Conditions', key: 'weather_conditions' },
  { label: 'Additional Notes', key: 'additional_notes' },
]

export default function DailyReportCard({ report }: DailyReportCardProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const { content } = report

  async function handleDelete() {
    setIsDeleting(true)
    const supabase = createClient()
    await supabase.from('feed_posts').delete().eq('id', report.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
        {/* Summary row — always visible, click to expand */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
        >
          {/* Date block */}
          <div className="flex-shrink-0 w-14 text-center">
            <div className="text-xl font-bold text-gray-900 leading-none">
              {content.date ? content.date.split('-')[2] : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">
              {content.date
                ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
                : ''}
            </div>
            <div className="text-xs text-gray-400">
              {content.date ? content.date.split('-')[0] : ''}
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{report.project_name}</span>
              {content.date && (
                <span className="text-xs text-gray-400">{formatReportDate(content.date)}</span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-0.5 truncate">
              <span className="font-medium text-gray-700">Crew:</span> {content.crew_members || '—'}
            </p>
            {content.epoxy_product_used && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {content.epoxy_product_used}
                {content.coats_applied ? ` · ${content.coats_applied}` : ''}
              </p>
            )}
          </div>

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-gray-400 mt-0.5">
            {expanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </div>
        </button>

        {/* Edit / Delete buttons — hover on desktop, always visible on mobile */}
        <div className="flex items-center gap-1 px-4 pb-3 sm:absolute sm:top-3 sm:right-3 sm:pb-0 sm:px-0 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
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
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-4">
            <dl className="space-y-3">
              {detailFields.map(({ label, key }) =>
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
            <div className="mt-4 pt-3 border-t border-amber-200">
              <Link
                href={`/projects/${report.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Daily Report"
          message="Are you sure you want to delete this daily report? This cannot be undone."
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
