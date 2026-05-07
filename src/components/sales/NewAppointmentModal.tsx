'use client'

import { useState, useEffect, useMemo } from 'react'
import { XIcon, SearchIcon, CheckIcon, PlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'

export interface AppointmentCompanyOption {
  id: string
  name: string
  city: string | null
  state: string | null
}

export interface AppointmentContactOption {
  id: string
  company_id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  is_primary: boolean
}

export interface AppointmentAssigneeOption {
  id: string
  display_name: string | null
}

interface NewAppointmentModalProps {
  userId: string
  isAdmin?: boolean
  prefill?: { companyId?: string; contactId?: string | null }
  companies: AppointmentCompanyOption[]
  contacts: AppointmentContactOption[]
  assignees: AppointmentAssigneeOption[]
  onClose: () => void
  onSaved: (createdId: string) => void
  onCompanyCreated?: (company: AppointmentCompanyOption) => void
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export default function NewAppointmentModal({
  userId,
  isAdmin = true,
  prefill,
  companies,
  contacts,
  assignees,
  onClose,
  onSaved,
  onCompanyCreated,
}: NewAppointmentModalProps) {
  const [companyId, setCompanyId] = useState<string>(prefill?.companyId ?? '')
  const [contactId, setContactId] = useState<string>(prefill?.contactId ?? '')
  const [dateInput, setDateInput] = useState<string>(
    toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString())
  )
  const [assignedTo, setAssignedTo] = useState<string>(userId)
  const [status, setStatus] = useState<'scheduled' | 'completed' | 'cancelled'>('scheduled')
  const [companySearch, setCompanySearch] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingNewCustomer, setCreatingNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  )

  const contactsForCompany = useMemo(
    () => contacts.filter((c) => c.company_id === companyId),
    [contacts, companyId]
  )

  useEffect(() => {
    if (!companyId) return
    if (contactId) return
    const primary = contactsForCompany.find((c) => c.is_primary)
    if (primary) setContactId(primary.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase()
    if (!q) return companies.slice(0, 50)
    return companies
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 50)
  }, [companies, companySearch])

  async function handleSave() {
    if (!companyId) {
      setError('Please select a company.')
      return
    }
    if (!dateInput) {
      setError('Please choose a date and time.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const iso = new Date(dateInput).toISOString()

    const company = companies.find((c) => c.id === companyId)

    const { data: created, error: err } = await supabase
      .from('crm_appointments')
      .insert({
        company_id: companyId,
        contact_id: contactId || null,
        date: iso,
        assigned_to: assignedTo || null,
        status,
        project_name: company?.name ?? null,
        customer_name: company?.name ?? null,
        created_by: userId,
      })
      .select('id')
      .single()
    setSaving(false)
    if (err || !created) {
      console.error('[NewAppointmentModal] Insert failed:', {
        code: err?.code,
        message: err?.message,
        hint: err?.hint,
        details: err?.details,
      })
      setError(err?.message ?? 'Failed to create appointment.')
      return
    }
    onSaved(created.id as string)
  }

  async function handleCreateCustomer() {
    const trimmedName = newCustomerName.trim()
    if (!trimmedName) {
      setError('Customer name is required.')
      return
    }
    setSavingCustomer(true)
    setError(null)
    const supabase = createClient()
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
      .select('id, name, city, state')
      .single()
    setSavingCustomer(false)
    if (custErr || !newCust) {
      setError(`Failed to create customer: ${custErr?.message ?? 'unknown error'}`)
      return
    }
    const created = newCust as AppointmentCompanyOption
    setCompanyId(created.id)
    setContactId('')
    setCreatingNewCustomer(false)
    setNewCustomerName('')
    setNewCustomerEmail('')
    setNewCustomerPhone('')
    setNewCustomerAddress('')
    if (onCompanyCreated) onCompanyCreated(created)
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              New Appointment
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* Company */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Company *
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCompanyDropdown((v) => !v)}
                  className={`${inputClass} text-left flex items-center justify-between`}
                >
                  <span className={selectedCompany ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedCompany
                      ? selectedCompany.name
                      : 'Select a company…'}
                  </span>
                </button>
                {showCompanyDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowCompanyDropdown(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                        <SearchIcon className="w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={companySearch}
                          onChange={(e) => setCompanySearch(e.target.value)}
                          placeholder="Search…"
                          className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-[220px] overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingNewCustomer(true)
                            setNewCustomerName(companySearch)
                            setShowCompanyDropdown(false)
                            setCompanySearch('')
                          }}
                          className="w-full text-left px-3 py-2 border-b border-gray-100 flex items-center gap-2 text-sm text-amber-600 hover:bg-amber-50 transition"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Create new customer
                        </button>
                        {filteredCompanies.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">
                            No matches
                          </div>
                        ) : (
                          filteredCompanies.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCompanyId(c.id)
                                setContactId('')
                                setShowCompanyDropdown(false)
                                setCompanySearch('')
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                                c.id === companyId
                                  ? 'text-amber-600 font-medium'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span className="truncate">
                                {c.name}
                                {(c.city || c.state) && (
                                  <span className="text-gray-400">
                                    {' '}
                                    · {[c.city, c.state].filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </span>
                              {c.id === companyId && (
                                <CheckIcon className="w-4 h-4 text-amber-500" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Company / customer name"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                  <input
                    type="text"
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    placeholder="Street, City, State, Zip"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateCustomer}
                  disabled={!newCustomerName.trim() || savingCustomer}
                  className="w-full px-3 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  {savingCustomer ? 'Creating…' : 'Create Customer'}
                </button>
              </div>
            )}

            {/* Contact */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!companyId}
                className={`${inputClass} ${!companyId ? 'bg-gray-50 text-gray-400' : ''}`}
              >
                <option value="">— No contact —</option>
                {contactsForCompany.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.is_primary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date &amp; time *
              </label>
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Assigned to */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Assigned to
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={!isAdmin}
                className={`${inputClass} ${!isAdmin ? 'bg-gray-50 text-gray-500' : ''}`}
              >
                <option value="">— Unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as typeof status)
                }
                className={inputClass}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div
            className="flex-none flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!companyId || !dateInput || saving}
              className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
