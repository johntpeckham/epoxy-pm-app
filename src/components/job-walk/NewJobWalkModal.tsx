'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, UserIcon, PlusIcon, CheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import LeadSourceDropdown from '@/components/shared/LeadSourceDropdown'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { JobWalk } from './JobWalkClient'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import type { LockedCustomer } from '@/components/sales/leads/AddLeadModal'

interface NewJobWalkModalProps {
  userId: string
  customers: Customer[]
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  prefill?: { customer: Customer }
  lockedCustomer?: LockedCustomer | null
  onClose: () => void
  onCreated: (walk: JobWalk, newCustomer?: Customer | null) => void
}

function buildFullAddress(c: Customer): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function NewJobWalkModal({
  userId,
  customers,
  assignees = [],
  categories = [],
  prefill,
  lockedCustomer = null,
  onClose,
  onCreated,
}: NewJobWalkModalProps) {
  const prefillCustomer = prefill?.customer ?? null
  const [projectName, setProjectName] = useState('')
  const [customerQuery, setCustomerQuery] = useState(lockedCustomer?.name ?? prefillCustomer?.name ?? '')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(prefillCustomer)
  const [creatingNewCustomer, setCreatingNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')
  const [customerEmail, setCustomerEmail] = useState(lockedCustomer?.email ?? prefillCustomer?.email ?? '')
  const [customerPhone, setCustomerPhone] = useState(lockedCustomer?.phone ?? prefillCustomer?.phone ?? '')
  const [address, setAddress] = useState(
    lockedCustomer?.address ?? (prefillCustomer ? buildFullAddress(prefillCustomer) : '')
  )
  const [projectAddress, setProjectAddress] = useState('')
  const [sameAsCustomer, setSameAsCustomer] = useState(false)
  const [leadSource, setLeadSource] = useState('')
  const [leadCategoryId, setLeadCategoryId] = useState<string>('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [localCategories, setLocalCategories] = useState<LeadCategory[]>(categories)
  const [date, setDate] = useState(todayISO())
  const [projectDetails, setProjectDetails] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>(userId)
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

  useEffect(() => {
    if (sameAsCustomer) setProjectAddress(address)
  }, [sameAsCustomer, address])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q)
    )
  }, [customers, customerQuery])

  async function handleSelectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCreatingNewCustomer(false)
    setCustomerQuery(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerPhone(c.phone ?? '')
    const fullAddr = buildFullAddress(c)
    if (fullAddr) setAddress(fullAddr)
    setDropdownOpen(false)

    const supabase = createClient()
    const { data: primary, error: contactErr } = await supabase
      .from('contacts')
      .select('email, phone')
      .eq('company_id', c.id)
      .eq('is_primary', true)
      .maybeSingle()
    if (contactErr) {
      console.error('[NewJobWalkModal] Primary contact lookup failed:', {
        code: contactErr.code,
        message: contactErr.message,
        hint: contactErr.hint,
        details: contactErr.details,
      })
      return
    }
    if (primary) {
      if (primary.email) setCustomerEmail(primary.email)
      if (primary.phone) setCustomerPhone(primary.phone)
    }
  }

  async function handleAddCategory() {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    setSavingCategory(true)
    const supabase = createClient()
    const existing = localCategories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    )
    let cat = existing
    if (!cat) {
      const { data: created, error: createErr } = await supabase
        .from('lead_categories')
        .insert({ name: trimmed })
        .select('*')
        .single()
      if (createErr || !created) {
        console.error('[NewJobWalkModal] Add category failed:', {
          code: createErr?.code,
          message: createErr?.message,
          hint: createErr?.hint,
          details: createErr?.details,
        })
        setSavingCategory(false)
        return
      }
      cat = created as LeadCategory
      setLocalCategories((prev) =>
        [...prev, cat as LeadCategory].sort((a, b) => a.name.localeCompare(b.name))
      )
    }
    setLeadCategoryId(cat.id)
    setSavingCategory(false)
    setAddingCategory(false)
    setNewCategoryName('')
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
    if (!lockedCustomer && !selectedCustomer && !creatingNewCustomer && !customerQuery.trim()) {
      setError('Customer is required.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    let customerId: string | null = lockedCustomer?.id ?? selectedCustomer?.id ?? null
    let customerName: string | null =
      lockedCustomer?.name ?? selectedCustomer?.name ?? (customerQuery.trim() || null)
    let finalEmail: string | null = customerEmail.trim() || null
    let finalPhone: string | null = customerPhone.trim() || null
    let finalAddress: string | null = address.trim() || null
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
          address: newCustomerAddress.trim() || null,
          city: null,
          state: null,
          zip: null,
          archived: false,
        })
        .select('*')
        .single()
      if (custErr || !newCust) {
        console.error('[NewJobWalkModal] Create customer failed:', {
          code: custErr?.code,
          message: custErr?.message,
          hint: custErr?.hint,
          details: custErr?.details,
        })
        setSaving(false)
        setError(`Failed to create customer: ${custErr?.message ?? 'unknown error'}`)
        return
      }
      createdCustomer = newCust as Customer
      customerId = createdCustomer.id
      customerName = createdCustomer.name
      finalEmail = newCustomerEmail.trim() || null
      finalPhone = newCustomerPhone.trim() || null
      finalAddress = newCustomerAddress.trim() || finalAddress
    }

    const finalProjectAddress = sameAsCustomer
      ? finalAddress
      : (projectAddress.trim() || null)

    const { data: newWalk, error: walkErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: projectName.trim(),
        company_id: customerId,
        customer_name: customerName,
        customer_email: finalEmail,
        customer_phone: finalPhone,
        address: finalAddress,
        project_address: finalProjectAddress,
        date: date || null,
        project_details: projectDetails.trim() || null,
        lead_source: leadSource.trim() || null,
        lead_category_id: leadCategoryId || null,
        status: 'upcoming',
        assigned_to: assignedTo || null,
        created_by: userId,
      })
      .select('*')
      .single()

    setSaving(false)
    if (walkErr || !newWalk) {
      console.error('[NewJobWalkModal] Create job walk failed:', {
        code: walkErr?.code,
        message: walkErr?.message,
        hint: walkErr?.hint,
        details: walkErr?.details,
      })
      setError(`Failed to create job walk: ${walkErr?.message ?? 'unknown error'}`)
      return
    }
    onCreated(newWalk as JobWalk, createdCustomer)
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
            <h2 className="text-lg font-semibold text-gray-900">New Job Walk</h2>
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

              {lockedCustomer ? (
                <div>
                  <label className={labelCls}>Customer</label>
                  <div className={`${inputCls} bg-gray-50 text-gray-700 flex items-center gap-2`}>
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{lockedCustomer.name}</span>
                    <span className="ml-auto text-xs text-gray-400">from company</span>
                  </div>
                </div>
              ) : (
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
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleStartCreate}
                        className="w-full text-left px-3 py-2 border-b border-gray-100 flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-50 transition"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Create new customer
                      </button>
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
                    </div>
                  )}
                </div>
              </div>
              )}

              {!lockedCustomer && creatingNewCustomer && (
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

              {!creatingNewCustomer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="—"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="—"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Customer Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, State, Zip"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 mb-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sameAsCustomer}
                    onChange={(e) => setSameAsCustomer(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Same as customer address
                  </span>
                </label>
                <label className={labelCls}>Project Address</label>
                <input
                  type="text"
                  value={sameAsCustomer ? address : projectAddress}
                  onChange={(e) => setProjectAddress(e.target.value)}
                  disabled={sameAsCustomer}
                  placeholder="Street, City, State, Zip"
                  className={`${inputCls} ${sameAsCustomer ? 'bg-gray-50 text-gray-600' : ''}`}
                />
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

              <div>
                <label className={labelCls}>Project details</label>
                <textarea
                  value={projectDetails}
                  onChange={(e) => setProjectDetails(e.target.value)}
                  rows={3}
                  placeholder="Scope, purpose of the visit, etc."
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Lead Source</label>
                <LeadSourceDropdown
                  value={leadSource}
                  onChange={setLeadSource}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Lead Category</label>
                {addingCategory ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCategory()
                        } else if (e.key === 'Escape') {
                          setAddingCategory(false)
                          setNewCategoryName('')
                        }
                      }}
                      placeholder="New category name"
                      className={inputCls}
                      disabled={savingCategory}
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={savingCategory || !newCategoryName.trim()}
                      className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg disabled:opacity-50"
                    >
                      {savingCategory ? '…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategory(false)
                        setNewCategoryName('')
                      }}
                      disabled={savingCategory}
                      className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={leadCategoryId}
                      onChange={(e) => setLeadCategoryId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— None —</option>
                      {localCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAddingCategory(true)}
                      className="px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg whitespace-nowrap"
                    >
                      Manage
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Assigned to</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={inputCls}
                >
                    {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_name || a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
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
                {saving ? 'Creating…' : 'Create Job Walk'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
