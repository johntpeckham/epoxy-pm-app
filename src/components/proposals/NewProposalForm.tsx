'use client'

import { useState } from 'react'
import { ArrowLeftIcon, PlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer, ProposalSettings } from './types'
import { DEFAULT_TERMS } from './types'
import CustomerSearchSelector from '../shared/CustomerSearchSelector'

interface NewProposalFormProps {
  customers: Customer[]
  settings: ProposalSettings | null
  userId: string
  preselectedCustomerId?: string | null
  onCreated: (customerId: string, proposalId: string) => void
  onCancel: () => void
}

export default function NewProposalForm({
  customers,
  settings,
  userId,
  preselectedCustomerId,
  onCreated,
  onCancel,
}: NewProposalFormProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(preselectedCustomerId ?? null)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!selectedCustomerId) {
      setError('Please select a customer')
      return
    }
    if (!settings) {
      setError('Proposal settings not configured')
      return
    }
    setCreating(true)
    setError(null)

    const supabase = createClient()
    // DB column kept as next_estimate_number until Phase 4.
    const proposalNumber = settings.next_estimate_number

    const { data, error: dbError } = await supabase
      .from('estimates')
      .insert({
        estimate_number: proposalNumber,
        company_id: selectedCustomerId,
        date: new Date().toISOString().split('T')[0],
        project_name: projectName || '',
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

    if (dbError) {
      setError('Failed to create proposal')
      setCreating(false)
      return
    }

    await supabase
      .from('estimate_settings')
      .update({ next_estimate_number: proposalNumber + 1 })
      .eq('user_id', userId)

    if (data) {
      onCreated(selectedCustomerId, data.id)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 rounded">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <h2 className="text-base font-bold text-gray-900">New Proposal</h2>
      </div>
      <div className="flex-1 flex items-start justify-center pt-16 px-6">
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <CustomerSearchSelector
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelect={(c) => { setSelectedCustomerId(c.id); setError(null) }}
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name (optional)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          {settings && (
            <p className="text-xs text-gray-400">Proposal #{settings.next_estimate_number}</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              {creating ? 'Creating...' : 'Create Proposal'}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
