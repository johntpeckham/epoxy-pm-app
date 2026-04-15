'use client'

import { useState, useEffect, useMemo } from 'react'
import { XIcon, ArrowRightIcon, AlertTriangleIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'

interface MergeContactsModalProps {
  contactIdA: string
  contactIdB: string
  onClose: () => void
  onMerged: (survivingId: string) => void
}

interface ContactFull {
  id: string
  company_id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

type MergeableField =
  | 'first_name'
  | 'last_name'
  | 'job_title'
  | 'email'
  | 'phone'
  | 'is_primary'

const FIELD_LABELS: Record<MergeableField, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  job_title: 'Job title',
  email: 'Email',
  phone: 'Phone',
  is_primary: 'Primary',
}

const FIELDS: MergeableField[] = [
  'first_name',
  'last_name',
  'job_title',
  'email',
  'phone',
  'is_primary',
]

export default function MergeContactsModal({
  contactIdA,
  contactIdB,
  onClose,
  onMerged,
}: MergeContactsModalProps) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [contactA, setContactA] = useState<ContactFull | null>(null)
  const [contactB, setContactB] = useState<ContactFull | null>(null)
  const [survivor, setSurvivor] = useState<'a' | 'b'>('a')
  const [picks, setPicks] = useState<Record<MergeableField, 'a' | 'b'>>(() => {
    const init: Partial<Record<MergeableField, 'a' | 'b'>> = {}
    for (const f of FIELDS) init[f] = 'a'
    return init as Record<MergeableField, 'a' | 'b'>
  })
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('crm_contacts')
        .select('id, company_id, first_name, last_name, job_title, email, phone, is_primary')
        .in('id', [contactIdA, contactIdB])
      if (cancelled) return
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const list = (data ?? []) as ContactFull[]
      const a = list.find((c) => c.id === contactIdA) ?? null
      const b = list.find((c) => c.id === contactIdB) ?? null
      setContactA(a)
      setContactB(b)
      // Initial picks: prefer non-empty
      const initial: Record<MergeableField, 'a' | 'b'> = {} as Record<MergeableField, 'a' | 'b'>
      for (const f of FIELDS) {
        const va = valueFor(a, f)
        const vb = valueFor(b, f)
        if ((va == null || va === '') && vb != null && vb !== '') initial[f] = 'b'
        else initial[f] = 'a'
      }
      setPicks(initial)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, contactIdA, contactIdB])

  async function handleMerge() {
    if (!contactA || !contactB) return
    setMerging(true)
    setError(null)
    const survivingId = survivor === 'a' ? contactA.id : contactB.id
    const losingId = survivor === 'a' ? contactB.id : contactA.id
    try {
      const update: Record<string, unknown> = {}
      for (const f of FIELDS) {
        const src = picks[f] === 'a' ? contactA : contactB
        update[f] = valueFor(src, f)
      }
      const { error: upErr } = await supabase
        .from('crm_contacts')
        .update(update)
        .eq('id', survivingId)
      if (upErr) throw upErr

      // Relocate call log entries from losing to surviving.
      const { error: moveErr } = await supabase
        .from('crm_call_log')
        .update({ contact_id: survivingId })
        .eq('contact_id', losingId)
      if (moveErr) throw moveErr

      // Relocate appointments
      const { error: apptErr } = await supabase
        .from('crm_appointments')
        .update({ contact_id: survivingId })
        .eq('contact_id', losingId)
      if (apptErr) throw apptErr

      // Relocate reminders
      const { error: remErr } = await supabase
        .from('crm_follow_up_reminders')
        .update({ contact_id: survivingId })
        .eq('contact_id', losingId)
      if (remErr) throw remErr

      // Delete losing contact
      const { error: delErr } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', losingId)
      if (delErr) throw delErr

      onMerged(survivingId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Merge failed'
      setError(msg)
      setMerging(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-5 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">Merge contacts</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <p className="text-sm text-gray-400 italic">Loading…</p>
            ) : !contactA || !contactB ? (
              <p className="text-sm text-red-600">Could not load contacts.</p>
            ) : (
              <>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-white border border-gray-200 mb-4 text-xs text-gray-700">
                  <AlertTriangleIcon className="w-4 h-4 flex-none mt-0.5" />
                  <p>
                    Call log entries, appointments, and reminders from the other
                    contact will be moved to the surviving contact. The other will be
                    deleted.
                  </p>
                </div>

                <div className="mb-5">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">
                    Keep as surviving contact
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <SurvivorOption
                      active={survivor === 'a'}
                      name={`${contactA.first_name} ${contactA.last_name}`}
                      onClick={() => setSurvivor('a')}
                    />
                    <SurvivorOption
                      active={survivor === 'b'}
                      name={`${contactB.first_name} ${contactB.last_name}`}
                      onClick={() => setSurvivor('b')}
                    />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[120px_1fr_1fr] text-xs bg-gray-50 border-b border-gray-200">
                    <div className="px-3 py-2 font-medium text-gray-600">Field</div>
                    <div className="px-3 py-2 font-medium text-gray-600 truncate">
                      {contactA.first_name} {contactA.last_name}
                    </div>
                    <div className="px-3 py-2 font-medium text-gray-600 truncate">
                      {contactB.first_name} {contactB.last_name}
                    </div>
                  </div>
                  {FIELDS.map((f) => {
                    const va = valueFor(contactA, f)
                    const vb = valueFor(contactB, f)
                    return (
                      <div
                        key={f}
                        className="grid grid-cols-[120px_1fr_1fr] items-start border-b border-gray-100 last:border-b-0 text-sm"
                      >
                        <div className="px-3 py-2 text-gray-600 text-xs">
                          {FIELD_LABELS[f]}
                        </div>
                        <PickCell
                          value={va}
                          checked={picks[f] === 'a'}
                          onSelect={() => setPicks((p) => ({ ...p, [f]: 'a' }))}
                        />
                        <PickCell
                          value={vb}
                          checked={picks[f] === 'b'}
                          onSelect={() => setPicks((p) => ({ ...p, [f]: 'b' }))}
                        />
                      </div>
                    )
                  })}
                </div>

                {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
              </>
            )}
          </div>

          <div
            className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              disabled={merging}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={loading || merging || !contactA || !contactB}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {merging ? 'Merging…' : 'Merge contacts'}
              {!merging && <ArrowRightIcon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function valueFor(
  c: ContactFull | null,
  f: MergeableField
): string | boolean | null {
  if (!c) return null
  const v = (c as unknown as Record<string, unknown>)[f]
  if (v == null) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v
  return String(v)
}

function SurvivorOption({
  active,
  name,
  onClick,
}: {
  active: boolean
  name: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm text-left rounded-lg border transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="truncate block">{name}</span>
    </button>
  )
}

function PickCell({
  value,
  checked,
  onSelect,
}: {
  value: string | boolean | null
  checked: boolean
  onSelect: () => void
}) {
  const empty = value == null || value === ''
  const display =
    typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value as string | null) ?? ''
  return (
    <label
      onClick={onSelect}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${
        checked ? 'bg-emerald-50/50' : 'hover:bg-gray-50'
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 w-3.5 h-3.5 text-emerald-500 focus:ring-emerald-500/20"
      />
      <span className={`${empty ? 'text-gray-300 italic' : 'text-gray-700'} text-sm`}>
        {empty ? '—' : display}
      </span>
    </label>
  )
}
