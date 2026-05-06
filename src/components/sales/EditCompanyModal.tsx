'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { US_STATES } from '@/lib/usStates'
import { useAssignableUsers } from '@/lib/useAssignableUsers'

export interface EditableCompany {
  id: string
  name: string
  industry: string | null
  zone: string | null
  state: string | null
  city: string | null
  address: string | null
  status: 'prospect' | 'contacted' | 'lead_created' | 'appointment_made' | 'not_very_interested' | 'blacklisted'
  priority: 'high' | 'medium' | 'low' | null
  lead_source: string | null
  assigned_to: string | null
  number_of_locations: number | null
  revenue_range: string | null
  employee_range: string | null
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
  const [streetAddress, setStreetAddress] = useState(company.address ?? '')
  const [state, setState] = useState(company.state ?? '')
  const [city, setCity] = useState(company.city ?? '')
  const [status, setStatus] = useState(company.status)
  const [priority, setPriority] = useState(company.priority ?? 'medium')
  const [leadSource, setLeadSource] = useState(company.lead_source ?? '')
  const [assignedTo, setAssignedTo] = useState(company.assigned_to ?? '')
  const [numberOfLocations, setNumberOfLocations] = useState<string>(company.number_of_locations != null ? String(company.number_of_locations) : '')
  const [revenueRange, setRevenueRange] = useState(company.revenue_range ?? '')
  const [employeeRange, setEmployeeRange] = useState(company.employee_range ?? '')
  const { users } = useAssignableUsers()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        zone: zone.trim() || null,
        address: streetAddress.trim() || null,
        state: state.trim() || null,
        city: city.trim() || null,
        status,
        priority,
        lead_source: leadSource || null,
        assigned_to: assignedTo || null,
        number_of_locations: numberOfLocations.trim() ? parseInt(numberOfLocations.trim(), 10) || null : null,
        revenue_range: revenueRange || null,
        employee_range: employeeRange || null,
      })
      .eq('id', company.id)
    if (err) {
      setSaving(false)
      setError(err.message)
      return
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
              <input type="text" value={zone} onChange={(e) => setZone(e.target.value)} className={inputClass} placeholder="e.g. North" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Street address</label>
              <input type="text" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} className={inputClass} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
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
                  <option value="lead_created">Lead Created</option>
                  <option value="appointment_made">Appointment Made</option>
                  <option value="not_very_interested">Not Very Interested</option>
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
