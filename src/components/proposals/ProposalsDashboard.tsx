'use client'

import { useState, useMemo } from 'react'
import { FileTextIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteProposal } from '@/lib/trashBin'
import type { Customer, Proposal } from './types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

type TimeFilter = 'all' | '365' | '30'

interface ProposalsDashboardProps {
  proposals: Proposal[]
  customers: Customer[]
  onSelectProposal?: (customerId: string, proposalId: string) => void
  onProposalDeleted?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-amber-100 text-amber-700',
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ProposalsDashboard({ proposals, customers, onSelectProposal, onProposalDeleted }: ProposalsDashboardProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDeleteProposal() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const target = proposals.find((e) => e.id === deleteTarget)
    const displayName = target ? `Proposal #${target.estimate_number}` : 'Proposal'
    await softDeleteProposal(supabase, deleteTarget, displayName, user?.id ?? '', target?.project_name || null)
    setIsDeleting(false)
    setDeleteTarget(null)
    onProposalDeleted?.()
  }

  const filteredProposals = useMemo(() => {
    if (timeFilter === 'all') return proposals
    const now = new Date()
    const days = timeFilter === '365' ? 365 : 30
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return proposals.filter((est) => new Date(est.date) >= cutoff)
  }, [proposals, timeFilter])

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {}
    customers.forEach((c) => { map[c.id] = c })
    return map
  }, [customers])

  const totalValue = useMemo(() => {
    return filteredProposals.reduce((sum, est) => sum + (est.total ?? 0), 0)
  }, [filteredProposals])

  const draftValue = useMemo(() => {
    return filteredProposals.filter((e) => e.status === 'Draft').reduce((sum, e) => sum + (e.total ?? 0), 0)
  }, [filteredProposals])

  const sentValue = useMemo(() => {
    return filteredProposals.filter((e) => e.status === 'Sent').reduce((sum, e) => sum + (e.total ?? 0), 0)
  }, [filteredProposals])

  const acceptedValue = useMemo(() => {
    return filteredProposals.filter((e) => e.status === 'Accepted' || e.status === 'Invoiced').reduce((sum, e) => sum + (e.total ?? 0), 0)
  }, [filteredProposals])

  const acceptanceRate = totalValue > 0 ? (acceptedValue / totalValue) * 100 : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Proposals Dashboard</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', 'All Time'], ['365', 'Last 365 Days'], ['30', 'Last 30 Days']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTimeFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeFilter === value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Total Value */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-500 mb-1">Total Proposals Value</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">${formatCurrency(totalValue)}</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-amber-400 h-2 rounded-full transition-all"
                style={{ width: totalValue > 0 ? '100%' : '0%' }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Draft: ${formatCurrency(draftValue)}</span>
              <span>Sent: ${formatCurrency(sentValue)}</span>
              <span>Accepted: ${formatCurrency(acceptedValue)}</span>
            </div>
          </div>

          {/* Accepted Value */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-500 mb-1">Total Accepted</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">${formatCurrency(acceptedValue)}</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-green-400 h-2 rounded-full transition-all"
                style={{ width: `${acceptanceRate}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Acceptance rate: {acceptanceRate.toFixed(1)}%</span>
              <span>{filteredProposals.filter((e) => e.status === 'Accepted' || e.status === 'Invoiced').length} of {filteredProposals.length} proposals</span>
            </div>
          </div>
        </div>

        {/* Proposals list */}
        {filteredProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No proposals yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Proposal #</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Client / Project</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map((est) => {
                  const companyKey = est.company_id
                  const customer = customerMap[companyKey]
                  return (
                    <tr
                      key={est.id}
                      className="border-b border-gray-50 hover:bg-amber-50 transition-colors cursor-pointer"
                      onClick={() => onSelectProposal?.(companyKey, est.id)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-600">{est.date}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">#{est.estimate_number}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{customer?.name ?? 'Unknown'}</p>
                        {est.project_name && (
                          <p className="text-xs text-gray-500">{est.project_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                        ${formatCurrency(est.total ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[est.status] ?? STATUS_COLORS.Draft}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(est.id) }}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                          title="Delete proposal"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
    </div>
  )
}
