'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  UndoIcon,
  XIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Portal from '@/components/ui/Portal'

export interface SalesmanExpenseRow {
  id: string
  user_id: string
  description: string | null
  amount: number
  date: string
  receipt_url: string | null
  status: 'Unpaid' | 'Paid'
  notes: string | null
  created_at: string
  updated_at: string
  user_display_name?: string
}

interface SalesmanExpenseCardProps {
  expense: SalesmanExpenseRow
  showUserName: boolean
  onEdit: (expense: SalesmanExpenseRow) => void
  onRefresh: () => void
}

export default function SalesmanExpenseCard({
  expense,
  showUserName,
  onEdit,
  onRefresh,
}: SalesmanExpenseCardProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState(false)

  const supabase = createClient()

  const receiptPublicUrl = expense.receipt_url
    ? supabase.storage.from('salesman-receipts').getPublicUrl(expense.receipt_url).data.publicUrl
    : null

  const formattedDate = new Date(expense.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const formattedAmount = `$${expense.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  async function handleDelete() {
    setIsDeleting(true)
    const supabase = createClient()
    if (expense.receipt_url) {
      await supabase.storage.from('salesman-receipts').remove([expense.receipt_url])
    }
    await supabase.from('salesman_expenses').delete().eq('id', expense.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    onRefresh()
  }

  async function handleToggleStatus() {
    setIsToggling(true)
    const supabase = createClient()
    const newStatus = expense.status === 'Unpaid' ? 'Paid' : 'Unpaid'
    await supabase
      .from('salesman_expenses')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', expense.id)
    setIsToggling(false)
    onRefresh()
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition">
        <div className="flex items-start gap-3">
          {/* Receipt thumbnail */}
          {receiptPublicUrl && (
            <button
              onClick={() => setShowPhotoModal(true)}
              className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 hover:opacity-80 transition"
            >
              <Image
                src={receiptPublicUrl}
                alt="Receipt"
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {expense.description || 'No description'}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">{formattedDate}</span>
                  {showUserName && expense.user_display_name && (
                    <>
                      <span className="text-xs text-gray-300">&middot;</span>
                      <span className="text-xs text-gray-500 font-medium">{expense.user_display_name}</span>
                    </>
                  )}
                </div>
                {expense.notes && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{expense.notes}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-base font-bold text-gray-900 tabular-nums">{formattedAmount}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    expense.status === 'Paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {expense.status}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
              <button
                onClick={handleToggleStatus}
                disabled={isToggling}
                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  expense.status === 'Unpaid'
                    ? 'text-green-600 hover:text-green-800'
                    : 'text-amber-600 hover:text-amber-800'
                }`}
              >
                {expense.status === 'Unpaid' ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Mark Paid
                  </>
                ) : (
                  <>
                    <UndoIcon className="w-3.5 h-3.5" />
                    Mark Unpaid
                  </>
                )}
              </button>
              <button
                onClick={() => onEdit(expense)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo lightbox */}
      {showPhotoModal && receiptPublicUrl && (
        <Portal>
          <div
            className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowPhotoModal(false)}
          >
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10"
            >
              <XIcon className="w-6 h-6" />
            </button>
            <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPublicUrl}
                alt="Receipt"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
          </div>
        </Portal>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Expense"
          message="Are you sure you want to delete this expense? The receipt photo will also be removed. This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}
    </>
  )
}
