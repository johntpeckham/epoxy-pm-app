'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, UserIcon, CheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { JobWalk } from './JobWalkClient'

interface JobWalkEditInfoModalProps {
  walk: JobWalk
  customers: Customer[]
  assignees?: AppointmentAssigneeOption[]
  onClose: () => void
  onSaved: (patch: Partial<JobWalk>) => void
}

function buildFullAddress(c: Customer): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
}

export default function JobWalkEditInfoModal({
  walk,
  customers,
  assignees = [],
  onClose,
  onSaved,
}: JobWalkEditInfoModalProps) {
  const [projectName, setProjectName] = useState(walk.project_name ?? '')
  const [customerQuery, setCustomerQuery] = useState(walk.customer_name ?? '')
  const [customerId, setCustomerId] = useState<string | null>(walk.company_id)
  const [customerEmail, setCustomerEmail] = useState(walk.customer_email ?? '')
  const [customerPhone, setCustomerPhone] = useState(walk.customer_phone ?? '')
  const [address, setAddress] = useState(walk.address ?? '')
  const [date, setDate] = useState(walk.date ?? '')
  const [assignedTo, setAssignedTo] = useState<string>(walk.assigned_to ?? '')

  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customerDropdownRef = useRef<HTMLDivElement>(null)

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

  function handleSelectCustomer(c: Customer) {
    const fullAddr = buildFullAddress(c)
    setCustomerId(c.id)
    setCustomerQuery(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerPhone(c.phone ?? '')
    if (fullAddr) setAddress(fullAddr)
    setCustomerDropdownOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Detach linked customer if the name was edited to something different
    let finalCustomerId = customerId
    let finalEmail: string | null = customerEmail || null
    let finalPhone: string | null = customerPhone || null
    if (customerId) {
      const linked = customers.find((c) => c.id === customerId)
      if (!linked || linked.name !== customerQuery.trim()) {
        finalCustomerId = null
      }
    }
    if (!finalCustomerId) {
      // manual customer — keep the email/phone the user typed
      finalEmail = customerEmail ? customerEmail : null
      finalPhone = customerPhone ? customerPhone : null
    }

    const patch: Partial<JobWalk> = {
      project_name: projectName.trim() || 'Untitled Job Walk',
      company_id: finalCustomerId,
      customer_name: customerQuery.trim() || null,
      customer_email: finalEmail,
      customer_phone: finalPhone,
      address: address.trim() || null,
      date: date || null,
      assigned_to: assignedTo || null,
    }

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('job_walks')
      .update(patch)
      .eq('id', walk.id)

    setSaving(false)
    if (updateErr) {
      console.error('[JobWalk] Edit save failed:', updateErr)
      setError(updateErr.message || 'Failed to save changes.')
      return
    }
    onSaved(patch)
    onClose()
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h2 className="text-lg font-semibold text-gray-900">Edit Job Walk Info</h2>
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
                <label className={labelCls}>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  className={inputCls}
                />
              </div>

              <div ref={customerDropdownRef}>
                <label className={labelCls}>Customer</label>
                <div className="relative">
                  <div className="relative">
                    <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value)
                        setCustomerDropdownOpen(true)
                        // If user edits the linked customer's name, detach + clear
                        if (customerId) {
                          const linked = customers.find((c) => c.id === customerId)
                          if (!linked || linked.name !== e.target.value) {
                            setCustomerId(null)
                          }
                        }
                      }}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      placeholder="Search or type a new customer name"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  {customerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">
                          No matching customers — you can keep this name as a new customer.
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
                            {customerId === c.id && (
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
                  <label className={labelCls}>Customer Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    readOnly={Boolean(customerId)}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="—"
                    className={`${inputCls} ${customerId ? 'bg-gray-50 text-gray-600' : ''}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Customer Phone</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    readOnly={Boolean(customerId)}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="—"
                    className={`${inputCls} ${customerId ? 'bg-gray-50 text-gray-600' : ''}`}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, State, Zip"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  value={date ?? ''}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Assigned to</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Unassigned —</option>
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
