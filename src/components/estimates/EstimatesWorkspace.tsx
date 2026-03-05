'use client'

import { ClipboardIcon, PlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, Estimate, EstimateSettings } from './types'
import { DEFAULT_TERMS } from './types'
import EstimatesList from './EstimatesList'
import EstimateEditor from './EstimateEditor'

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
      />
    )
  }

  // Sub-view B: Customer selected, showing estimates list
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
        <button
          onClick={handleNewEstimate}
          className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New Estimate
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EstimatesList
          estimates={estimates}
          onSelect={onSelectEstimate}
        />
      </div>
    </div>
  )
}
