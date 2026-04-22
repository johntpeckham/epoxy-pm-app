'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { XIcon, AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { US_STATES } from '@/lib/usStates'
import { findSimilarNames } from '@/lib/csv'

interface NewCompanyModalProps {
  userId: string
  onClose: () => void
  onSaved: () => void
}

const INDUSTRY_OPTIONS = [
  'Industrial',
  'Commercial',
  'Warehouse',
  'Food & Bev',
  'Manufacturing',
  'Logistics',
  'Retail',
  'Healthcare',
  'Education',
  'Government',
  'Other',
]

const LEAD_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'other', label: 'Other' },
]

export default function NewCompanyModal({ userId, onClose, onSaved }: NewCompanyModalProps) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [zone, setZone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [status, setStatus] = useState<'prospect' | 'contacted' | 'hot_lead' | 'lost'>('prospect')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [leadSource, setLeadSource] = useState('')
  const [numberOfLocations, setNumberOfLocations] = useState('')
  const [revenueRange, setRevenueRange] = useState('')
  const [employeeRange, setEmployeeRange] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupes, setDupes] = useState<Array<{ id: string; name: string; score: number }>>([])

  // Debounced duplicate check when the user types a name.
  useEffect(() => {
    const trimmed = name.trim()
    if (trimmed.length < 3) {
      setDupes([])
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('companies')
        .select('id, name')
      if (cancelled) return
      const candidates = (data ?? []) as { id: string; name: string }[]
      const matches = findSimilarNames(trimmed, candidates, 0.82).slice(0, 3)
      setDupes(matches)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [name])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: inserted, error: insertErr } = await supabase.from('companies').insert({
      name: name.trim(),
      industry: industry.trim() || null,
      zone: zone.trim() || null,
      address: streetAddress.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      status,
      priority,
      lead_source: leadSource || null,
      number_of_locations: numberOfLocations.trim() ? parseInt(numberOfLocations.trim(), 10) || null : null,
      revenue_range: revenueRange || null,
      employee_range: employeeRange || null,
      created_by: userId,
      archived: false,
    }).select('id').single()
    if (insertErr) {
      setSaving(false)
      setError(insertErr.message)
      return
    }
    if (inserted && (streetAddress.trim() || city.trim() || state.trim())) {
      await supabase.from('crm_company_addresses').insert({
        company_id: inserted.id,
        label: 'Main',
        address: streetAddress.trim() || '',
        city: city.trim() || null,
        state: state.trim() || null,
        is_primary: true,
      })
    }
    setSaving(false)
    onSaved()
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
            <h3 className="text-lg font-semibold text-gray-900">New Company</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Acme Industrial Flooring"
                autoFocus
              />
              {dupes.length > 0 && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangleIcon className="w-4 h-4 mt-0.5 flex-none" />
                  <span>
                    Similar company exists:{' '}
                    {dupes.map((d, i) => (
                      <span key={d.id}>
                        <Link
                          href={`/sales/crm/${d.id}`}
                          className="underline hover:text-amber-900"
                          target="_blank"
                        >
                          {d.name}
                        </Link>
                        {i < dupes.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
                <option value="">— Select —</option>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className={inputClass}
                placeholder="e.g. North"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street address</label>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                className={inputClass}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
                  <option value="">— Select —</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className={inputClass}
                >
                  <option value="prospect">Prospect</option>
                  <option value="contacted">Contacted</option>
                  <option value="hot_lead">Hot Lead</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className={inputClass}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Locations</label>
                <input type="number" value={numberOfLocations} onChange={(e) => setNumberOfLocations(e.target.value)} className={inputClass} placeholder="e.g. 3" min="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Revenue Range</label>
                <select value={revenueRange} onChange={(e) => setRevenueRange(e.target.value)} className={inputClass}>
                  <option value="">— Select —</option>
                  <option value="Under $1M">Under $1M</option>
                  <option value="$1M-$5M">$1M-$5M</option>
                  <option value="$5M-$10M">$5M-$10M</option>
                  <option value="$10M-$50M">$10M-$50M</option>
                  <option value="$50M-$100M">$50M-$100M</option>
                  <option value="$100M+">$100M+</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employees</label>
                <select value={employeeRange} onChange={(e) => setEmployeeRange(e.target.value)} className={inputClass}>
                  <option value="">— Select —</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="501-1000">501-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lead source</label>
                <select
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Select —</option>
                  {LEAD_SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div
            className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200"
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
              disabled={!name.trim() || saving}
              className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
