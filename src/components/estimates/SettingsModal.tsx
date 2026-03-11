'use client'

import { useState, useRef } from 'react'
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
  const [logoBase64, setLogoBase64] = useState<string | null>(settings.logo_base64 ?? null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setLogoBase64(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

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
        logo_base64: logoBase64,
      })
      .eq('user_id', userId)
      .select()
      .single()
    setSaving(false)
    if (data) onSave(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Estimate Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {/* Company Logo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Logo</label>
            {logoBase64 ? (
              <div>
                <img
                  src={logoBase64}
                  alt="Company logo"
                  className="max-h-[120px] object-contain rounded border border-gray-200 bg-gray-50 p-2"
                />
                <button
                  type="button"
                  onClick={() => setLogoBase64(null)}
                  className="text-xs text-red-500 hover:text-red-700 mt-1"
                >
                  Remove logo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-center text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
              >
                Click to upload logo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
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
        <div className="flex justify-end gap-2 px-5 py-4 pb-6 border-t border-gray-200">
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
