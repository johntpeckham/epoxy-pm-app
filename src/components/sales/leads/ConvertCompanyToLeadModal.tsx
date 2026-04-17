'use client'

import { useState, useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { LeadCategory } from './LeadsClient'

interface ConvertCompanyToLeadModalProps {
  userId: string
  companyId: string
  companyName: string
  companyCity: string | null
  companyState: string | null
  primaryContact: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
  } | null
  primaryAddress: {
    address: string
    city: string | null
    state: string | null
    zip: string | null
  } | null
  onClose: () => void
  onConverted: (leadId: string) => void
}

function buildFullAddress(a: {
  address: string
  city: string | null
  state: string | null
  zip: string | null
}): string {
  return [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ')
}

export default function ConvertCompanyToLeadModal({
  userId,
  companyId,
  companyName,
  companyCity,
  companyState,
  primaryContact,
  primaryAddress,
  onClose,
  onConverted,
}: ConvertCompanyToLeadModalProps) {
  const [projectName, setProjectName] = useState(companyName)
  const [categories, setCategories] = useState<LeadCategory[]>([])
  const [category, setCategory] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCategories() {
      const supabase = createClient()
      const { data } = await supabase
        .from('lead_categories')
        .select('*')
        .order('name', { ascending: true })
      setCategories((data as LeadCategory[]) ?? [])
    }
    loadCategories()
  }, [])

  async function handleConvert() {
    if (!projectName.trim()) {
      setError('Project name is required.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const contactName = primaryContact
      ? `${primaryContact.first_name} ${primaryContact.last_name}`.trim()
      : companyName
    const email = primaryContact?.email ?? null
    const phone = primaryContact?.phone ?? null
    const address = primaryAddress ? buildFullAddress(primaryAddress) : null

    const { data: newLead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        project_name: projectName.trim(),
        company_id: companyId,
        customer_name: contactName || companyName,
        customer_email: email,
        customer_phone: phone,
        address,
        date: new Date().toISOString().slice(0, 10),
        status: 'in_progress',
        category: category || null,
        created_by: userId,
      })
      .select('id')
      .single()

    setSaving(false)
    if (leadErr || !newLead) {
      setError(`Lead create failed: ${leadErr?.message ?? 'unknown error'}`)
      return
    }
    onConverted((newLead as { id: string }).id)
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">Convert to lead</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className={labelCls}>
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
              >
                <option value="">— Select —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Pre-filled from company
              </p>
              <p className="text-sm text-gray-700">
                {primaryContact
                  ? `${primaryContact.first_name} ${primaryContact.last_name}`
                  : companyName}
              </p>
              {primaryContact?.email && (
                <p className="text-xs text-gray-500">{primaryContact.email}</p>
              )}
              {primaryContact?.phone && (
                <p className="text-xs text-gray-500">{primaryContact.phone}</p>
              )}
              {primaryAddress && (
                <p className="text-xs text-gray-500">
                  {buildFullAddress(primaryAddress)}
                </p>
              )}
            </div>
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConvert}
              disabled={saving || !projectName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create lead'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
