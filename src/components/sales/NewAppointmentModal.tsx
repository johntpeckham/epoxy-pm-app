'use client'

import { useState, useEffect, useMemo } from 'react'
import { XIcon, SearchIcon, CheckIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

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

export interface AppointmentDraft {
  id?: string
  company_id: string
  contact_id: string | null
  date: string // ISO
  address: string | null
  notes: string | null
  assigned_to: string | null
  status?: 'scheduled' | 'completed' | 'cancelled'
}

interface NewAppointmentModalProps {
  userId: string
  existing?: AppointmentDraft
  prefill?: { companyId?: string; contactId?: string | null }
  companies: AppointmentCompanyOption[]
  contacts: AppointmentContactOption[]
  assignees: AppointmentAssigneeOption[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
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
  existing,
  prefill,
  companies,
  contacts,
  assignees,
  onClose,
  onSaved,
  onDeleted,
}: NewAppointmentModalProps) {
  const isEdit = !!existing?.id

  const [companyId, setCompanyId] = useState<string>(
    existing?.company_id ?? prefill?.companyId ?? ''
  )
  const [contactId, setContactId] = useState<string>(
    existing?.contact_id ?? prefill?.contactId ?? ''
  )
  const [dateInput, setDateInput] = useState<string>(
    existing?.date
      ? toLocalInput(existing.date)
      : toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString())
  )
  const [address, setAddress] = useState<string>(existing?.address ?? '')
  const [notes, setNotes] = useState<string>(existing?.notes ?? '')
  const [assignedTo, setAssignedTo] = useState<string>(
    existing?.assigned_to ?? userId
  )
  const [status, setStatus] = useState<'scheduled' | 'completed' | 'cancelled'>(
    existing?.status ?? 'scheduled'
  )
  const [companySearch, setCompanySearch] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  )

  const contactsForCompany = useMemo(
    () => contacts.filter((c) => c.company_id === companyId),
    [contacts, companyId]
  )

  // When switching company (not in edit mode), auto-fill address from primary address
  // and pick primary contact when none is selected.
  useEffect(() => {
    if (!companyId) return
    if (isEdit) return
    let cancelled = false
    async function loadDefaults() {
      const supabase = createClient()
      // Address: primary address for this company
      const { data: addrRows } = await supabase
        .from('crm_company_addresses')
        .select('address, city, state, zip, is_primary')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .limit(1)
      const addr = (addrRows ?? [])[0] as
        | {
            address: string
            city: string | null
            state: string | null
            zip: string | null
          }
        | undefined
      if (!cancelled && addr && !address) {
        const pieces = [addr.address, [addr.city, addr.state, addr.zip]
          .filter(Boolean)
          .join(', ')].filter(Boolean)
        setAddress(pieces.join(', '))
      }
      // Contact: primary if none selected
      if (!cancelled && !contactId) {
        const primary = contactsForCompany.find((c) => c.is_primary)
        if (primary) setContactId(primary.id)
      }
    }
    loadDefaults()
    return () => {
      cancelled = true
    }
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

    const payload = {
      company_id: companyId,
      contact_id: contactId || null,
      date: iso,
      address: address.trim() || null,
      notes: notes.trim() || null,
      assigned_to: assignedTo || null,
      status,
    }

    if (isEdit && existing?.id) {
      const { error: err } = await supabase
        .from('crm_appointments')
        .update(payload)
        .eq('id', existing.id)
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
    } else {
      const { error: err } = await supabase.from('crm_appointments').insert({
        ...payload,
        created_by: userId,
      })
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
    }
    onSaved()
  }

  async function handleDelete() {
    if (!existing?.id) return
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('crm_appointments')
      .delete()
      .eq('id', existing.id)
    setDeleting(false)
    setConfirmDelete(false)
    if (err) {
      setError(err.message)
      return
    }
    if (onDeleted) onDeleted()
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
            <h3 className="text-base font-bold text-gray-900">
              {isEdit ? 'Edit Appointment' : 'New Appointment'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
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
                        <SearchIcon className="w-3.5 h-3.5 text-gray-400" />
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
                                setAddress('')
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
                                <CheckIcon className="w-3.5 h-3.5 text-amber-500" />
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

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Visit location"
                className={inputClass}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Purpose of the visit, what to bring, etc."
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
                className={inputClass}
              >
                <option value="">— Unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
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
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div
            className="flex-none flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            {isEdit ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2Icon className="w-4 h-4" />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
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
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete appointment?"
          message="This will permanently remove the appointment. This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          loading={deleting}
          variant="destructive"
        />
      )}
    </Portal>
  )
}
