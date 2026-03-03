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
import { ReceiptContent } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditReceiptModal from '@/components/feed/EditReceiptModal'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface ReceiptRow {
  id: string
  project_id: string
  created_at: string
  content: ReceiptContent
  project_name: string
}

interface ReceiptCardProps {
  receipt: ReceiptRow
}

function formatReceiptDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const { content } = receipt

  // Resolve photo public URL
  const photoUrl = content.receipt_photo
    ? supabase.storage.from('post-photos').getPublicUrl(content.receipt_photo).data.publicUrl
    : null

  async function handleDelete() {
    setIsDeleting(true)
    if (content.receipt_photo) {
      await supabase.storage.from('post-photos').remove([content.receipt_photo])
    }
    await supabase.from('feed_posts').delete().eq('id', receipt.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    router.refresh()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateReceiptPdf } = await import('@/lib/generateReceiptPdf')
      await generateReceiptPdf(content, photoUrl, companySettings?.logo_url)
    } finally {
      setPdfLoading(false)
    }
  }

  const shortDate = content.receipt_date
    ? new Date(content.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'

  return (
    <>
      <div className="bg-white overflow-hidden">
        {/* Compact summary row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
        >
          {/* Date */}
          <span className="flex-shrink-0 text-xs text-gray-500 tabular-nums w-12">{shortDate}</span>

          {/* Vendor + category */}
          <span className="flex-1 min-w-0 flex items-center gap-2 truncate">
            <span className="text-sm text-gray-900 truncate">{content.vendor_name || '—'}</span>
            {content.category && (
              <span className="flex-shrink-0 text-[11px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">{content.category}</span>
            )}
          </span>

          {/* Amount */}
          <span className="flex-shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
            {content.total_amount ? `$${content.total_amount.toFixed(2)}` : ''}
          </span>

          {/* Thumbnail */}
          {photoUrl && (
            <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100">
              <Image src={photoUrl} alt="" width={32} height={32} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-gray-400">
            {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-green-100 bg-green-50 px-4 py-3 space-y-3">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {content.vendor_name ? (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Vendor / Store</dt>
                  <dd className="text-sm text-gray-700">{content.vendor_name}</dd>
                </div>
              ) : null}
              {content.receipt_date ? (
                <div>
                  <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Date</dt>
                  <dd className="text-sm text-gray-700 tabular-nums">{formatReceiptDate(content.receipt_date)}</dd>
                </div>
              ) : null}
              {content.total_amount ? (
                <div>
                  <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Total Amount</dt>
                  <dd className="text-sm text-gray-900 font-bold tabular-nums">${content.total_amount.toFixed(2)}</dd>
                </div>
              ) : null}
              {content.category ? (
                <div>
                  <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Category</dt>
                  <dd className="text-sm text-gray-700">{content.category}</dd>
                </div>
              ) : null}
            </dl>

            {/* Receipt photo */}
            {photoUrl && (
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Receipt Image</p>
                <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                  <div className="relative w-48 h-48 rounded-lg overflow-hidden bg-green-100">
                    <Image
                      src={photoUrl}
                      alt="Receipt photo"
                      fill
                      className="object-cover hover:opacity-90 transition"
                      sizes="192px"
                    />
                  </div>
                </a>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-green-200 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 transition-colors disabled:opacity-40"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Delete
              </button>
              <Link
                href={`/projects/${receipt.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 transition-colors ml-auto"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project
              </Link>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Expense"
          message="Are you sure you want to delete this expense? The receipt photo will also be removed. This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditModal && (
        <EditReceiptModal
          postId={receipt.id}
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
