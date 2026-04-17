'use client'

import { useState, useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { US_STATES } from '@/lib/usStates'

export interface EditableCompany {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: 'prospect' | 'contacted' | 'hot_lead' | 'lost' | 'blacklisted'
  priority: 'high' | 'medium' | 'low' | null
  lead_source: string | null
  deal_value: number | null
  assigned_to: string | null
}

export interface AssignableUser {
  id: string
  display_name: string | null
}

interface EditCompanyModalProps {
  company: EditableCompany
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

export default function EditCompanyModal({
  company,
  onClose,
  onSaved,
}: EditCompanyModalProps) {
  const [name, setName] = useState(company.name)
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [zone, setZone] = useState(company.zone ?? '')
  const [region, setRegion] = useState(company.region ?? '')
  const [state, setState] = useState(company.state ?? '')
  const [county, setCounty] = useState(company.county ?? '')
  const [city, setCity] = useState(company.city ?? '')
  const [status, setStatus] = useState(company.status)
  const [priority, setPriority] = useState(company.priority ?? 'medium')
  const [leadSource, setLeadSource] = useState(company.lead_source ?? '')
  const [dealValue, setDealValue] = useState(String(company.deal_value ?? 0))
  const [assignedTo, setAssignedTo] = useState(company.assigned_to ?? '')
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'office_manager', 'salesman'])
      .order('display_name', { ascending: true })
      .then(({ data }) => {
        setUsers(
          ((data ?? []) as { id: string; display_name: string | null }[]).map((u) => ({
            id: u.id,
            display_name: u.display_name,
          }))
        )
      })
  }, [])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('crm_companies')
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        zone: zone.trim() || null,
        region: region.trim() || null,
        state: state.trim() || null,
        county: county.trim() || null,
        city: city.trim() || null,
        status,
        priority,
        lead_source: leadSource || null,
        deal_value: Number(dealValue) || 0,
        assigned_to: assignedTo || null,
      })
      .eq('id', company.id)
    setSaving(false)
    if (err) {
      setError(err.message)
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
            <h3 className="text-lg font-semibold text-gray-900">Edit Company</h3>
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
                <input type="text" value={zone} onChange={(e) => setZone(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">County</label>
                <input type="text" value={county} onChange={(e) => setCounty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass}>
                  <option value="prospect">Prospect</option>
                  <option value="contacted">Contacted</option>
                  <option value="hot_lead">Hot Lead</option>
                  <option value="lost">Lost</option>
                  <option value="blacklisted">Blacklisted</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={inputClass}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lead source</label>
                <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={inputClass}>
                  <option value="">— Select —</option>
                  {LEAD_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned to</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
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
