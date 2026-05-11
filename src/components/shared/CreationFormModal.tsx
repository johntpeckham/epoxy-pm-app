'use client'

/**
 * CreationFormModal
 * -----------------
 * This is the single shared creation form for Lead, Appointment, and Job Walk entities.
 *
 * - Add new fields here — they will appear in all six modals automatically.
 * - Add per-type fields via the extraSections prop on the relevant wrapper, not
 *   by editing this component.
 * - Wrappers:
 *   - AddLeadModal, NewAppointmentModal, NewJobWalkModal (standalone)
 *   - ConvertToLeadModal, ConvertToAppointmentModal, ConvertToJobWalkModal
 *     (from CRM company detail page)
 */

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, UserIcon, PlusIcon, CheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import LeadSourceDropdown from '@/components/shared/LeadSourceDropdown'
import type { Customer } from '@/components/proposals/types'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'

export interface LockedCustomer {
  id: string
  name: string
  address: string | null
  email: string | null
  phone: string | null
}

export interface CustomerOption {
  id: string
  name: string
  subtitle?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface AssigneeOption {
  id: string
  display_name: string | null
}

export interface CreationFormData {
  projectName: string
  customerId: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  projectAddress: string | null
  date: string
  projectDetails: string | null
  leadSource: string | null
  leadCategoryId: string | null
  assignedTo: string | null
  createdCustomer: Customer | null
}

export interface CreationFormModalProps {
  title: string
  saveLabel: string
  savingLabel?: string
  projectDetailsPlaceholder?: string

  mode: 'standalone' | 'from_company'
  lockedCustomer?: LockedCustomer | null
  customers?: CustomerOption[]

  userId: string
  isAdmin?: boolean
  assignees?: AssigneeOption[]
  categories?: LeadCategory[]

  autoFillProjectName?: boolean
  showUnassignedAssigneeOption?: boolean
  disableAssigneeWhenNotAdmin?: boolean

  extraSections?: ReactNode
  // Rendered immediately after the Customer block (and the inline new-customer
  // panel, if expanded), before the Email/Phone grid. Use for fields that
  // belong visually under Customer — e.g. the Project Number field on the
  // New Project wrapper. The slot's content owns its own layout; we don't
  // wrap it.
  slotAfterCustomer?: ReactNode
  // When true, hide the single-text Project Address field + the
  // "Same as customer address" checkbox that the shared modal renders by
  // default. Wrappers (like the Project modal) that need a structured
  // 4-field Project Address can set this and render their own in
  // extraSections without showing the duplicate single-text version.
  hideProjectAddressField?: boolean
  // When provided, clicking "Create new customer" in the Customer dropdown
  // calls this callback instead of opening the shared inline panel. Used by
  // the New Project wrapper so it can open NewCustomerSubModal, which
  // creates a richer companies row (status/priority/created_by) plus a
  // primary contacts row carrying phone/email.
  onAddNewCustomerClick?: () => void
  // Initial customer to select on mount. Also re-syncs whenever the value
  // changes — used by the New Project wrapper to programmatically select a
  // customer that NewCustomerSubModal just created.
  prefillCustomerId?: string | null
  // Emits the currently-selected customer id (or null when cleared). Used by
  // the New Project wrapper so it can copy the customer's structured address
  // fields when the "Same as customer address" checkbox is toggled.
  onCustomerChange?: (customerId: string | null) => void
  // Cleanup-pass toggles for wrappers whose target entity has no column for
  // a given field. All default to false ("show / editable") so existing
  // wrappers continue rendering identically. The New Project wrapper sets
  // these because estimating_projects has no date / assigned_to / customer-
  // address columns, and the legacy "create new customer" gating lived in
  // the wrapper.
  hideDateField?: boolean
  hideAssignedToField?: boolean
  hideAddNewCustomerButton?: boolean
  customerAddressReadOnly?: boolean
  // Optional banner-style content rendered at the very top of the form
  // body, above the Project Name field and any error banner. Used by the
  // conversion modal to show the "X photos and Y PDFs will be copied"
  // summary. Each wrapper owns its slot content's layout.
  slotAtTop?: ReactNode
  // Seed values for the modal's locally-owned form state. The modal still
  // owns each piece of state via useState; these just override the empty-
  // string defaults on first render. Useful when pre-filling from an
  // existing row (e.g. ConvertToProjectModal pre-filling from the source).
  // Customer pre-fill goes through lockedCustomer / prefillCustomerId; this
  // prop covers the standalone text/dropdown fields the modal owns.
  initialValues?: {
    projectName?: string
    projectDetails?: string
    leadSource?: string
    leadCategoryId?: string
  }

