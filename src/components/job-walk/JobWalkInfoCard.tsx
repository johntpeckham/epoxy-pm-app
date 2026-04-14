'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { SettingsIcon, ChevronDownIcon, CheckIcon, UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/estimates/types'
import type { JobWalk, JobWalkStatus } from './JobWalkClient'

interface JobWalkInfoCardProps {
  walk: JobWalk
  customers: Customer[]
  onPatch: (patch: Partial<JobWalk>) => void
}

const STATUS_OPTIONS: { value: JobWalkStatus; label: string; dot: string }[] = [
  { value: 'in_progress', label: 'In Progress', dot: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', dot: 'bg-green-500' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating', dot: 'bg-blue-500' },
]

function buildFullAddress(c: Customer): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
}

export default function JobWalkInfoCard({ walk, customers, onPatch }: JobWalkInfoCardProps) {
  // Local form state (mirrors walk but lets us debounce saves).
  // Parent remounts this component with a new key when walk.id changes,
  // so these initial values always reflect the freshly-selected walk.
  const [projectName, setProjectName] = useState(walk.project_name ?? '')
  const [customerQuery, setCustomerQuery] = useState(walk.customer_name ?? '')
  const [customerId, setCustomerId] = useState<string | null>(walk.customer_id)
  const [customerEmail, setCustomerEmail] = useState(walk.customer_email ?? '')
  const [customerPhone, setCustomerPhone] = useState(walk.customer_phone ?? '')
  const [address, setAddress] = useState(walk.address ?? '')
  const [date, setDate] = useState(walk.date ?? '')
  const [status, setStatus] = useState<JobWalkStatus>(walk.status)

  // Dropdown open states
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)

  // Save indicator
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false)
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(e.target as Node)
      ) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function queueSave(patch: Partial<JobWalk>, immediate = false) {
    onPatch(patch)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    const doSave = async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from('job_walks')
        .update(patch)
        .eq('id', walk.id)
      if (error) {
        console.error('[JobWalk] Save failed:', error)
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(() => setSaveState('idle'), 1500)
      }
    }
    if (immediate) {
      doSave()
    } else {
      saveTimerRef.current = setTimeout(doSave, 700)
    }
  }

  function handleSelectCustomer(c: Customer) {
    const fullAddr = buildFullAddress(c)
    setCustomerId(c.id)
    setCustomerQuery(c.name)
    setCustomerEmail(c.email ?? '')
    setCustomerPhone(c.phone ?? '')
    if (fullAddr) setAddress(fullAddr)
    setCustomerDropdownOpen(false)
    queueSave(
      {
        customer_id: c.id,
        customer_name: c.name,
        customer_email: c.email,
        customer_phone: c.phone,
        ...(fullAddr ? { address: fullAddr } : {}),
      },
      true
    )
  }

  function handleManualCustomerBlur() {
    // Persist the manually-typed customer name; detach from any linked customer
    const trimmed = customerQuery.trim()
    const patch: Partial<JobWalk> = { customer_name: trimmed || null }
    if (customerId) {
      // If the typed value differs from the linked customer's name, detach
      const linked = customers.find((c) => c.id === customerId)
      if (!linked || linked.name !== trimmed) {
        patch.customer_id = null
        patch.customer_email = null
        patch.customer_phone = null
        setCustomerId(null)
        setCustomerEmail('')
        setCustomerPhone('')
      }
    }
    queueSave(patch)
  }

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q)
    )
  }, [customers, customerQuery])

  const labelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide'
  const inputCls =
    'w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <SettingsIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Job Walk Info</h3>
        <span className="text-xs text-gray-400 min-w-[54px] text-right">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && <span className="text-red-500">Error</span>}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {/* Project Name */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value)
              queueSave({ project_name: e.target.value })
            }}
            placeholder="Enter project name"
            className={inputCls}
          />
        </div>

        {/* Customer */}
        <div className="sm:col-span-2" ref={customerDropdownRef}>
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
                }}
                onFocus={() => setCustomerDropdownOpen(true)}
                onBlur={() => {
                  // Small delay so clicks on dropdown items fire first
                  setTimeout(() => {
                    handleManualCustomerBlur()
                  }, 150)
                }}
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

        {/* Email (read-only when populated from customer) */}
        <div>
          <label className={labelCls}>Customer Email</label>
          <input
            type="email"
            value={customerEmail}
            readOnly={Boolean(customerId)}
            onChange={(e) => {
              setCustomerEmail(e.target.value)
              queueSave({ customer_email: e.target.value || null })
            }}
            placeholder="—"
            className={`${inputCls} ${customerId ? 'bg-gray-50 text-gray-600' : ''}`}
          />
        </div>

        {/* Phone (read-only when populated from customer) */}
        <div>
          <label className={labelCls}>Customer Phone</label>
          <input
            type="tel"
            value={customerPhone}
            readOnly={Boolean(customerId)}
            onChange={(e) => {
              setCustomerPhone(e.target.value)
              queueSave({ customer_phone: e.target.value || null })
            }}
            placeholder="—"
            className={`${inputCls} ${customerId ? 'bg-gray-50 text-gray-600' : ''}`}
          />
        </div>

        {/* Address */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              queueSave({ address: e.target.value || null })
            }}
            placeholder="Street, City, State, Zip"
            className={inputCls}
          />
        </div>

        {/* Date */}
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={date ?? ''}
            onChange={(e) => {
              setDate(e.target.value)
              queueSave({ date: e.target.value || null })
            }}
            className={inputCls}
          />
        </div>

        {/* Status */}
        <div ref={statusDropdownRef}>
          <label className={labelCls}>Status</label>
          <div className="relative mt-1">
            <button
              type="button"
              onClick={() => setStatusDropdownOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <span className={`w-2 h-2 rounded-full ${currentStatus.dot}`} />
              <span className="flex-1 text-left">{currentStatus.label}</span>
              <ChevronDownIcon
                className={`w-4 h-4 text-gray-400 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {statusDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatus(opt.value)
                      setStatusDropdownOpen(false)
                      queueSave({ status: opt.value }, true)
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                      opt.value === status ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                    <span className="text-sm text-gray-700 flex-1">{opt.label}</span>
                    {opt.value === status && (
                      <CheckIcon className="w-4 h-4 text-amber-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
