'use client'

import { useState } from 'react'
import { ClipboardIcon, PlusIcon, FilePlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Estimate, EstimateSettings } from './types'
import { DEFAULT_TERMS } from './types'
import type { LineItem } from './types'
import EstimatesList from './EstimatesList'
import EstimateEditor from './EstimateEditor'
import ChangeOrderModal from '../shared/ChangeOrderModal'

interface EstimatesWorkspaceProps {
  customer: Customer | null
  estimates: Estimate[]
  selectedEstimateId: string | null
  settings: EstimateSettings | null
  userId: string
  onSelectEstimate: (id: string) => void
  onEstimateCreated: () => void
  onEstimateUpdated: () => void
  onBack: () => void
  onOpenSettings: () => void
  pendingChangeOrder?: boolean
  onChangeOrderHandled?: () => void
  onEstimateDeleted?: () => void
  backContext?: { url: string; label: string } | null
}

export default function EstimatesWorkspace({
  customer,
  estimates,
  selectedEstimateId,
  settings,
  userId,
  onSelectEstimate,
  onEstimateCreated,
  onEstimateUpdated,
  onBack,
  onOpenSettings,
  pendingChangeOrder,
  onChangeOrderHandled,
  onEstimateDeleted,
  backContext,
}: EstimatesWorkspaceProps) {
  const selectedEstimate = estimates.find((e) => e.id === selectedEstimateId) ?? null

  async function handleNewEstimate() {
    if (!customer || !settings) return
    const supabase = createClient()
    const estimateNumber = settings.next_estimate_number

    const { data } = await supabase
      .from('estimates')
      .insert({
        estimate_number: estimateNumber,
        customer_id: customer.id,
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

    // Increment the next estimate number
    await supabase
      .from('estimate_settings')
      .update({ next_estimate_number: estimateNumber + 1 })
      .eq('user_id', userId)

    if (data) {
      onEstimateCreated()
      onSelectEstimate(data.id)
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
          <p className="text-gray-400 text-sm">Select a customer to view estimates</p>
        </div>
      </div>
    )
  }

  // Sub-view C: Estimate editor
  if (selectedEstimate) {
    return (
      <EstimateEditor
        estimate={selectedEstimate}
        customer={customer}
        settings={settings}
        userId={userId}
        onBack={onBack}
        onUpdated={onEstimateUpdated}
        onOpenSettings={onOpenSettings}
        pendingChangeOrder={pendingChangeOrder}
        onChangeOrderHandled={onChangeOrderHandled}
        onDeleted={onEstimateDeleted}
        backContext={backContext ?? null}
      />
    )
  }

  // Sub-view B: Customer selected, showing estimates list
  return (
    <CustomerEstimatesView
      customer={customer}
      estimates={estimates}
      settings={settings}
      userId={userId}
      onSelectEstimate={onSelectEstimate}
      onNewEstimate={handleNewEstimate}
      onEstimateCreated={onEstimateCreated}
    />
  )
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function CustomerEstimatesView({
  customer,
  estimates,
  settings: _settings,
  userId,
  onSelectEstimate,
  onNewEstimate,
  onEstimateCreated,
}: {
  customer: Customer
  estimates: Estimate[]
  settings: EstimateSettings | null
  userId: string
  onSelectEstimate: (id: string) => void
  onNewEstimate: () => void
  onEstimateCreated: () => void
}) {
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [savingCO, setSavingCO] = useState(false)

  const totalValue = estimates.reduce((sum, e) => sum + (e.total ?? 0), 0)
  const totalAccepted = estimates.filter((e) => e.status === 'Accepted' || e.status === 'Invoiced').reduce((sum, e) => sum + (e.total ?? 0), 0)
  const estimateCount = estimates.length

  // For change orders from the customer view, use the most recent estimate
  const latestEstimate = estimates[0] ?? null

  async function handleAddChangeOrder(coData: { description: string; lineItems: LineItem[]; notes: string }) {
    if (!latestEstimate) return
    setSavingCO(true)
    const supabase = createClient()
    const { count } = await supabase
      .from('change_orders')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', latestEstimate.id)
    const coNumber = `CO-${(count ?? 0) + 1}`
    const sub = coData.lineItems.reduce((s, item) => {
      const amt = (!item.ft || item.ft === 0) ? (item.rate ?? 0) : (item.ft ?? 0) * (item.rate ?? 0)
      return s + amt
    }, 0)
    await supabase.from('change_orders').insert({
      parent_type: 'estimate',
      parent_id: latestEstimate.id,
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
    onEstimateCreated()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewEstimate}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New Estimate
            </button>
            <button
              onClick={() => setShowChangeOrderModal(true)}
              disabled={!latestEstimate}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FilePlusIcon className="w-3.5 h-3.5" />
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
            <span className="text-xs text-gray-400">Estimates</span>
            <span className="text-xs font-semibold text-gray-900">{estimateCount}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EstimatesList
          estimates={estimates}
          onSelect={onSelectEstimate}
          userId={userId}
          onEstimateDeleted={onEstimateCreated}
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