  onSubmit: (data: CreationFormData) => Promise<string | null>
  onClose: () => void
  onCustomerCreated?: (customer: Customer) => void
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CreationFormModal({
  title,
  saveLabel,
  savingLabel = 'Saving…',
  projectDetailsPlaceholder = 'Scope, purpose of the project, etc.',
  mode,
  lockedCustomer = null,
  customers = [],
  userId,
  isAdmin = true,
  assignees = [],
  categories = [],
  autoFillProjectName = false,
  showUnassignedAssigneeOption = true,
  disableAssigneeWhenNotAdmin = true,
  extraSections,
  slotAfterCustomer,
  hideProjectAddressField = false,
  onAddNewCustomerClick,
  prefillCustomerId = null,
  onCustomerChange,
  hideDateField = false,
  hideAssignedToField = false,
  hideAddNewCustomerButton = false,
  customerAddressReadOnly = false,
  slotAtTop,
  initialValues,
  onSubmit,
  onClose,
  onCustomerCreated,
}: CreationFormModalProps) {
  const locked = mode === 'from_company' ? lockedCustomer : null

  const [projectName, setProjectName] = useState(initialValues?.projectName ?? '')
  const [customerQuery, setCustomerQuery] = useState(locked?.name ?? '')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [creatingNewCustomer, setCreatingNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')
  const [customerEmail, setCustomerEmail] = useState(locked?.email ?? '')
  const [customerPhone, setCustomerPhone] = useState(locked?.phone ?? '')
  const [address, setAddress] = useState(locked?.address ?? '')
  const [projectAddress, setProjectAddress] = useState('')
  const [sameAsCustomer, setSameAsCustomer] = useState(false)
  const [date, setDate] = useState<string>(todayISO())
  const [projectDetails, setProjectDetails] = useState(initialValues?.projectDetails ?? '')
  const [leadSource, setLeadSource] = useState(initialValues?.leadSource ?? '')
  const [leadCategoryId, setLeadCategoryId] = useState<string>(
    initialValues?.leadCategoryId ?? ''
  )
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [localCategories, setLocalCategories] = useState<LeadCategory[]>(categories)
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

  // prefillCustomerId re-sync. When the prop is set (and differs from the
  // last value we applied), find the matching CustomerOption and run
  // handleSelectCustomer so the form fills as if the user had picked it.
  // The ref guards against re-applying the same id, and the selectedCustomer
  // check avoids redundantly re-running when the user themselves just picked
  // this customer (the wrapper round-trips via onCustomerChange).
  const appliedPrefillIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!prefillCustomerId) return
    if (appliedPrefillIdRef.current === prefillCustomerId) return
    const opt = customers.find((c) => c.id === prefillCustomerId)
    if (!opt) return
    appliedPrefillIdRef.current = prefillCustomerId
    if (selectedCustomer?.id !== prefillCustomerId) {
      handleSelectCustomer(opt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomerId, customers])

  useEffect(() => {
    if (sameAsCustomer) setProjectAddress(address)
  }, [sameAsCustomer, address])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 50)
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.subtitle ?? '').toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [customers, customerQuery])

  async function handleSelectCustomer(c: CustomerOption) {
    setSelectedCustomer(c)
    setCreatingNewCustomer(false)
    setCustomerQuery(c.name)
    if (autoFillProjectName && !projectName.trim()) setProjectName(c.name)
    if (c.email) setCustomerEmail(c.email)
    if (c.phone) setCustomerPhone(c.phone)
    if (c.address) setAddress(c.address)
    setDropdownOpen(false)
    onCustomerChange?.(c.id)

    const supabase = createClient()

    if (!c.address) {
      const { data: companyRow, error: companyErr } = await supabase
        .from('companies')
        .select('address, city, state, zip')
        .eq('id', c.id)
        .maybeSingle()
      if (companyErr) {
        console.error('[CreationFormModal] Company address lookup failed:', {
          code: companyErr.code,
          message: companyErr.message,
          hint: companyErr.hint,
          details: companyErr.details,
        })
      } else if (companyRow) {
        const full = [
          companyRow.address,
          companyRow.city,
          companyRow.state,
          companyRow.zip,
        ]
          .filter(Boolean)
          .join(', ')
        if (full) setAddress(full)
      }
    }

    const { data: primary, error: contactErr } = await supabase
      .from('contacts')
      .select('email, phone')
      .eq('company_id', c.id)
      .eq('is_primary', true)
      .maybeSingle()
    if (contactErr) {
      console.error('[CreationFormModal] Primary contact lookup failed:', {
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
        console.error('[CreationFormModal] Add category failed:', {
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
    // If a wrapper has registered an override (e.g. the New Project wrapper
    // routes "Create new customer" through NewCustomerSubModal), call it
    // instead of opening the shared inline panel. The override is fully
    // responsible for the customer-creation UX.
    if (onAddNewCustomerClick) {
      setDropdownOpen(false)
      onAddNewCustomerClick()
      return
    }
    setSelectedCustomer(null)
    setCreatingNewCustomer(true)
    setNewCustomerName(customerQuery)
    setDropdownOpen(false)
    onCustomerChange?.(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectName.trim()) {
      setError('Project name is required.')
      return
    }
    if (
      !locked &&
      !selectedCustomer &&
      !creatingNewCustomer &&
      !customerQuery.trim()
    ) {
      setError('Customer is required.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    let customerId: string | null = locked?.id ?? selectedCustomer?.id ?? null
    let customerName: string | null =
      locked?.name ?? selectedCustomer?.name ?? (customerQuery.trim() || null)
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
        console.error('[CreationFormModal] Create customer failed:', {
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
      if (onCustomerCreated) onCustomerCreated(createdCustomer)
    }

    const finalProjectAddress = sameAsCustomer
      ? finalAddress
      : projectAddress.trim() || null

    const submitError = await onSubmit({
      projectName: projectName.trim(),
      customerId,
      customerName,
      customerEmail: finalEmail,
      customerPhone: finalPhone,
      customerAddress: finalAddress,
      projectAddress: finalProjectAddress,
      date,
      projectDetails: projectDetails.trim() || null,
      leadSource: leadSource.trim() || null,
      leadCategoryId: leadCategoryId || null,
      assignedTo: assignedTo || null,
      createdCustomer,
    })

    setSaving(false)
    if (submitError) {
      setError(submitError)
    }
  }

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'

  const assigneeDisabled = disableAssigneeWhenNotAdmin && !isAdmin

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
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
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
              {slotAtTop}

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

              {locked ? (
                <div>
                  <label className={labelCls}>Customer</label>
                  <div
                    className={`${inputCls} bg-gray-50 text-gray-700 flex items-center gap-2`}
                  >
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{locked.name}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      from company
                    </span>
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
                          if (selectedCustomer) onCustomerChange?.(null)
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
                        {!hideAddNewCustomerButton && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleStartCreate}
                            className="w-full text-left px-3 py-2 border-b border-gray-100 flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-50 transition"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Create new customer
                          </button>
                        )}
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectCustomer(c)}
                            className="w-full text-left px-3 py-2 hover:bg-amber-50 transition flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">
                                {c.name}
                              </p>
                              {c.subtitle && (
                                <p className="text-xs text-gray-500 truncate">
                                  {c.subtitle}
                                </p>
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

              {!locked && creatingNewCustomer && (
                <div className="relative border border-gray-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">
                      New customer details
                    </p>
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

              {slotAfterCustomer}

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
                  readOnly={customerAddressReadOnly}
                  placeholder="Street, City, State, Zip"
                  // When readOnly, mirror the locked-input styling used in
                  // ProjectAddressFields (bg-gray-50 + dimmed text + not-allowed
                  // cursor) so the visual matches other locked inputs.
                  className={`${inputCls} ${
                    customerAddressReadOnly
                      ? 'bg-gray-50 text-gray-600 cursor-not-allowed'
                      : ''
                  }`}
                />
              </div>

              {!hideProjectAddressField && (
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
              )}

              {!hideDateField && (
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}

              <div>
                <label className={labelCls}>Project details</label>
                <textarea
                  value={projectDetails}
                  onChange={(e) => setProjectDetails(e.target.value)}
                  rows={3}
                  placeholder={projectDetailsPlaceholder}
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

              {!hideAssignedToField && (
                <div>
                  <label className={labelCls}>Assigned to</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    disabled={assigneeDisabled}
                    className={`${inputCls} ${assigneeDisabled ? 'bg-gray-50 text-gray-500' : ''}`}
                  >
                    {showUnassignedAssigneeOption && (
                      <option value="">— Unassigned —</option>
                    )}
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name || a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {extraSections}
            </div>

            <div
              className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200"
              style={{
                paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
              }}
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
                {saving ? savingLabel : saveLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
