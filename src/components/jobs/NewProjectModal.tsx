'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, ChevronDownIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/estimates/types'

interface NewProjectModalProps {
  onClose: () => void
  onCreated: () => void
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('')
  const [estimateNumber, setEstimateNumber] = useState('')
  const [status, setStatus] = useState<'Active' | 'Complete'>('Active')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Customer selector state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchCustomers() {
      const supabase = createClient()
      const { data } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })
      if (data) setCustomers(data)
    }
    fetchCustomers()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    if (showCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomerDropdown])

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      client_name: clientName.trim(),
      address: address.trim(),
      status,
      ...(estimateNumber.trim() ? { estimate_number: estimateNumber.trim() } : {}),
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onCreated()
    }
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:m-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col" style={{ marginTop: 'auto', marginBottom: 'auto', marginLeft: 'auto', marginRight: 'auto', width: '100%', maxWidth: '42rem', maxHeight: '85vh', backgroundColor: 'white', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aircraft Hangar Coating"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <div className="relative mt-1" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => { setShowCustomerDropdown(!showCustomerDropdown); setCustomerSearch('') }}
                  className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  Select existing customer
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
                {showCustomerDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No customers found.</p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClientName(c.name)
                              setShowCustomerDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                          >
                            <p className="text-gray-900 text-xs font-medium truncate">{c.name}</p>
                            {c.company && <p className="text-gray-500 text-xs truncate">{c.company}</p>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 Main St, Austin TX"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Estimate #
              </label>
              <input
                type="text"
                value={estimateNumber}
                onChange={(e) => setEstimateNumber(e.target.value)}
                placeholder="e.g. EST-1042"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Active' | 'Complete')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              >
                <option value="Active">Active</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
          </div>

          <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  )
}
