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

  return (
    <>
      <div className="bg-white overflow-hidden group relative">
        {/* Summary row */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
        >
          {/* Date block */}
          <div className="flex-shrink-0 w-12 text-center bg-green-50 rounded-lg py-2">
            <div className="text-xl font-bold text-gray-900 leading-none">
              {content.receipt_date ? content.receipt_date.split('-')[2] : '—'}
            </div>
            <div className="text-xs text-green-600 mt-0.5 font-semibold uppercase">
              {content.receipt_date
                ? new Date(content.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
                : ''}
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{receipt.project_name}</span>
              {content.receipt_date && (
                <span className="text-xs text-gray-400">{formatReceiptDate(content.receipt_date)}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {content.vendor_name ? (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Vendor:</span> {content.vendor_name}
                </p>
              ) : null}
              {content.total_amount ? (
                <p className="text-xs text-gray-900 font-bold tabular-nums">
                  ${content.total_amount.toFixed(2)}
                </p>
              ) : null}
              {content.category ? (
                <p className="text-xs text-green-600 font-medium">
                  {content.category}
                </p>
              ) : null}
            </div>
          </div>

          {/* Thumbnail */}
          {photoUrl && (
            <div className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden bg-green-50 hidden sm:block">
              <Image
                src={photoUrl}
                alt="Receipt"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-gray-400 mt-1">
            {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </div>
        </button>

        {/* Action buttons — visible on mobile, hover-reveal on desktop */}
        <div className="flex items-center gap-1 px-4 pb-3 sm:px-5 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            title="Download PDF"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 hover:bg-green-50 rounded-md transition sm:border-0 sm:p-1.5 disabled:opacity-40"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">{pdfLoading ? 'Generating…' : 'PDF'}</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            title="Edit receipt"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 hover:bg-green-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Edit</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete receipt"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 hover:bg-red-50 rounded-md transition sm:border-0 sm:p-1.5"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            <span className="sm:hidden">Delete</span>
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-green-100 bg-green-50 px-5 py-4 space-y-4">
            <dl className="space-y-3">
              {content.vendor_name ? (
                <div>
                  <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Vendor / Store</dt>
                  <dd className="text-sm text-gray-700">{content.vendor_name}</dd>
                </div>
              ) : null}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              </div>
            </dl>

            {/* Receipt photo */}
            {photoUrl && (
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Receipt Image</p>
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

            {/* Footer actions */}
            <div className="pt-3 border-t border-green-200 flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/projects/${receipt.project_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                View in project feed
              </Link>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 transition-colors disabled:opacity-40"
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
          title="Delete Receipt"
          message="Are you sure you want to delete this receipt? The receipt photo will also be removed. This cannot be undone."
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
