'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { EstimateSettings } from './types'

interface SettingsModalProps {
  settings: EstimateSettings
  userId: string
  onSave: (updated: EstimateSettings) => void
  onClose: () => void
}

export default function SettingsModal({ settings, userId, onSave, onClose }: SettingsModalProps) {
  const [nextNumber, setNextNumber] = useState(settings.next_estimate_number)
  const [companyName, setCompanyName] = useState(settings.company_name ?? '')
  const [companyAddress, setCompanyAddress] = useState(settings.company_address ?? '')
  const [companyCityStateZip, setCompanyCityStateZip] = useState(settings.company_city_state_zip ?? '')
  const [companyWebsite, setCompanyWebsite] = useState(settings.company_website ?? '')
  const [companyPhone, setCompanyPhone] = useState(settings.company_phone ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('estimate_settings')
      .update({
        next_estimate_number: nextNumber,
        company_name: companyName || null,
        company_address: companyAddress || null,
        company_city_state_zip: companyCityStateZip || null,
        company_website: companyWebsite || null,
        company_phone: companyPhone || null,
      })
      .eq('user_id', userId)
      .select()
      .single()
    setSaving(false)
    if (data) onSave(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Estimate Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Next Estimate Number</label>
            <input
              type="number"
              value={nextNumber}
              onChange={(e) => setNextNumber(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Address</label>
            <input
              type="text"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City, State, Zip</label>
            <input
              type="text"
              value={companyCityStateZip}
              onChange={(e) => setCompanyCityStateZip(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
            <input
              type="text"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input
              type="text"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
