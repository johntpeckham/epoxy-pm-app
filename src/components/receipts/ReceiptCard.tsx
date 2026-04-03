'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PencilIcon,
  Trash2Icon,
  DownloadIcon,
  CameraIcon,
  CircleIcon,
} from 'lucide-react'
import { ReceiptContent, DynamicFieldEntry, UserRole } from '@/types'
import { groupDynamicFieldsBySection } from '@/lib/formFieldMaps'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditReceiptModal from '@/components/feed/EditReceiptModal'
import { useCompanySettings } from '@/lib/useCompanySettings'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import { moveToTrash } from '@/lib/trashBin'

interface ReceiptRow {
  id: string
  project_id: string
  created_at: string
  content: ReceiptContent
  dynamic_fields?: DynamicFieldEntry[]
  confirmed: boolean
  restricted: boolean
  project_name: string
}

interface ReceiptCardProps {
  receipt: ReceiptRow
  role: UserRole
}

function formatReceiptDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default memo(function ReceiptCard({ receipt, role }: ReceiptCardProps) {
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()
  const [expanded, setExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(receipt.confirmed)

  const canConfirm = role === 'admin' || role === 'office_manager'

  async function handleToggleConfirmed(e: React.MouseEvent) {
    e.stopPropagation()
    const newValue = !confirmed
    setConfirmed(newValue)
    await supabase.from('feed_posts').update({ confirmed: newValue }).eq('id', receipt.id)
  }
  const { content } = receipt
  const sectionGroups = groupDynamicFieldsBySection(receipt.dynamic_fields)
  const HANDLED_SECTIONS = ['Receipt Photo', 'Receipt Details']

  // Resolve photo public URL
  const photoUrl = content.receipt_photo
    ? supabase.storage.from('post-photos').getPublicUrl(content.receipt_photo).data.publicUrl
    : null

  async function handleDelete() {
    setIsDeleting(true)
    if (content.receipt_photo) {
      await supabase.storage.from('post-photos').remove([content.receipt_photo])
    }
    const { data: snapshot } = await supabase.from('feed_posts').select('*').eq('id', receipt.id).single()
    if (snapshot) {
      const itemName = 'Receipt - ' + (content.vendor_name ?? '') + ' ' + (content.receipt_date ?? new Date(receipt.created_at).toLocaleDateString())
      await moveToTrash(supabase, 'feed_post', receipt.id, itemName, snapshot.user_id, snapshot as Record<string, unknown>, receipt.project_name)
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
      const { generateReceiptPdf } = await import('@/lib/generateReceiptPdf')
      const result = await generateReceiptPdf(content, photoUrl, companySettings?.logo_url, receipt.dynamic_fields)
      setPdfPreview({ ...result, title: 'Expense Receipt' })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
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
        {/* Compact summary row — mobile: original flex layout */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-4 py-2.5 flex lg:hidden items-center gap-3 hover:bg-gray-50 transition-colors"
        >
          <span className="flex-shrink-0 text-xs text-gray-500 tabular-nums w-12">{shortDate}</span>
          <span className="flex-1 min-w-0 flex items-center gap-2 truncate">
            <span className="text-sm text-gray-900 truncate">{content.vendor_name || '—'}</span>
            {content.category && (
              <span className="flex-shrink-0 text-[11px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">{content.category}</span>
            )}
          </span>
          {confirmed && <CheckIcon className="flex-shrink-0 w-4 h-4 text-green-600" />}
          <span className="flex-shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
            {content.total_amount ? `$${content.total_amount.toFixed(2)}` : ''}
          </span>
          {photoUrl && (
            <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100">
              <Image src={photoUrl} alt="" width={32} height={32} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-shrink-0 text-gray-400">
            {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </div>
        </button>

        {/* Compact summary row — desktop: column-aligned grid */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-4 py-2.5 hidden lg:grid hover:bg-gray-50 transition-colors items-center"
          style={{ gridTemplateColumns: '4.5rem 1fr 5.5rem 5.5rem 2.75rem 2.75rem 1.5rem' }}
        >
          {/* Date */}
          <span className="text-xs text-gray-500 tabular-nums truncate">{shortDate}</span>
          {/* Vendor */}
          <span className="text-sm text-gray-900 truncate pr-2">{content.vendor_name || <span className="text-gray-300">&mdash;</span>}</span>
          {/* Category */}
          <span className="text-center">
            {content.category
              ? <span className="text-[11px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">{content.category}</span>
              : <span className="text-gray-300 text-xs">&mdash;</span>}
          </span>
          {/* Amount */}
          <span className="text-sm font-semibold text-gray-900 tabular-nums text-right">
            {content.total_amount ? `$${content.total_amount.toFixed(2)}` : <span className="text-gray-300 font-normal text-xs">&mdash;</span>}
          </span>
          {/* Receipt Photo */}
          <span className="flex justify-center">
            {photoUrl
              ? <span className="w-7 h-7 rounded overflow-hidden bg-gray-100 inline-block"><Image src={photoUrl} alt="" width={28} height={28} className="w-full h-full object-cover" /></span>
              : <CameraIcon className="w-4 h-4 text-gray-300" />}
          </span>
          {/* Reimbursed */}
          <span className="flex justify-center">
            {confirmed
              ? <CheckIcon className="w-4 h-4 text-green-600" />
              : <CircleIcon className="w-3.5 h-3.5 text-gray-300" />}
          </span>
          {/* Chevron */}
          <span className="flex justify-center text-gray-400">
            {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </span>
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

            {/* Receipt Details section dynamic fields */}
            {(sectionGroups.get('Receipt Details') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

            {/* Custom sections not in the hardcoded form */}
            {Array.from(sectionGroups.entries())
              .filter(([section]) => !HANDLED_SECTIONS.includes(section) && section !== '')
              .map(([section, fields]) => (
                <div key={section}>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">{section}</p>
                  <dl className="space-y-2">
                    {fields.map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                        <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

            {/* Dynamic fields without a section (legacy data) */}
            {(sectionGroups.get('') ?? []).map((f) => (
              <div key={f.id}>
                <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}

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

            {/* Expense Confirmed checkbox — Admin & Office Manager only */}
            {canConfirm && (
              <label
                onClick={handleToggleConfirmed}
                className={`flex items-center gap-2 cursor-pointer select-none ${confirmed ? 'text-green-600' : 'text-gray-400'}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                    confirmed
                      ? 'bg-green-600 border-green-600'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {confirmed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-xs font-medium">Expense Confirmed</span>
              </label>
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
          message="Are you sure you want to delete this expense? The receipt photo will also be removed. It will be moved to the trash bin and can be restored within 1 year."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditModal && (
        <EditReceiptModal
          postId={receipt.id}
          initialContent={content}
          initialRestricted={receipt.restricted}
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
          title="Expense Receipt"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </>
  )
})
