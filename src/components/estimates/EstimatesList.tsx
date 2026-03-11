'use client'

import { useState } from 'react'
import { FileTextIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Estimate } from './types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface EstimatesListProps {
  estimates: Estimate[]
  onSelect: (id: string) => void
  userId: string
  onEstimateDeleted?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-amber-100 text-amber-700',
}

export default function EstimatesList({ estimates, onSelect, userId, onEstimateDeleted }: EstimatesListProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDeleteEstimate() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const supabase = createClient()
    await supabase.from('change_orders').delete().eq('parent_id', deleteTarget)
    await supabase.from('estimates').delete().eq('id', deleteTarget)
    setIsDeleting(false)
    setDeleteTarget(null)
    onEstimateDeleted?.()
  }

  if (estimates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No estimates for this customer yet.</p>
      </div>
    )
  }

  return (
    <>
      <div className="p-4 space-y-2">
        {estimates.map((est) => (
          <div
            key={est.id}
            onClick={() => onSelect(est.id)}
            className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer relative group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-900">
                #{est.estimate_number}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[est.status] ?? STATUS_COLORS.Draft}`}>
                  {est.status}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(est.id) }}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                  title="Delete estimate"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {est.project_name && (
              <p className="text-sm text-gray-700 truncate">{est.project_name}</p>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-400">{est.date}</span>
              <span className="text-sm font-medium text-gray-900">
                ${(est.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ))}
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Estimate"
          message="Are you sure you want to delete this estimate? This cannot be undone."
          onConfirm={handleDeleteEstimate}
          onCancel={() => setDeleteTarget(null)}
          loading={isDeleting}
        />
      )}
    </>
  )
}
