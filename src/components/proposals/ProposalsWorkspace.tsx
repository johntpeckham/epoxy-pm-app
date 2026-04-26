'use client'

import { useState } from 'react'
import { ClipboardIcon, PlusIcon, FilePlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Proposal, ProposalSettings } from './types'
import { DEFAULT_TERMS } from './types'
import type { LineItem } from './types'
import ProposalsList from './ProposalsList'
import ProposalEditor from './ProposalEditor'
import ChangeOrderModal from '../shared/ChangeOrderModal'

interface ProposalsWorkspaceProps {
  customer: Customer | null
  proposals: Proposal[]
  selectedProposalId: string | null
  settings: ProposalSettings | null
  userId: string
  onSelectProposal: (id: string) => void
  onProposalCreated: () => void
  onProposalUpdated: () => void
  onBack: () => void
  onOpenSettings: () => void
  pendingChangeOrder?: boolean
  onChangeOrderHandled?: () => void
  onProposalDeleted?: () => void
  backContext?: { url: string; label: string } | null
}

export default function ProposalsWorkspace({
  customer,
  proposals,
  selectedProposalId,
  settings,
  userId,
  onSelectProposal,
  onProposalCreated,
  onProposalUpdated,
  onBack,
  onOpenSettings,
  pendingChangeOrder,
  onChangeOrderHandled,
  onProposalDeleted,
  backContext,
}: ProposalsWorkspaceProps) {
  const selectedProposal = proposals.find((e) => e.id === selectedProposalId) ?? null

  async function handleNewProposal() {
    if (!customer || !settings) return
    const supabase = createClient()
    const proposalNumber = settings.next_proposal_number

    const { data } = await supabase
      .from('proposals')
      .insert({
        proposal_number: proposalNumber,
        company_id: customer.id,
        date: new Date().toISOString().split('T')[0],
        project_name: '',
        description: '',
        salesperson: '',
        line_items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        terms: DEFAULT_TERMS,
        notes: '',
        status: 'Draft',
        user_id: userId,
      })
      .select()
      .single()

    // Increment the next proposal number
    await supabase
      .from('proposal_settings')
      .update({ next_proposal_number: proposalNumber + 1 })
      .eq('user_id', userId)

    if (data) {
      onProposalCreated()
      onSelectProposal(data.id)
    }
  }

  // Sub-view A: No customer selected
  if (!customer) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-400 text-sm">Select a customer to view proposals</p>
        </div>
      </div>
    )
  }

  // Sub-view C: Proposal editor
  if (selectedProposal) {
    return (
      <ProposalEditor
        proposal={selectedProposal}
        customer={customer}
        settings={settings}
        userId={userId}
        onBack={onBack}
        onUpdated={onProposalUpdated}
        onOpenSettings={onOpenSettings}
        pendingChangeOrder={pendingChangeOrder}
        onChangeOrderHandled={onChangeOrderHandled}
        onDeleted={onProposalDeleted}
        backContext={backContext ?? null}
      />
    )
  }

  // Sub-view B: Customer selected, showing proposals list
  return (
    <CustomerProposalsView
      customer={customer}
      proposals={proposals}
      settings={settings}
      userId={userId}
      onSelectProposal={onSelectProposal}
      onNewProposal={handleNewProposal}
      onProposalCreated={onProposalCreated}
    />
  )
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CustomerProposalsView({
  customer,
  proposals,
  settings: _settings,
  userId,
  onSelectProposal,
  onNewProposal,
  onProposalCreated,
}: {
  customer: Customer
  proposals: Proposal[]
  settings: ProposalSettings | null
  userId: string
  onSelectProposal: (id: string) => void
  onNewProposal: () => void
  onProposalCreated: () => void
}) {
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [savingCO, setSavingCO] = useState(false)

  const totalValue = proposals.reduce((sum, e) => sum + (e.total ?? 0), 0)
  const totalAccepted = proposals.filter((e) => e.status === 'Accepted' || e.status === 'Invoiced').reduce((sum, e) => sum + (e.total ?? 0), 0)
  const proposalCount = proposals.length

  // For change orders from the customer view, use the most recent proposal
  const latestProposal = proposals[0] ?? null

  async function handleAddChangeOrder(coData: { description: string; lineItems: LineItem[]; notes: string }) {
    if (!latestProposal) return
    setSavingCO(true)
    const supabase = createClient()
    const { count } = await supabase
      .from('change_orders')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', latestProposal.id)
    const coNumber = `CO-${(count ?? 0) + 1}`
    const sub = coData.lineItems.reduce((s, item) => {
      const amt = (!item.ft || item.ft === 0) ? (item.rate ?? 0) : (item.ft ?? 0) * (item.rate ?? 0)
      return s + amt
    }, 0)
    await supabase.from('change_orders').insert({
      parent_type: 'proposal',
      parent_id: latestProposal.id,
      proposal_id: latestProposal.id,
      change_order_number: coNumber,
      description: coData.description,
      line_items: coData.lineItems,
      subtotal: sub,
      status: 'Pending',
      notes: coData.notes || null,
      user_id: userId,
    })
    setSavingCO(false)
    setShowChangeOrderModal(false)
    onProposalCreated()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewProposal}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New Proposal
            </button>
            <button
              onClick={() => setShowChangeOrderModal(true)}
              disabled={!latestProposal}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FilePlusIcon className="w-4 h-4" />
              New Change Order
            </button>
          </div>
        </div>
        {/* Summary bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Total Value</span>
            <span className="text-xs font-semibold text-gray-900">${formatCurrency(totalValue)}</span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Accepted</span>
            <span className="text-xs font-semibold text-green-600">${formatCurrency(totalAccepted)}</span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Proposals</span>
            <span className="text-xs font-semibold text-gray-900">{proposalCount}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ProposalsList
          proposals={proposals}
          onSelect={onSelectProposal}
          userId={userId}
          onProposalDeleted={onProposalCreated}
        />
      </div>
      {showChangeOrderModal && (
        <ChangeOrderModal
          onSave={handleAddChangeOrder}
          onClose={() => setShowChangeOrderModal(false)}
          saving={savingCO}
        />
      )}
    </div>
  )
}
