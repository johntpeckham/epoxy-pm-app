'use client'

import { useState, useEffect } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'

export interface ContactForModal {
  id?: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

interface NewContactModalProps {
  companyId: string
  existing?: ContactForModal
  onClose: () => void
  onSaved: () => void
}

export default function NewContactModal({
  companyId,
  existing,
  onClose,
  onSaved,
}: NewContactModalProps) {
  const [fullName, setFullName] = useState(`${existing?.first_name ?? ''} ${existing?.last_name ?? ''}`.trim())
  const [jobTitle, setJobTitle] = useState(existing?.job_title ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{ type: string; number: string }>>([])
  const [phonesLoaded, setPhonesLoaded] = useState(false)
  const [isPrimary, setIsPrimary] = useState(existing?.is_primary ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing phone numbers from contact_phone_numbers table
  useEffect(() => {
    if (existing?.id) {
      const supabase = createClient()
      supabase.from('contact_phone_numbers').select('phone_number, phone_type, is_primary').eq('contact_id', existing.id).order('is_primary', { ascending: false }).then(({ data }) => {
        const rows = (data ?? []) as Array<{ phone_number: string; phone_type: string; is_primary: boolean }>
        if (rows.length > 0) {
          setPhoneNumbers(rows.map((r) => ({ type: r.phone_type, number: r.phone_number })))
        } else if (existing?.phone) {
          setPhoneNumbers([{ type: 'office', number: existing.phone }])
        } else {
          setPhoneNumbers([{ type: 'office', number: '' }])
        }
        setPhonesLoaded(true)
      })
    } else {
      setPhoneNumbers([{ type: 'office', number: '' }])
      setPhonesLoaded(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEdit = !!existing?.id

  async function handleSave() {
    const trimmed = fullName.trim()
    if (!trimmed) {
      setError('Full name is required.')
      return
    }
    const tokens = trimmed.split(/\s+/)
    const parsedFirst = tokens[0] ?? ''
    const parsedLast = tokens.slice(1).join(' ')
    setSaving(true)
    setError(null)
    const supabase = createClient()

    // If marking this contact as primary, clear primary on the others first
    if (isPrimary) {
      await supabase
        .from('contacts')
        .update({ is_primary: false })
        .eq('company_id', companyId)
    }

    const validPhones = phoneNumbers.filter((p) => p.number.trim())
    const primaryPhone = validPhones[0]?.number || null

    const payload = {
      first_name: parsedFirst,
      last_name: parsedLast,
      job_title: jobTitle.trim() || null,
      email: email.trim() || null,
      phone: primaryPhone,
      is_primary: isPrimary,
    }

    let contactId = existing?.id
    if (isEdit && existing?.id) {
      const { error: err } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', existing.id)
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      const { data: inserted, error: err } = await supabase
        .from('contacts')
        .insert({ ...payload, company_id: companyId })
        .select('id')
        .single()
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      contactId = inserted?.id
    }

    if (contactId) {
      await supabase.from('contact_phone_numbers').delete().eq('contact_id', contactId)
      if (validPhones.length > 0) {
        await supabase.from('contact_phone_numbers').insert(
          validPhones.map((p, i) => ({
            contact_id: contactId,
            company_id: companyId,
            phone_number: p.number.trim(),
            phone_type: p.type,
            is_primary: i === 0,
          }))
        )
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
              {isEdit ? 'Edit Contact' : 'New Contact'}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone numbers</label>
              <div className="space-y-2">
                {phoneNumbers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={p.type}
                      onChange={(e) => setPhoneNumbers((prev) => prev.map((ph, j) => j === i ? { ...ph, type: e.target.value } : ph))}
                      className="px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 w-24 shrink-0"
                    >
                      <option value="office">Office</option>
                      <option value="mobile">Mobile</option>
                      <option value="fax">Fax</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      type="tel"
                      value={p.number}
                      onChange={(e) => setPhoneNumbers((prev) => prev.map((ph, j) => j === i ? { ...ph, number: e.target.value } : ph))}
                      placeholder="Phone number"
                      className={`${inputClass} flex-1`}
                    />
                    {phoneNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPhoneNumbers((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPhoneNumbers((prev) => [...prev, { type: 'office', number: '' }])}
                className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 mt-1.5"
              >
                <PlusIcon className="w-3 h-3" />
                Add number
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
              />
              Primary contact
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
              disabled={!fullName.trim() || saving}
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
