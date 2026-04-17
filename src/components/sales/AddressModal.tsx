'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { US_STATES } from '@/lib/usStates'

export interface AddressForModal {
  id?: string
  label: string | null
  address: string
  city: string | null
  state: string | null
  zip: string | null
  is_primary: boolean
}

interface AddressModalProps {
  companyId: string
  existing?: AddressForModal
  onClose: () => void
  onSaved: () => void
}

export default function AddressModal({
  companyId,
  existing,
  onClose,
  onSaved,
}: AddressModalProps) {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [city, setCity] = useState(existing?.city ?? '')
  const [state, setState] = useState(existing?.state ?? '')
  const [zip, setZip] = useState(existing?.zip ?? '')
  const [isPrimary, setIsPrimary] = useState(existing?.is_primary ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!existing?.id

  async function handleSave() {
    if (!address.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    if (isPrimary) {
      await supabase
        .from('crm_company_addresses')
        .update({ is_primary: false })
        .eq('company_id', companyId)
    }

    const payload = {
      label: label.trim() || null,
      address: address.trim(),
      city: city.trim() || null,
      state: state.trim() || null,
      zip: zip.trim() || null,
      is_primary: isPrimary,
    }

    if (isEdit && existing?.id) {
      const { error: err } = await supabase
        .from('crm_company_addresses')
        .update(payload)
        .eq('id', existing.id)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      const { error: err } = await supabase
        .from('crm_company_addresses')
        .insert({ ...payload, company_id: companyId })
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Address' : 'New Address'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={inputClass}
                placeholder="e.g. Main Office"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address *</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
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
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
              />
              Primary address
            </label>
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
              disabled={!address.trim() || saving}
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
