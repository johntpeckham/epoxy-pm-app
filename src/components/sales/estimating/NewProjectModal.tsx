'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { XIcon, SearchIcon, ChevronDownIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/estimates/types'
import type { EstimatingProject } from './types'

interface NewProjectModalProps {
  userId: string
  customers: Customer[]
  prefillCustomerId?: string | null
  onClose: () => void
  onCreated: (project: EstimatingProject) => void
}

export default function NewProjectModal({
  userId,
  customers,
  prefillCustomerId,
  onClose,
  onCreated,
}: NewProjectModalProps) {
  const [customerId, setCustomerId] = useState<string | null>(
    prefillCustomerId ?? null
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId]
  )

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers.slice(0, 30)
    return customers
      .filter((c) => {
        const hay = [c.name, c.company ?? '', c.email ?? '', c.phone ?? '']
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 30)
  }, [customers, customerSearch])

  useEffect(() => {
    if (!showDropdown) return
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  async function handleCreate() {
    if (!customerId) {
      setError('Please select a customer.')
      return
    }
    if (!name.trim()) {
      setError('Please enter a project name.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('estimating_projects')
      .insert({
        customer_id: customerId,
        name: name.trim(),
        description: description.trim() || null,
        status: 'active',
        source: 'manual',
        pipeline_stage: 'Estimating',
        created_by: userId,
      })
      .select('*')
      .single()
    if (insertErr || !data) {
      setSaving(false)
      setError(`Failed to create project: ${insertErr?.message ?? 'unknown error'}`)
      return
    }
    const created = data as EstimatingProject
    await supabase.from('pipeline_history').insert({
      project_id: created.id,
      from_stage: null,
      to_stage: 'Estimating',
      changed_by: userId,
    })
    setSaving(false)
    onCreated(created)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">New project</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div ref={dropdownRef} className="relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowDropdown((v) => !v)}
                className="w-full px-3 py-2 text-left border border-gray-200 rounded-lg text-sm text-gray-900 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500 flex items-center justify-between"
              >
                <span className={selectedCustomer ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedCustomer
                    ? `${selectedCustomer.name}${
                        selectedCustomer.company ? ` · ${selectedCustomer.company}` : ''
                      }`
                    : 'Select a customer…'}
                </span>
                <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              </button>
              {showDropdown && (
                <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
                  <div className="relative p-2 border-b border-gray-100">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search customers…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="overflow-y-auto max-h-48">
                    {filteredCustomers.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-400 text-center">
                        No matching customers
                      </p>
                    ) : (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(c.id)
                            setShowDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition"
                        >
                          <div className="font-medium text-gray-900">{c.name}</div>
                          {c.company && (
                            <div className="text-xs text-gray-500">{c.company}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Project name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Warehouse floor coating"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional project notes…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white resize-y"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
