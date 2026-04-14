'use client'

import { useState, useEffect, useMemo } from 'react'
import { XIcon, ArrowRightIcon, AlertTriangleIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'

interface MergeCompaniesModalProps {
  companyIdA: string
  companyIdB: string
  onClose: () => void
  onMerged: (survivingId: string) => void
}

interface CompanyFull {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: string
  priority: string | null
  lead_source: string | null
  deal_value: number | null
  assigned_to: string | null
  notes: string | null
  import_metadata: Record<string, string> | null
}

// Fields the user can pick a value for.
type MergeableField =
  | 'name'
  | 'industry'
  | 'zone'
  | 'region'
  | 'state'
  | 'county'
  | 'city'
  | 'status'
  | 'priority'
  | 'lead_source'
  | 'deal_value'
  | 'assigned_to'
  | 'notes'

const FIELD_LABELS: Record<MergeableField, string> = {
  name: 'Company name',
  industry: 'Industry',
  zone: 'Zone',
  region: 'Region',
  state: 'State',
  county: 'County',
  city: 'City',
  status: 'Status',
  priority: 'Priority',
  lead_source: 'Lead source',
  deal_value: 'Deal value',
  assigned_to: 'Assigned to',
  notes: 'Notes',
}

const FIELDS: MergeableField[] = [
  'name',
  'industry',
  'zone',
  'region',
  'state',
  'county',
  'city',
  'status',
  'priority',
  'lead_source',
  'deal_value',
  'assigned_to',
  'notes',
]

export default function MergeCompaniesModal({
  companyIdA,
  companyIdB,
  onClose,
  onMerged,
}: MergeCompaniesModalProps) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [companyA, setCompanyA] = useState<CompanyFull | null>(null)
  const [companyB, setCompanyB] = useState<CompanyFull | null>(null)
  // Which side to keep for each field ('a' or 'b'). Also which company is surviving.
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
        .from('crm_companies')
        .select(
          'id, name, industry, zone, region, state, county, city, status, priority, lead_source, deal_value, assigned_to, notes, import_metadata'
        )
        .in('id', [companyIdA, companyIdB])
      if (cancelled) return
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const list = (data ?? []) as CompanyFull[]
      const a = list.find((c) => c.id === companyIdA) ?? null
      const b = list.find((c) => c.id === companyIdB) ?? null
      setCompanyA(a)
      setCompanyB(b)
      // Initialize picks: prefer non-empty values, defaulting to A.
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
  }, [supabase, companyIdA, companyIdB])

  async function handleMerge() {
    if (!companyA || !companyB) return
    setMerging(true)
    setError(null)

    const survivingId = survivor === 'a' ? companyA.id : companyB.id
    const losingId = survivor === 'a' ? companyB.id : companyA.id

    try {
      // Build update payload for the surviving company.
      const update: Record<string, unknown> = {}
      for (const f of FIELDS) {
        const src = picks[f] === 'a' ? companyA : companyB
        update[f] = valueFor(src, f)
      }
      // Merge import_metadata from both
      const mergedMeta = {
        ...(companyA.import_metadata ?? {}),
        ...(companyB.import_metadata ?? {}),
      }
      if (Object.keys(mergedMeta).length > 0) update.import_metadata = mergedMeta

      const { error: upErr } = await supabase
        .from('crm_companies')
        .update(update)
        .eq('id', survivingId)
      if (upErr) throw upErr

      // Move related rows from losing to surviving.
      const relocateTables: [string, string][] = [
        ['crm_contacts', 'company_id'],
        ['crm_company_addresses', 'company_id'],
        ['crm_company_tags', 'company_id'],
        ['crm_call_log', 'company_id'],
        ['crm_comments', 'company_id'],
        ['crm_files', 'company_id'],
        ['crm_appointments', 'company_id'],
        ['crm_follow_up_reminders', 'company_id'],
      ]
      for (const [table, col] of relocateTables) {
        const { error: moveErr } = await supabase
          .from(table)
          .update({ [col]: survivingId })
          .eq(col, losingId)
        if (moveErr) throw moveErr
      }

      // Delete the losing company.
      const { error: delErr } = await supabase
        .from('crm_companies')
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-5 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">Merge companies</h3>
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
            ) : !companyA || !companyB ? (
              <p className="text-sm text-red-600">Could not load companies.</p>
            ) : (
              <>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 mb-4 text-xs text-amber-900">
                  <AlertTriangleIcon className="w-4 h-4 flex-none mt-0.5" />
                  <p>
                    Contacts, call log, comments, files, addresses, appointments
                    and tags from the other company will be merged into the surviving
                    company. The other will be deleted — this cannot be undone.
                  </p>
                </div>

                {/* Survivor selector */}
                <div className="mb-5">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">
                    Keep as surviving company
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <SurvivorOption
                      active={survivor === 'a'}
                      name={companyA.name}
                      onClick={() => setSurvivor('a')}
                    />
                    <SurvivorOption
                      active={survivor === 'b'}
                      name={companyB.name}
                      onClick={() => setSurvivor('b')}
                    />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[140px_1fr_1fr] text-xs bg-gray-50 border-b border-gray-200">
                    <div className="px-3 py-2 font-medium text-gray-600">Field</div>
                    <div className="px-3 py-2 font-medium text-gray-600 truncate">
                      {companyA.name}
                    </div>
                    <div className="px-3 py-2 font-medium text-gray-600 truncate">
                      {companyB.name}
                    </div>
                  </div>
                  {FIELDS.map((f) => {
                    const va = valueFor(companyA, f)
                    const vb = valueFor(companyB, f)
                    return (
                      <div
                        key={f}
                        className="grid grid-cols-[140px_1fr_1fr] items-start border-b border-gray-100 last:border-b-0 text-sm"
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
              disabled={loading || merging || !companyA || !companyB}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {merging ? 'Merging…' : 'Merge companies'}
              {!merging && <ArrowRightIcon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function valueFor(c: CompanyFull | null, f: MergeableField): string | number | null {
  if (!c) return null
  const v = (c as unknown as Record<string, unknown>)[f]
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'string') return v
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
  value: string | number | null
  checked: boolean
  onSelect: () => void
}) {
  const empty = value == null || value === ''
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
        {empty ? '—' : String(value)}
      </span>
    </label>
  )
}
