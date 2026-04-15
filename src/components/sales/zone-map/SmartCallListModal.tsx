'use client'

import { useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import {
  type SmartListFilters,
  type SmartListRow,
  EMPTY_SMART_FILTERS,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from './zoneMapTypes'

interface SmartCallListModalProps {
  userId: string
  existing?: SmartListRow | null
  onClose: () => void
  onSaved: () => void
}

interface CompanyLite {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: string
  priority: 'high' | 'medium' | 'low' | null
}

interface ContactLite {
  id: string
  company_id: string
  first_name: string
  last_name: string
  is_primary: boolean
}

interface TagMini {
  id: string
  name: string
}

export default function SmartCallListModal({
  userId,
  existing,
  onClose,
  onSaved,
}: SmartCallListModalProps) {
  const supabase = useMemo(() => createClient(), [])

  const [name, setName] = useState(existing?.name ?? '')
  const [contactCount, setContactCount] = useState<number>(
    existing?.contact_count ?? 25
  )
  const [filters, setFilters] = useState<SmartListFilters>(
    existing?.filters ?? EMPTY_SMART_FILTERS
  )
  const [sortLeastRecent, setSortLeastRecent] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [contacts, setContacts] = useState<ContactLite[]>([])
  const [lastCallMap, setLastCallMap] = useState<Map<string, string>>(new Map())
  const [tags, setTags] = useState<TagMini[]>([])
  const [tagsByCompany, setTagsByCompany] = useState<Map<string, string[]>>(
    new Map()
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [
        { data: compData },
        { data: contactData },
        { data: callData },
        { data: tagDefs },
        { data: tagJunctions },
      ] = await Promise.all([
        supabase
          .from('crm_companies')
          .select(
            'id, name, industry, zone, region, state, county, city, status, priority'
          ),
        supabase
          .from('crm_contacts')
          .select('id, company_id, first_name, last_name, is_primary'),
        supabase
          .from('crm_call_log')
          .select('company_id, call_date')
          .order('call_date', { ascending: false }),
        supabase.from('crm_tags').select('id, name').order('name'),
        supabase.from('crm_company_tags').select('company_id, tag_id'),
      ])
      if (cancelled) return
      setCompanies((compData ?? []) as CompanyLite[])
      setContacts((contactData ?? []) as ContactLite[])
      const m = new Map<string, string>()
      for (const r of (callData ?? []) as { company_id: string; call_date: string }[]) {
        if (!m.has(r.company_id)) m.set(r.company_id, r.call_date)
      }
      setLastCallMap(m)
      setTags((tagDefs ?? []) as TagMini[])
      const tm = new Map<string, string[]>()
      for (const r of (tagJunctions ?? []) as { company_id: string; tag_id: string }[]) {
        const arr = tm.get(r.company_id) ?? []
        arr.push(r.tag_id)
        tm.set(r.company_id, arr)
      }
      setTagsByCompany(tm)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // Derive distinct filter option values from loaded companies
  const zoneOptions = useMemo(
    () => distinct(companies.map((c) => c.zone)),
    [companies]
  )
  const regionOptions = useMemo(
    () => distinct(companies.map((c) => c.region)),
    [companies]
  )
  const stateOptions = useMemo(
    () => distinct(companies.map((c) => c.state)),
    [companies]
  )
  const countyOptions = useMemo(
    () => distinct(companies.map((c) => c.county)),
    [companies]
  )
  const cityOptions = useMemo(
    () => distinct(companies.map((c) => c.city)),
    [companies]
  )
  const industryOptions = useMemo(
    () => distinct(companies.map((c) => c.industry)),
    [companies]
  )

  // Matching contacts preview
  const preview = useMemo(() => {
    return buildMatchingContacts({
      filters,
      contactCount,
      sortLeastRecent,
      companies,
      contacts,
      lastCallMap,
      tagsByCompany,
    })
  }, [
    filters,
    contactCount,
    sortLeastRecent,
    companies,
    contacts,
    lastCallMap,
    tagsByCompany,
  ])

  function setSingle(field: keyof SmartListFilters, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value ? [value] : [] }))
  }
  function toggleMulti(field: keyof SmartListFilters, value: string) {
    setFilters((prev) => {
      const set = new Set(prev[field])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [field]: [...set] }
    })
  }

  async function handleSave() {
    setError(null)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    const payload = {
      name: name.trim(),
      filters,
      contact_count: Math.max(1, contactCount),
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      const { error: err } = await supabase
        .from('crm_smart_lists')
        .update(payload)
        .eq('id', existing.id)
      if (err) {
        setSaving(false)
        setError(err.message)
        return
      }
    } else {
      const { error: err } = await supabase
        .from('crm_smart_lists')
        .insert(payload)
      if (err) {
        setSaving(false)
        setError(err.message)
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: 56 }}
          >
            <h3 className="text-base font-bold text-gray-900">
              {existing ? 'Edit smart list' : 'New smart list'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <Field label="Name *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Zone 1 hot leads"
                className={inputClasses}
              />
            </Field>

            <Field label="Number of contacts">
              <input
                type="number"
                min={1}
                max={500}
                value={contactCount}
                onChange={(e) =>
                  setContactCount(Math.max(1, Number(e.target.value) || 1))
                }
                className={inputClasses}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Zone"
                value={filters.zone[0] ?? ''}
                onChange={(v) => setSingle('zone', v)}
                options={zoneOptions}
              />
              <SelectField
                label="Region"
                value={filters.region[0] ?? ''}
                onChange={(v) => setSingle('region', v)}
                options={regionOptions}
              />
              <SelectField
                label="State"
                value={filters.state[0] ?? ''}
                onChange={(v) => setSingle('state', v)}
                options={stateOptions}
              />
              <SelectField
                label="County"
                value={filters.county[0] ?? ''}
                onChange={(v) => setSingle('county', v)}
                options={countyOptions}
              />
              <SelectField
                label="City"
                value={filters.city[0] ?? ''}
                onChange={(v) => setSingle('city', v)}
                options={cityOptions}
              />
              <SelectField
                label="Industry"
                value={filters.industry[0] ?? ''}
                onChange={(v) => setSingle('industry', v)}
                options={industryOptions}
              />
            </div>

            <Field label="Status">
              <div className="flex flex-wrap gap-2">
                {(['prospect', 'contacted', 'hot_lead'] as const).map((s) => {
                  const checked = filters.status.includes(s)
                  return (
                    <label
                      key={s}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-full cursor-pointer ${
                        checked
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => toggleMulti('status', s)}
                      />
                      {STATUS_LABELS[s]}
                    </label>
                  )
                })}
              </div>
            </Field>

            <SelectField
              label="Priority"
              value={filters.priority[0] ?? ''}
              onChange={(v) => setSingle('priority', v)}
              options={(['high', 'medium', 'low'] as const).map((p) => ({
                value: p,
                label: PRIORITY_LABELS[p],
              }))}
            />

            {tags.length > 0 && (
              <Field label="Tags">
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const checked = filters.tags.includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-full cursor-pointer ${
                          checked
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => toggleMulti('tags', t.id)}
                        />
                        {t.name}
                      </label>
                    )
                  })}
                </div>
              </Field>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700 pt-2">
              <input
                type="checkbox"
                checked={sortLeastRecent}
                onChange={(e) => setSortLeastRecent(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
              />
              Least recently called first
            </label>

            <div className="border border-gray-100 rounded-lg px-3 py-2 mt-2 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">
                Preview · {preview.matchCount}{' '}
                matching contact{preview.matchCount === 1 ? '' : 's'} (first{' '}
                {Math.min(5, preview.preview.length)} shown)
              </div>
              {preview.preview.length === 0 ? (
                <div className="text-xs text-gray-400 italic">
                  No matching contacts.
                </div>
              ) : (
                <ul className="text-xs text-gray-700 space-y-0.5">
                  {preview.preview.slice(0, 5).map((p, i) => (
                    <li key={i}>
                      {p.name}{' '}
                      <span className="text-gray-400">· {p.company}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>

          <div className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

const inputClasses =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function distinct(
  values: (string | null | undefined)[]
): { value: string; label: string }[] {
  const s = new Set<string>()
  for (const v of values) if (v) s.add(v)
  return [...s].sort().map((v) => ({ value: v, label: v }))
}

// Shared helper used by both preview and "Start dialer"
export interface BuildContactsInput {
  filters: SmartListFilters
  contactCount: number
  sortLeastRecent: boolean
  companies: CompanyLite[]
  contacts: ContactLite[]
  lastCallMap: Map<string, string>
  tagsByCompany: Map<string, string[]>
}

export interface MatchedPreview {
  matchCount: number
  preview: { name: string; company: string; contactId: string }[]
}

export function buildMatchingContacts(
  input: BuildContactsInput
): MatchedPreview {
  const {
    filters,
    contactCount,
    sortLeastRecent,
    companies,
    contacts,
    lastCallMap,
    tagsByCompany,
  } = input

  const statusFilter =
    filters.status.length > 0 ? new Set(filters.status) : null

  const eligible = companies.filter((c) => {
    if (c.status === 'blacklisted') return false
    if (statusFilter && !statusFilter.has(c.status)) return false
    if (filters.zone.length > 0 && (!c.zone || !filters.zone.includes(c.zone)))
      return false
    if (
      filters.region.length > 0 &&
      (!c.region || !filters.region.includes(c.region))
    )
      return false
    if (
      filters.state.length > 0 &&
      (!c.state || !filters.state.includes(c.state))
    )
      return false
    if (
      filters.county.length > 0 &&
      (!c.county || !filters.county.includes(c.county))
    )
      return false
    if (filters.city.length > 0 && (!c.city || !filters.city.includes(c.city)))
      return false
    if (
      filters.industry.length > 0 &&
      (!c.industry || !filters.industry.includes(c.industry))
    )
      return false
    if (
      filters.priority.length > 0 &&
      (!c.priority || !filters.priority.includes(c.priority))
    )
      return false
    if (filters.tags.length > 0) {
      const t = tagsByCompany.get(c.id) ?? []
      if (!t.some((x) => filters.tags.includes(x))) return false
    }
    return true
  })
  const eligibleIds = new Set(eligible.map((c) => c.id))
  const companyMap = new Map(eligible.map((c) => [c.id, c]))

  // Pick one contact per company — prefer is_primary.
  const picked = new Map<string, ContactLite>()
  for (const c of contacts) {
    if (!eligibleIds.has(c.company_id)) continue
    const existing = picked.get(c.company_id)
    if (!existing) picked.set(c.company_id, c)
    else if (!existing.is_primary && c.is_primary) picked.set(c.company_id, c)
  }

  const rows = [...picked.values()].map((c) => ({
    contact: c,
    company: companyMap.get(c.company_id)!,
    lastCall: lastCallMap.get(c.company_id) ?? null,
  }))

  if (sortLeastRecent) {
    rows.sort((a, b) => {
      if (!a.lastCall && !b.lastCall) return 0
      if (!a.lastCall) return -1
      if (!b.lastCall) return 1
      return new Date(a.lastCall).getTime() - new Date(b.lastCall).getTime()
    })
  }

  const sliced = rows.slice(0, Math.max(1, contactCount))
  return {
    matchCount: rows.length,
    preview: sliced.map((r) => ({
      name: `${r.contact.first_name} ${r.contact.last_name}`.trim(),
      company: r.company.name,
      contactId: r.contact.id,
    })),
  }
}
