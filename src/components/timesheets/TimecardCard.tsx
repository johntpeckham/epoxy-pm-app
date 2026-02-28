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
} from 'lucide-react'
import { TimecardContent } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditTimecardModal from '@/components/feed/EditTimecardModal'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface TimecardRow {
  id: string
  project_id: string
  created_at: string
  content: TimecardContent
  project_name: string
}

interface TimecardCardProps {
  timecard: TimecardRow
}

function formatTimecardDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TimecardCard({ timecard }: TimecardCardProps) {
  const router = useRouter()
  const { settings: companySettings } = useCompanySettings()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = timecard

  async function handleDelete() {
    setIsDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('feed_posts').delete().eq('id', timecard.id)
    if (error) {
      console.error('[TimecardCard] Delete failed:', error)
      console.error('[TimecardCard] Error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    }
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateTimecardPdf } = await import('@/lib/generateTimecardPdf')
      await generateTimecardPdf(content, companySettings?.logo_url)
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
          <div className="flex-shrink-0 w-12 text-center bg-blue-50 rounded-lg py-2">
            <div className="text-xl font-bold text-gray-900 leading-none">
              {content.date ? content.date.split('-')[2] : '—'}
            </div>
            <div className="text-xs text-blue-600 mt-0.5 font-semibold uppercase">
              {content.date
                ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
                : ''}
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{timecard.project_name}</span>
              {content.date && (
                <span className="text-xs text-gray-400">{formatTimecardDate(content.date)}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              <p className="text-xs text-gray-500">
                <span className="font-medium">{content.entries.length}</span> employee{content.entries.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs font-bold text-blue-700 tabular-nums">
                {content.grand_total_hours.toFixed(2)} total hours
              </p>
            </div>
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
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-md transition sm:border-0 sm:p-1.5 disabled:opacity-40"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">{pdfLoading ? 'Generating…' : 'PDF'}</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            title="Edit timecard"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Edit</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete timecard"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 hover:bg-red-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Delete</span>
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-blue-100 bg-blue-50 px-5 py-4 space-y-4">
            {content.address && (
              <p className="text-xs text-blue-700">{content.address}</p>
            )}

            {/* Employee time table */}
            {content.entries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-200">
                      <th className="text-left py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Employee</th>
                      <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Time In</th>
                      <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Time Out</th>
                      <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Lunch</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.entries.map((entry, i) => (
                      <tr key={i} className={i < content.entries.length - 1 ? 'border-b border-blue-100' : ''}>
                        <td className="py-2 px-2 text-sm text-gray-900 font-medium">{entry.employee_name}</td>
                        <td className="py-2 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.time_in}</td>
                        <td className="py-2 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.time_out}</td>
                        <td className="py-2 px-2 text-sm text-gray-700 text-center tabular-nums">{entry.lunch_minutes} min</td>
                        <td className="py-2 px-2 text-sm text-gray-900 text-right font-bold tabular-nums">{entry.total_hours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-blue-200">
                      <td colSpan={4} className="py-2 px-2 text-sm font-semibold text-blue-800">Grand Total</td>
                      <td className="py-2 px-2 text-sm font-bold text-blue-900 text-right tabular-nums">{content.grand_total_hours.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Footer actions */}
            <div className="pt-3 border-t border-blue-200 flex items-center justify-between flex-wrap gap-2">
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
}
