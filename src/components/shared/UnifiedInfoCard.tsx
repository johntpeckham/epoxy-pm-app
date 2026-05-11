'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { SettingsIcon, PencilIcon, UserIcon, CheckIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import LeadSourceDropdown from '@/components/shared/LeadSourceDropdown'
import { formatLeadSource } from '@/lib/crm/leadSources'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'

export type InfoCardParentType = 'lead' | 'appointment' | 'job_walk'

export interface LeadCategoryOption {
  id: string
  name: string
}

export interface UnifiedInfoFields {
  project_name: string | null
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  project_address: string | null
  /**
   * Calendar date as a string. For Lead/JobWalk this is YYYY-MM-DD;
   * for Appointment this is an ISO timestamp (date+time).
   */
  date: string | null
  assigned_to: string | null
  lead_source: string | null
  lead_category_id: string | null
}

interface UnifiedInfoCardProps {
  parentType: InfoCardParentType
  parentId: string
  data: UnifiedInfoFields
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  categories: LeadCategoryOption[]
  isAdmin: boolean
  onPatch: (patch: Partial<UnifiedInfoFields>) => void
  onCategoriesChanged?: (next: LeadCategoryOption[]) => void
}

const TABLE: Record<InfoCardParentType, string> = {
  lead: 'leads',
  appointment: 'crm_appointments',
  job_walk: 'job_walks',
}

