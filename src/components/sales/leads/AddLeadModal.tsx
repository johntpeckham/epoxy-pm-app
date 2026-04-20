'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, UserIcon, PlusIcon, CheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/estimates/types'
import type { Lead, LeadCategory } from './LeadsClient'

interface AddLeadModalProps {
  userId: string
  customers: Customer[]
  categories: LeadCategory[]
  onClose: () => void
  onCreated: (lead: Lead, newCustomer?: Customer | null) => void
}

function buildFullAddress(c: Customer): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function AddLeadModal({
  userId,
  customers,
  categories,
  onClose,
  onCreated,
}: AddLeadModalProps) {
  const [projectName, setProjectName] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [creatingNewCustomer, setCreatingNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')
  const [category, setCategory] = useState<string>('')
  const [date, setDate] = useState<string>(todayISO())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q)
    )
  }, [customers, customerQuery])

  function handleSelectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCreatingNewCustomer(false)
    setCustomerQuery(c.name)
    setDropdownOpen(false)
  }

  function handleStartCreate() {
    setSelectedCustomer(null)
    setCreatingNewCustomer(true)
    setNewCustomerName(customerQuery)
    setDropdownOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectName.trim()) {
      setError('Project name is required.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    let customerId: string | null = selectedCustomer?.id ?? null
    let customerName = selectedCustomer?.name ?? null
    let customerEmail = selectedCustomer?.email ?? null
    let customerPhone = selectedCustomer?.phone ?? null
    let address = selectedCustomer ? buildFullAddress(selectedCustomer) : null
    let createdCustomer: Customer | null = null

    if (creatingNewCustomer) {
      const trimmedName = newCustomerName.trim()
      if (!trimmedName) {
        setSaving(false)
        setError('Customer name is required.')
        return
      }
      const { data: newCust, error: custErr } = await supabase
        .from('companies')
        .insert({
          name: trimmedName,
          company: null,
          email: newCustomerEmail.trim() || null,
          phone: newCustomerPhone.trim() || null,
          address: newCustomerAddress.trim() || null,
          city: null,
          state: null,
          zip: null,
          archived: false,
        })
        .select('*')
        .single()
      if (custErr || !newCust) {
        setSaving(false)
        setError(`Failed to create customer: ${custErr?.message ?? 'unknown error'}`)
        return
      }
      createdCustomer = newCust as Customer
      customerId = createdCustomer.id
      customerName = createdCustomer.name
      customerEmail = createdCustomer.email
      customerPhone = createdCustomer.phone
      address = buildFullAddress(createdCustomer) || null
    }

    const { data: newLead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        project_name: projectName.trim(),
        company_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        address: address || null,
        date: date || null,
        category: category || null,
        status: 'new',
        created_by: userId,
      })
      .select('*')
      .single()

    setSaving(false)
    if (leadErr || !newLead) {
      setError(`Failed to create lead: ${leadErr?.message ?? 'unknown error'}`)
      return
    }
    onCreated(newLead as Lead, createdCustomer)
  }

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h2 className="text-lg font-semibold text-gray-900">Add Lead</h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className={labelCls}>
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  className={inputCls}
                  required
                />
              </div>

              <div ref={dropdownRef}>
                <label className={labelCls}>Customer</label>
                <div className="relative">
                  <div className="relative">
                    <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value)
                        setSelectedCustomer(null)
                        setCreatingNewCustomer(false)
                        setDropdownOpen(true)
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder="Search existing customer or add new"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  {dropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-amber-50 transition flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{c.name}</p>
                            {c.company && (
                              <p className="text-xs text-gray-500 truncate">{c.company}</p>
                            )}
                          </div>
                          {selectedCustomer?.id === c.id && (
                            <CheckIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleStartCreate}
                        className="w-full text-left px-3 py-2 border-t border-gray-100 flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-50 transition"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Create new customer
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {creatingNewCustomer && (
                <div className="relative border border-gray-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">New customer details</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingNewCustomer(false)
                        setNewCustomerName('')
                        setNewCustomerEmail('')
                        setNewCustomerPhone('')
                        setNewCustomerAddress('')
                      }}
                      aria-label="Close new customer details"
                      className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Customer Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Full name"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Email</label>
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <input
                      type="text"
                      value={newCustomerAddress}
                      onChange={(e) => setNewCustomerAddress(e.target.value)}
                      placeholder="Street, City, State, Zip"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Lead source</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Select —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            <div
              className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !projectName.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {saving ? 'Saving…' : 'Create Lead'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
