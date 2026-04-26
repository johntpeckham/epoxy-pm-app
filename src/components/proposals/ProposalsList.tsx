'use client'

import { useState } from 'react'
import { FileTextIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteProposal } from '@/lib/trashBin'
import type { Proposal } from './types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ProposalsListProps {
  proposals: Proposal[]
  onSelect: (id: string) => void
  userId: string
  onProposalDeleted?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-amber-100 text-amber-700',
}

export default function ProposalsList({ proposals, onSelect, userId, onProposalDeleted }: ProposalsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDeleteProposal() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const supabase = createClient()
    const target = proposals.find((e) => e.id === deleteTarget)
    const displayName = target ? `Proposal #${target.estimate_number}` : 'Proposal'
    await softDeleteProposal(supabase, deleteTarget, displayName, userId, target?.project_name || null)
    setIsDeleting(false)
    setDeleteTarget(null)
    onProposalDeleted?.()
  }

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No proposals for this customer yet.</p>
      </div>
    )
  }

  return (
    <>
      <div className="p-4 space-y-2">
        {proposals.map((est) => (
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
                  title="Delete proposal"
                >
                  <Trash2Icon className="w-4 h-4" />
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
          title="Delete Proposal"
          message="Are you sure you want to move this proposal to the trash bin? You can restore it within 30 days."
          onConfirm={handleDeleteProposal}
          onCancel={() => setDeleteTarget(null)}
          loading={isDeleting}
        />
      )}
    </>
  )
}