function formatDate(dateStr: string | null, withTime: boolean): string | null {
  if (!dateStr) return null
  const d = withTime ? new Date(dateStr) : new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  if (withTime) {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildFullAddress(c: Customer): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
}

export default function UnifiedInfoCard({
  parentType,
  parentId,
  data,
  customers,
  assignees,
  categories,
  isAdmin,
  onPatch,
  onCategoriesChanged,
}: UnifiedInfoCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const usesDateTime = parentType === 'appointment'

  const emptyValue = <span className="text-sm text-gray-300">—</span>

  const assigneeName = useMemo(() => {
    if (!data.assigned_to) return null
    return (
      assignees.find((a) => a.id === data.assigned_to)?.display_name ?? null
    )
  }, [assignees, data.assigned_to])

  const categoryName = useMemo(() => {
    if (!data.lead_category_id) return null
    return categories.find((c) => c.id === data.lead_category_id)?.name ?? null
  }, [categories, data.lead_category_id])

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Project',
      value: data.project_name ? (
        <span className="text-sm text-gray-900">{data.project_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Customer',
      value: data.customer_name ? (
        <span className="text-sm text-gray-900">{data.customer_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Email',
      value: data.customer_email ? (
        <a
          href={`mailto:${data.customer_email}`}
          className="text-sm text-amber-600 hover:underline break-all"
        >
          {data.customer_email}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Phone',
      value: data.customer_phone ? (
        <a
          href={`tel:${data.customer_phone}`}
          className="text-sm text-amber-600 hover:underline"
        >
          {data.customer_phone}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Customer Address',
      value: data.address ? (
        <span className="text-sm text-gray-900">{data.address}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Project Address',
      value: data.project_address ? (
        <span className="text-sm text-gray-900">{data.project_address}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Date',
      value: formatDate(data.date, usesDateTime) ? (
        <span className="text-sm text-gray-900">
          {formatDate(data.date, usesDateTime)}
        </span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Assigned To',
      value: assigneeName ? (
        <span className="text-sm text-gray-900">{assigneeName}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Lead Source',
      value: data.lead_source ? (
        <span className="text-sm text-gray-900">{formatLeadSource(data.lead_source)}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Lead Category',
      value: categoryName ? (
        <span className="text-sm text-gray-900">{categoryName}</span>
      ) : (
        emptyValue
      ),
    },
  ]

  const titleLabel =
    parentType === 'lead'
      ? 'Lead Info'
      : parentType === 'job_walk'
      ? 'Job Walk Info'
      : 'Appointment Info'

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <SettingsIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">{titleLabel}</h3>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label="Edit info"
            className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        </div>

        <dl className="divide-y divide-gray-100">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <dt className="w-32 flex-shrink-0 text-[11px] font-semibold text-gray-400 uppercase tracking-wide pt-0.5">
                {row.label}
              </dt>
              <dd className="flex-1 min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {editOpen && (
        <UnifiedEditInfoModal
          parentType={parentType}
          parentId={parentId}
          data={data}
          customers={customers}
          assignees={assignees}
          categories={categories}
          isAdmin={isAdmin}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => {
            onPatch(patch)
            setEditOpen(false)
          }}
          onCategoriesChanged={onCategoriesChanged}
        />
      )}
    </>
  )
}

interface UnifiedEditInfoModalProps {
  parentType: InfoCardParentType
  parentId: string
  data: UnifiedInfoFields
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  categories: LeadCategoryOption[]
  isAdmin: boolean
  onClose: () => void
  onSaved: (patch: Partial<UnifiedInfoFields>) => void
  onCategoriesChanged?: (next: LeadCategoryOption[]) => void
}

function UnifiedEditInfoModal({
  parentType,
  parentId,
  data,
  customers,
  assignees,
  categories,
  isAdmin,
  onClose,
  onSaved,
  onCategoriesChanged,
}: UnifiedEditInfoModalProps) {
  const usesDateTime = parentType === 'appointment'

  const [projectName, setProjectName] = useState(data.project_name ?? '')
  const [customerQuery, setCustomerQuery] = useState(data.customer_name ?? '')
  const [customerId, setCustomerId] = useState<string | null>(data.company_id)
  const [customerEmail, setCustomerEmail] = useState(data.customer_email ?? '')
  const [customerPhone, setCustomerPhone] = useState(data.customer_phone ?? '')
  const [address, setAddress] = useState(data.address ?? '')
  const [projectAddress, setProjectAddress] = useState(data.project_address ?? '')
  const [sameAsCustomer, setSameAsCustomer] = useState(false)
  const [date, setDate] = useState(toDateInput(data.date, usesDateTime))
  const [assignedTo, setAssignedTo] = useState<string>(data.assigned_to ?? '')
  const [leadSource, setLeadSource] = useState<string>(data.lead_source ?? '')
  const [leadCategoryId, setLeadCategoryId] = useState<string>(
    data.lead_category_id ?? ''
  )
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

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
    const fullAddr = buildFullAddress(c)
    setCustomerId(c.id)
    setCustomerQuery(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerPhone(c.phone ?? '')
    if (fullAddr) setAddress(fullAddr)
    setCustomerDropdownOpen(false)

    const supabase = createClient()
    const { data: primary, error: contactErr } = await supabase
      .from('contacts')
      .select('email, phone')
      .eq('company_id', c.id)
      .eq('is_primary', true)
      .maybeSingle()
    if (contactErr) {
      console.error('[UnifiedInfoCard] Primary contact lookup failed:', {
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
    const existing = categories.find(
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
        console.error('[UnifiedInfoCard] Add category failed:', createErr)
        setSavingCategory(false)
        return
      }
      cat = created as LeadCategoryOption
      if (onCategoriesChanged) {
        const next = [...categories, cat].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
        onCategoriesChanged(next)
      }
    }
    setLeadCategoryId(cat.id)
    setSavingCategory(false)
    setAddingCategory(false)
    setNewCategoryName('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

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
      finalEmail = customerEmail ? customerEmail : null
      finalPhone = customerPhone ? customerPhone : null
    }

    const finalDate = date
      ? usesDateTime
        ? new Date(date).toISOString()
        : date
      : null

    const finalProjectAddress = sameAsCustomer
      ? (address.trim() || null)
      : (projectAddress.trim() || null)

    const patch: Partial<UnifiedInfoFields> = {
      project_name: projectName.trim() || (parentType === 'lead' ? 'Untitled Lead' : parentType === 'job_walk' ? 'Untitled Job Walk' : 'Untitled Appointment'),
      company_id: finalCustomerId,
      customer_name: customerQuery.trim() || null,
      customer_email: finalEmail,
      customer_phone: finalPhone,
      address: address.trim() || null,
      project_address: finalProjectAddress,
      date: finalDate,
      assigned_to: assignedTo || null,
      lead_source: leadSource.trim() || null,
      lead_category_id: leadCategoryId || null,
    }

    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from(TABLE[parentType])
      .update(patch)
      .eq('id', parentId)

    setSaving(false)
    if (updateErr) {
      console.error('[UnifiedInfoCard] Save failed:', {
        code: updateErr.code,
        message: updateErr.message,
        hint: updateErr.hint,
        details: updateErr.details,
      })
      setError(updateErr.message || 'Failed to save changes.')
      return
    }
    onSaved(patch)
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
            <h2 className="text-lg font-semibold text-gray-900">Edit Info</h2>
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
                <label className={labelCls}>Date{usesDateTime ? ' & time' : ''}</label>
                <input
                  type={usesDateTime ? 'datetime-local' : 'date'}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Assigned to</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={!isAdmin}
                  className={`${inputCls} ${!isAdmin ? 'bg-gray-50 text-gray-500' : ''}`}
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
                      {categories.map((c) => (
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
                      + Add
                    </button>
                  </div>
                )}
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

function toDateInput(value: string | null, withTime: boolean): string {
  if (!value) return ''
  if (!withTime) return value.length >= 10 ? value.slice(0, 10) : value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}
