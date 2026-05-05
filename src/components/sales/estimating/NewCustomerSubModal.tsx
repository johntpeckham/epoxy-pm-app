'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/proposals/types'

interface NewCustomerSubModalProps {
  userId: string
  onClose: () => void
  onCreated: (customer: Customer) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NewCustomerSubModal({
  userId,
  onClose,
  onCreated,
}: NewCustomerSubModalProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  const emailInvalid = trimmedEmail !== '' && !EMAIL_RE.test(trimmedEmail)
  const canSubmit = trimmedName.length > 0 && !emailInvalid && !saving

  async function handleCreate() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    // Insert the company. Defaults mirror CRM's NewCompanyModal (status,
    // priority, archived). Phone/email aren't columns on companies — they
    // are stored on a primary contact row below if the user provided them.
    const { data: inserted, error: insertErr } = await supabase
      .from('companies')
      .insert({
        name: trimmedName,
        address: street.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        status: 'prospect',
        priority: 'medium',
        archived: false,
        created_by: userId,
      })
      .select('*')
      .single()

    if (insertErr || !inserted) {
      setSaving(false)
      setError(insertErr?.message ?? 'Failed to create customer.')
      return
    }

    // If phone or email was provided, create a primary contact carrying them.
    // Mirrors NewContactModal's first/last name split.
    const phoneTrim = phone.trim()
    if (phoneTrim || trimmedEmail) {
      const tokens = trimmedName.split(/\s+/)
      const firstName = tokens[0] ?? trimmedName
      const lastName = tokens.slice(1).join(' ')
      const { error: contactErr } = await supabase.from('contacts').insert({
        company_id: inserted.id,
        first_name: firstName,
        last_name: lastName,
        email: trimmedEmail || null,
        phone: phoneTrim || null,
        is_primary: true,
      })
      if (contactErr) {
        // Company was created successfully; surface a non-blocking warning
        // and still proceed so the user isn't stuck.
        console.error('[NewCustomerSubModal] Primary contact insert failed:', contactErr)
      }
    }

    setSaving(false)
    onCreated(inserted as Customer)
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">New customer</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Customer name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="e.g. Acme Industrial Flooring"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
                className={inputClass}
              />
              {emailInvalid && (
                <p className="mt-1 text-xs text-red-600">Please enter a valid email address.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Street</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="123 Main St"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  maxLength={2}
                  placeholder="CA"
                  className={inputClass}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Zip</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  className={inputClass}
                />
              </div>
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
              onClick={handleCreate}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create customer'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
