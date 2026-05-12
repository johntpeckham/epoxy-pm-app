'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { XIcon, UserIcon, CheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import LeadSourceDropdown from '@/components/shared/LeadSourceDropdown'
import { sortCategoriesWithOtherLast } from '@/lib/leadCategories'
import type { Customer } from '@/components/proposals/types'
import type { EstimatingProject } from './types'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import ProjectAddressFields, {
  EMPTY_ADDRESS,
  addressEquals,
  isAddressBlank,
  type AddressValues,
} from './ProjectAddressFields'

interface ProjectEditInfoModalProps {
  project: EstimatingProject
  // The currently-linked customer for read-only "Customer Address"
  // display. Stays in sync with the dropdown selection while the modal
  // is open via the internal selectedCustomerId state — onUpdated runs
  // after save, at which point the parent re-resolves.
  customer: Customer
  customers: Customer[]
  categories: LeadCategory[]
  userId: string
  onClose: () => void
  onUpdated: (patch: Partial<EstimatingProject>) => void
}

export default function ProjectEditInfoModal({
  project,
  customer,
  customers,
  categories,
  userId: _userId,
  onClose,
  onUpdated,
}: ProjectEditInfoModalProps) {
  // Initial state — seeded from the current project row. Each field is
  // edited locally; we write all changes to estimating_projects on submit.
  const [projectNumber, setProjectNumber] = useState(project.project_number ?? '')
  const [name, setName] = useState(project.name ?? '')
  const [description, setDescription] = useState(project.description ?? '')
  const [email, setEmail] = useState(project.email ?? '')
  const [phone, setPhone] = useState(project.phone ?? '')
  const [leadSource, setLeadSource] = useState(project.lead_source ?? '')
  const [leadCategoryId, setLeadCategoryId] = useState(project.lead_category_id ?? '')

  // Customer picker state. selectedCustomerId is the source of truth for the
  // company_id column; customerQuery is just the search-box text.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    project.company_id
  )
  const [customerQuery, setCustomerQuery] = useState(customer.name)
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)

  // Project address (structured, 4 fields) + "Same as customer" checkbox.
  // Logic mirrors the NewProjectModal: when checked, copy the four customer
  // columns directly; on uncheck, leave the fields where they are.
  const initialProjectAddress: AddressValues = useMemo(
    () => ({
      street: project.project_address_street ?? '',
      city: project.project_address_city ?? '',
      state: project.project_address_state ?? '',
      zip: project.project_address_zip ?? '',
    }),
    [project]
  )
  const [projectAddress, setProjectAddress] = useState<AddressValues>(initialProjectAddress)

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? customer,
    [customers, selectedCustomerId, customer]
  )

  const customerStructuredAddress: AddressValues = useMemo(
    () => ({
      street: selectedCustomer?.address ?? '',
      city: selectedCustomer?.city ?? '',
      state: selectedCustomer?.state ?? '',
      zip: selectedCustomer?.zip ?? '',
    }),
    [selectedCustomer]
  )

  // Pre-tick the box if the saved project address already matches the
  // current customer's address (and isn't both-blank). Matches the
  // pre-retirement EditProjectModal behavior.
  const [sameAsCustomer, setSameAsCustomer] = useState(
    !isAddressBlank(initialProjectAddress) &&
      addressEquals(initialProjectAddress, customerStructuredAddress)
  )

  // While the checkbox is on, keep project address synced to the
  // currently-selected customer. Triggered when the user picks a different
  // customer with the box ticked — the project fields follow.
  useEffect(() => {
    if (sameAsCustomer) {
      setProjectAddress(customerStructuredAddress)
    }
  }, [sameAsCustomer, customerStructuredAddress])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false)
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

  function handleSameAsCustomerChange(checked: boolean) {
    if (checked) {
      setProjectAddress(customerStructuredAddress)
    }
    // On uncheck, leave fields where they are — matches NewProjectModal.
    setSameAsCustomer(checked)
  }

  async function handleSelectCustomer(c: Customer) {
    setSelectedCustomerId(c.id)
    setCustomerQuery(c.name)
    setCustomerDropdownOpen(false)

    // Pull the customer's primary contact for email/phone auto-fill, same
    // pattern as the NewProjectModal customer picker.
    const supabase = createClient()
    const { data: primary, error: contactErr } = await supabase
      .from('contacts')
      .select('email, phone')
      .eq('company_id', c.id)
      .eq('is_primary', true)
      .maybeSingle()
    if (contactErr) {
      console.error('[ProjectEditInfoModal] Primary contact lookup failed:', {
        code: contactErr.code,
        message: contactErr.message,
        hint: contactErr.hint,
        details: contactErr.details,
      })
      // Fall back to the company's email/phone columns if present.
      if (c.email) setEmail(c.email)
      if (c.phone) setPhone(c.phone)
      return
    }
    if (primary) {
      if (primary.email) setEmail(primary.email)
      if (primary.phone) setPhone(primary.phone)
    } else {
      // No primary contact — fall back to the company's own email/phone
      // columns if those carry anything.
      if (c.email) setEmail(c.email)
      if (c.phone) setPhone(c.phone)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Project name cannot be empty.')
      return
    }
    if (!projectNumber.trim()) {
      setError('Project number cannot be empty.')
      return
    }
    if (!selectedCustomerId) {
      setError('Please select a customer.')
      return
    }

    setSaving(true)
    setError(null)

    const patch: Partial<EstimatingProject> = {
      project_number: projectNumber.trim(),
      name: name.trim(),
      description: description.trim() || null,
      company_id: selectedCustomerId,
      email: email.trim() || null,
      phone: phone.trim() || null,
      project_address_street: projectAddress.street.trim() || null,
      project_address_city: projectAddress.city.trim() || null,
      project_address_state: projectAddress.state.trim() || null,
      project_address_zip: projectAddress.zip.trim() || null,
      lead_source: leadSource.trim() || null,
      lead_category_id: leadCategoryId || null,
    }

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('estimating_projects')
      .update(patch)
      .eq('id', project.id)

    if (updateErr) {
      setSaving(false)
      console.error('[ProjectEditInfoModal] Save failed:', {
        code: updateErr.code,
        message: updateErr.message,
        hint: updateErr.hint,
        details: updateErr.details,
      })
      const msg = updateErr.message ?? 'unknown error'
      if (
        updateErr.code === '23505' ||
        msg.toLowerCase().includes('duplicate')
      ) {
        setError(
          `Project number ${patch.project_number} is already in use. Please pick a different number.`
        )
      } else {
        setError(`Failed to save project: ${msg}`)
      }
      return
    }

    setSaving(false)
    onUpdated(patch)
    onClose()
  }

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'
  const readOnlyInputCls = `${inputCls} bg-gray-50 text-gray-600 cursor-not-allowed`

  const customerAddressDisplay = [
    selectedCustomer?.address,
    selectedCustomer?.city,
    selectedCustomer?.state,
    selectedCustomer?.zip,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h2 className="text-lg font-semibold text-gray-900">Edit Project Info</h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSave()
            }}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className={labelCls}>Project Number</label>
                <input
                  type="text"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div ref={customerDropdownRef}>
                <label className={labelCls}>
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="relative">
                    <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value)
                        setCustomerDropdownOpen(true)
                        if (selectedCustomerId) {
                          const linked = customers.find((c) => c.id === selectedCustomerId)
                          if (!linked || linked.name !== e.target.value) {
                            setSelectedCustomerId(null)
                          }
                        }
                      }}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      placeholder="Search customers…"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  {customerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">
                          No matching customers.
                        </div>
                      ) : (
                        filteredCustomers.map((c) => (
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
                            {selectedCustomerId === c.id && (
                              <CheckIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="—"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="—"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Customer Address</label>
                <input
                  type="text"
                  value={customerAddressDisplay}
                  readOnly
                  placeholder="—"
                  className={readOnlyInputCls}
                />
              </div>

              <ProjectAddressFields
                hideCustomerAddress
                customerAddress={customerStructuredAddress}
                projectAddress={projectAddress}
                sameAsCustomer={sameAsCustomer}
                onProjectAddressChange={setProjectAddress}
                onSameAsCustomerChange={handleSameAsCustomerChange}
              />

              <div>
                <label className={labelCls}>Project details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional project notes…"
                  className={`${inputCls} resize-y`}
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
                <select
                  value={leadCategoryId}
                  onChange={(e) => setLeadCategoryId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {sortCategoriesWithOtherLast(categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
