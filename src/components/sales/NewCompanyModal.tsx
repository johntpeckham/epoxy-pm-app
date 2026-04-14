'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { US_STATES } from '@/lib/usStates'

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
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [status, setStatus] = useState<'prospect' | 'contacted' | 'hot_lead' | 'lost'>('prospect')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [leadSource, setLeadSource] = useState('')
  const [dealValue, setDealValue] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: insertErr } = await supabase.from('crm_companies').insert({
      name: name.trim(),
      industry: industry.trim() || null,
      zone: zone.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      status,
      priority,
      lead_source: leadSource || null,
      deal_value: Number(dealValue) || 0,
      created_by: userId,
    })
    setSaving(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
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
            <h3 className="text-base font-bold text-gray-900">New Company</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
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
            <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
              </div>
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deal value ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  className={inputClass}
                />
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
              className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
