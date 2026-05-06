'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ClockIcon,
  UserPlusIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  PencilIcon,
  Trash2Icon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CallTemplateModal, {
  type CallTemplateRow,
  TEMPLATE_TYPE_LABELS,
} from '../CallTemplateModal'
import MultiSelectDropdown from '../MultiSelectDropdown'
import LocationFilter, {
  applyLocationFilter,
  EMPTY_LOCATION_VALUE,
  type LocationFilterValue,
} from '@/components/ui/LocationFilter'
import { useAssignableUsers } from '@/lib/useAssignableUsers'
import type {
  ContactPhone,
  ContactPhoneType,
  QueuedCompany,
  QueuedContact,
} from './dialerTypes'
import {
  isWithinCooldown,
  normalizePhoneType,
  pickInitialActiveContactId,
} from './dialerTypes'

interface SmartListFilters {
  zone: string[]
  region: string[]
  state: string[]
  county: string[]
  city: string[]
  industry: string[]
  status: string[]
  priority: string[]
  tags: string[]
}

const EMPTY_SMART_FILTERS: SmartListFilters = {
  zone: [],
  region: [],
  state: [],
  county: [],
  city: [],
  industry: [],
  status: [],
  priority: [],
  tags: [],
}

type PriorityFilter = 'all' | 'high' | 'high_medium'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'lead_created', label: 'Lead Created' },
  { value: 'appointment_made', label: 'Appointment Made' },
  { value: 'not_very_interested', label: 'Not Very Interested' },
]

const UNASSIGNED_SENTINEL = '__unassigned__'

interface DialerSetupProps {
  userId: string
  onStart: (queue: QueuedCompany[]) => void
}

interface CompanyRow {
  id: string
  name: string
  industry: string | null
  zone: string | null
  city: string | null
  state: string | null
  status: string
  priority: 'high' | 'medium' | 'low' | null
  assigned_to: string | null
}

interface ContactRow {
  id: string
  company_id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

interface PhoneRow {
  id: string
  contact_id: string
  phone_number: string
  phone_type: string
  is_primary: boolean
}

// Build the phones array for a contact. Prefer contact_phone_numbers rows;
// fall back to a synthesized "office" entry from the legacy contacts.phone
// scalar if no rows exist. Returns an empty array when the contact is
// unreachable (no rows AND no legacy phone).
function buildContactPhones(
  contact: ContactRow,
  phonesById: Map<string, PhoneRow[]>
): ContactPhone[] {
  const rows = phonesById.get(contact.id) ?? []
  const real: ContactPhone[] = []
  for (const r of rows) {
    const number = (r.phone_number ?? '').trim()
    if (!number) continue
    real.push({
      id: r.id,
      phone_number: number,
      phone_type: normalizePhoneType(r.phone_type),
      is_primary: !!r.is_primary,
    })
  }
  if (real.length > 0) return real
  const legacy = (contact.phone ?? '').trim()
  if (!legacy) return []
  return [
    {
      id: 'legacy',
      phone_number: legacy,
      phone_type: 'office' as ContactPhoneType,
      is_primary: true,
    },
  ]
}

export default function DialerSetup({ userId, onStart }: DialerSetupProps) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  // Map of contact_id → all contact_phone_numbers rows for that contact
  const [phonesByContact, setPhonesByContact] = useState<Map<string, PhoneRow[]>>(
    new Map()
  )
  // Map of company_id → most recent call_date (ISO)
  const [lastCallMap, setLastCallMap] = useState<Map<string, string>>(new Map())

  // Auto-select filter state
  const [howMany, setHowMany] = useState<number>(25)
  const [locationValue, setLocationValue] =
    useState<LocationFilterValue>(EMPTY_LOCATION_VALUE)
  const [locationRadiusCities, setLocationRadiusCities] =
    useState<Set<string> | null>(null)
  const [industry, setIndustry] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string[]>([
    'prospect',
    'contacted',
  ])
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [assignedToIds, setAssignedToIds] = useState<string[]>([])
  const { users: assignableUsers } = useAssignableUsers()

  // Manual pick state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [manualQueue, setManualQueue] = useState<string[]>([]) // array of contact ids

  // Templates state
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templates, setTemplates] = useState<CallTemplateRow[]>([])
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<CallTemplateRow | null>(
    null
  )
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: compData },
      { data: contactData },
      { data: phoneData },
      { data: callData },
      { data: templateData },
    ] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, industry, zone, city, state, status, priority, assigned_to')
        .eq('archived', false)
        .order('name', { ascending: true }),
      supabase
        .from('contacts')
        .select('id, company_id, first_name, last_name, job_title, email, phone, is_primary')
        .order('last_name', { ascending: true }),
      supabase
        .from('contact_phone_numbers')
        .select('id, contact_id, phone_number, phone_type, is_primary')
        .order('is_primary', { ascending: false }),
      supabase
        .from('crm_call_log')
        .select('company_id, call_date')
        .order('call_date', { ascending: false }),
      supabase
        .from('crm_call_templates')
        .select('id, name, type, content')
        .order('created_at', { ascending: false }),
    ])
    setCompanies((compData ?? []) as CompanyRow[])
    setContacts((contactData ?? []) as ContactRow[])
    const phoneRows = (phoneData ?? []) as PhoneRow[]
    const phoneMap = new Map<string, PhoneRow[]>()
    for (const p of phoneRows) {
      const list = phoneMap.get(p.contact_id) ?? []
      list.push(p)
      phoneMap.set(p.contact_id, list)
    }
    setPhonesByContact(phoneMap)
    const calls = (callData ?? []) as { company_id: string; call_date: string }[]
    const m = new Map<string, string>()
    for (const c of calls) {
      // Since sorted desc by call_date, the first entry per company is the most recent
      if (!m.has(c.company_id)) m.set(c.company_id, c.call_date)
    }
    setLastCallMap(m)
    setTemplates((templateData ?? []) as CallTemplateRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ─── Auto-start from smart list (?list=<id>) ────────────────────────
  const searchParams = useSearchParams()
  const incomingListId = searchParams.get('list')
  const autoStartedRef = useRef(false)

  useEffect(() => {
    if (!incomingListId) return
    if (loading) return // wait for companies/contacts to load
    if (autoStartedRef.current) return
    autoStartedRef.current = true
    ;(async () => {
      const [{ data }, { data: tagJunctions }] = await Promise.all([
        supabase
          .from('crm_smart_lists')
          .select('filters, contact_count')
          .eq('id', incomingListId)
          .single(),
        supabase.from('crm_company_tags').select('company_id, tag_id'),
      ])
      if (!data) return
      const filters: SmartListFilters = {
        ...EMPTY_SMART_FILTERS,
        ...((data.filters ?? {}) as Partial<SmartListFilters>),
      }
      const contactCount = (data.contact_count as number | null) ?? 25
      const tagsByCompany = new Map<string, string[]>()
      for (const r of (tagJunctions ?? []) as {
        company_id: string
        tag_id: string
      }[]) {
        const arr = tagsByCompany.get(r.company_id) ?? []
        arr.push(r.tag_id)
        tagsByCompany.set(r.company_id, arr)
      }
      const queue = buildSmartListQueue({
        filters,
        contactCount,
        companies,
        contacts,
        phonesByContact,
        lastCallMap,
        tagsByCompany,
      })
      if (queue.length > 0) onStart(queue)
    })()
    // We only want this to fire once data is ready and `list` is present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingListId, loading])

  // Distinct filter options from loaded companies
  const zones = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (c.zone) s.add(c.zone)
    return [...s].sort()
  }, [companies])

  const cities = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (c.city) s.add(c.city)
    return [...s].sort()
  }, [companies])

  const states = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (c.state) s.add(c.state)
    return [...s].sort()
  }, [companies])

  const cityStatePairs = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of companies) {
      if (c.city && !m.has(c.city)) m.set(c.city, c.state ?? null)
    }
    return [...m.entries()].map(([city, state]) => ({ city, state }))
  }, [companies])

  const industries = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (c.industry) s.add(c.industry)
    return [...s].sort()
  }, [companies])

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyRow>()
    for (const c of companies) m.set(c.id, c)
    return m
  }, [companies])

  // Build auto queue based on filters. One entry per company; every reachable
  // contact at that company is carried on the entry's `contacts` array.
  const autoQueue = useMemo<QueuedCompany[]>(() => {
    const statusSet = statusFilter.length > 0 ? new Set(statusFilter) : null
    const assignedSet =
      assignedToIds.length > 0 ? new Set(assignedToIds) : null

    // Eligible companies
    const eligibleCompanies = companies.filter((c) => {
      if (c.status === 'do_not_call') return false
      if (statusSet && !statusSet.has(c.status)) return false
      if (!applyLocationFilter(c, locationValue, locationRadiusCities)) return false
      if (industry && c.industry !== industry) return false
      if (priorityFilter === 'high' && c.priority !== 'high') return false
      if (
        priorityFilter === 'high_medium' &&
        c.priority !== 'high' &&
        c.priority !== 'medium'
      )
        return false
      if (assignedSet) {
        const isUnassigned = c.assigned_to == null
        const matchesUnassigned =
          isUnassigned && assignedSet.has(UNASSIGNED_SENTINEL)
        const matchesUser =
          c.assigned_to != null && assignedSet.has(c.assigned_to)
        if (!matchesUnassigned && !matchesUser) return false
      }
      return true
    })
    const eligibleIds = new Set(eligibleCompanies.map((c) => c.id))

    // Group contacts by company and build reachable QueuedContact records
    const contactsByCompany = new Map<string, QueuedContact[]>()
    for (const c of contacts) {
      if (!eligibleIds.has(c.company_id)) continue
      const phones = buildContactPhones(c, phonesByContact)
      if (phones.length === 0) continue // unreachable: no phones, no legacy
      const qc: QueuedContact = {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        job_title: c.job_title,
        email: c.email,
        is_primary: !!c.is_primary,
        phones,
      }
      const list = contactsByCompany.get(c.company_id) ?? []
      list.push(qc)
      contactsByCompany.set(c.company_id, list)
    }

    const now = Date.now()
    const out: QueuedCompany[] = []
    for (const comp of eligibleCompanies) {
      const list = contactsByCompany.get(comp.id)
      if (!list || list.length === 0) continue // no reachable contacts
      const lastCall = lastCallMap.get(comp.id) ?? null
      // 30-day company cooldown
      if (isWithinCooldown(lastCall, now)) continue
      out.push({
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
        company_zone: comp.zone,
        company_city: comp.city,
        company_state: comp.state,
        company_status: comp.status,
        company_priority: comp.priority,
        contacts: list,
        activeContactId: pickInitialActiveContactId(list),
        lastCallDate: lastCall,
      })
    }
    // Sort: no last_call first, then oldest last_call
    out.sort((a, b) => {
      if (!a.lastCallDate && !b.lastCallDate) return 0
      if (!a.lastCallDate) return -1
      if (!b.lastCallDate) return 1
      return (
        new Date(a.lastCallDate).getTime() -
        new Date(b.lastCallDate).getTime()
      )
    })
    return out.slice(0, Math.max(1, howMany))
  }, [
    companies,
    contacts,
    phonesByContact,
    lastCallMap,
    locationValue,
    locationRadiusCities,
    industry,
    statusFilter,
    priorityFilter,
    assignedToIds,
    howMany,
  ])

  // Manual queue — each picked contact becomes its own QueuedCompany with a
  // single-contact `contacts` array. Duplicate companies produce separate
  // queue entries on purpose so the rep's explicit ordering is preserved.
  const manualQueueResolved = useMemo<QueuedCompany[]>(() => {
    const out: QueuedCompany[] = []
    for (const cid of manualQueue) {
      const c = contacts.find((x) => x.id === cid)
      if (!c) continue
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      const phones = buildContactPhones(c, phonesByContact)
      const qc: QueuedContact = {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        job_title: c.job_title,
        email: c.email,
        is_primary: !!c.is_primary,
        phones,
      }
      out.push({
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
        company_zone: comp.zone,
        company_city: comp.city,
        company_state: comp.state,
        company_status: comp.status,
        company_priority: comp.priority,
        contacts: [qc],
        activeContactId: qc.id,
        lastCallDate: lastCallMap.get(c.company_id) ?? null,
      })
    }
    return out
  }, [manualQueue, contacts, companyMap, lastCallMap, phonesByContact])

  // ─── Multi-select option/label helpers ────────────────────────────────
  const assignedToOptions = useMemo(() => {
    const userOpts = assignableUsers
      .map((u) => ({
        value: u.id,
        label: u.display_name || u.id.slice(0, 8),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [{ value: UNASSIGNED_SENTINEL, label: 'Unassigned' }, ...userOpts]
  }, [assignableUsers])

  const statusTriggerLabel = useMemo(() => {
    if (statusFilter.length === 0) return 'All'
    if (statusFilter.length === 1) {
      const opt = STATUS_OPTIONS.find((o) => o.value === statusFilter[0])
      return opt?.label ?? '1 status'
    }
    return `${statusFilter.length} statuses`
  }, [statusFilter])

  const assignedToTriggerLabel = useMemo(() => {
    if (assignedToIds.length === 0) return 'All'
    if (assignedToIds.length === 1) {
      const only = assignedToIds[0]
      if (only === UNASSIGNED_SENTINEL) return 'Unassigned'
      const opt = assignedToOptions.find((o) => o.value === only)
      return opt?.label ?? only.slice(0, 8)
    }
    return `${assignedToIds.length} assigned`
  }, [assignedToIds, assignedToOptions])

  // Manual pick search results
  const searchResults = useMemo(() => {
    if (!debouncedSearch) return []
    const queued = new Set(manualQueue)
    const matches: { contact: ContactRow; company: CompanyRow }[] = []
    for (const c of contacts) {
      if (queued.has(c.id)) continue
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      if (comp.status === 'do_not_call') continue
      const hay = `${c.first_name} ${c.last_name} ${comp.name}`.toLowerCase()
      if (hay.includes(debouncedSearch)) {
        matches.push({ contact: c, company: comp })
      }
      if (matches.length >= 12) break
    }
    return matches
  }, [debouncedSearch, contacts, companyMap, manualQueue])

  // ─── Templates ─────────────────────────────────────────────────────────
  async function handleDeleteTemplate(id: string) {
    const { error } = await supabase
      .from('crm_call_templates')
      .delete()
      .eq('id', id)
    if (error) return
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    setDeleteTemplateId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-[760px] mx-auto px-6 pt-14 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[26px] font-medium text-gray-900 leading-tight">
            Start a call session
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Build your queue, settle in, and start dialing.
          </p>
        </div>

        {/* Two cards */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-stretch">
          {/* Auto-select */}
          <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 md:p-7 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="w-4 h-4 text-teal-600" />
              <h2 className="text-[15px] font-medium text-gray-900">
                Auto-select
              </h2>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Set parameters and we&rsquo;ll build a prioritized queue. Contacts
              who haven&rsquo;t been reached recently come first.
            </p>
            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  How many calls?
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={howMany}
                  onChange={(e) => setHowMany(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Location</label>
                <LocationFilter
                  variant="input"
                  value={locationValue}
                  onChange={setLocationValue}
                  availableZones={zones}
                  availableCities={cities}
                  availableStates={states}
                  cityStatePairs={cityStatePairs}
                  onRadiusCitiesChange={setLocationRadiusCities}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="">All industries</option>
                  {industries.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Status</label>
                <MultiSelectDropdown
                  ariaLabel="Status"
                  options={STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  triggerLabel={statusTriggerLabel}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  Priority
                </label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="all">All priorities</option>
                  <option value="high">High only</option>
                  <option value="high_medium">High + Medium</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  Assigned to
                </label>
                <MultiSelectDropdown
                  ariaLabel="Assigned to"
                  options={assignedToOptions}
                  selected={assignedToIds}
                  onChange={setAssignedToIds}
                  triggerLabel={assignedToTriggerLabel}
                />
              </div>
            </div>
            <button
              onClick={() => onStart(autoQueue)}
              disabled={loading || autoQueue.length === 0}
              className="mt-5 w-full py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 transition-colors"
            >
              Start session — {autoQueue.length} call
              {autoQueue.length === 1 ? '' : 's'}
            </button>
          </div>

          {/* or divider */}
          <div className="hidden md:flex flex-col items-center justify-center">
            <div className="h-full w-px bg-gray-100" />
            <div className="absolute my-auto bg-gray-50 dark:bg-[#1a1a1a] px-2 text-xs text-gray-400">
              or
            </div>
          </div>
          <div className="md:hidden flex items-center justify-center py-1">
            <span className="text-xs text-gray-400">or</span>
          </div>

          {/* Manual pick */}
          <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 md:p-7 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <UserPlusIcon className="w-4 h-4 text-teal-600" />
              <h2 className="text-[15px] font-medium text-gray-900">
                Manual pick
              </h2>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Hand-pick contacts and build your own queue.
            </p>
            <div className="relative">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
                  {searchResults.map((r) => (
                    <button
                      key={r.contact.id}
                      onClick={() => {
                        setManualQueue((prev) => [...prev, r.contact.id])
                        setSearch('')
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 truncate">
                          {r.contact.first_name} {r.contact.last_name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {r.company.name}
                        </div>
                      </div>
                      <PlusIcon className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex-1 min-h-[120px]">
              {manualQueueResolved.length === 0 ? (
                <p className="text-xs text-gray-400 italic mt-4">
                  No contacts yet — search and add them above.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {manualQueueResolved.map((q, idx) => {
                    const contact = q.contacts[0]
                    return (
                    <div
                      key={contact.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex flex-col">
                        <button
                          disabled={idx === 0}
                          onClick={() =>
                            setManualQueue((prev) => {
                              if (idx === 0) return prev
                              const next = [...prev]
                              ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                              return next
                            })
                          }
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                          title="Move up"
                        >
                          <ArrowUpIcon className="w-3 h-3" />
                        </button>
                        <button
                          disabled={idx === manualQueueResolved.length - 1}
                          onClick={() =>
                            setManualQueue((prev) => {
                              if (idx === prev.length - 1) return prev
                              const next = [...prev]
                              ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                              return next
                            })
                          }
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
                          title="Move down"
                        >
                          <ArrowDownIcon className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-900 truncate">
                          {contact.first_name} {contact.last_name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {q.company_name}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setManualQueue((prev) =>
                            prev.filter((id) => id !== contact.id)
                          )
                        }
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        remove
                      </button>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => onStart(manualQueueResolved)}
              disabled={manualQueueResolved.length === 0}
              className="mt-5 w-full py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 transition-colors"
            >
              Start session — {manualQueueResolved.length} call
              {manualQueueResolved.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>

        {/* Templates section */}
        <div className="mt-10 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden">
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            {templatesOpen ? (
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            )}
            <FileTextIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-900 flex-1 text-left">
              Templates
            </span>
            <span className="text-xs text-gray-400">{templates.length}</span>
          </button>
          {templatesOpen && (
            <div className="border-t border-gray-200 px-5 py-4 space-y-2">
              {templates.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  No templates yet.
                </p>
              ) : (
                templates.map((t) => {
                  const isExpanded = expandedTemplate === t.id
                  return (
                    <div
                      key={t.id}
                      className="border border-gray-100 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-3 py-2">
                        <button
                          onClick={() =>
                            setExpandedTemplate(isExpanded ? null : t.id)
                          }
                          className="min-w-0 flex-1 flex items-center gap-2 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {t.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">
                            {TEMPLATE_TYPE_LABELS[t.type]}
                          </span>
                        </button>
                        <button
                          onClick={() => setEditingTemplate(t)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                          title="Edit"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTemplateId(t.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          title="Delete"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border-t border-gray-100 pt-3">
                          {t.content}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <button
                onClick={() => setShowNewTemplate(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mt-2"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                New template
              </button>
            </div>
          )}
        </div>
      </div>

      {(showNewTemplate || editingTemplate) && (
        <CallTemplateModal
          userId={userId}
          existing={editingTemplate ?? undefined}
          onClose={() => {
            setShowNewTemplate(false)
            setEditingTemplate(null)
          }}
          onSaved={() => {
            setShowNewTemplate(false)
            setEditingTemplate(null)
            fetchAll()
          }}
        />
      )}

      {deleteTemplateId && (
        <ConfirmDialog
          title="Delete template?"
          message="This will permanently delete this template."
          onConfirm={() => handleDeleteTemplate(deleteTemplateId)}
          onCancel={() => setDeleteTemplateId(null)}
          variant="destructive"
        />
      )}
    </div>
  )
}

// ─── Smart list → QueuedCompany[] helper ──────────────────────────────
// Builds a call queue for the dialer using the same rules as DialerSetup's
// auto-select logic, but driven by a saved smart list's filter parameters.
function buildSmartListQueue(input: {
  filters: SmartListFilters
  contactCount: number
  companies: CompanyRow[]
  contacts: ContactRow[]
  phonesByContact: Map<string, PhoneRow[]>
  lastCallMap: Map<string, string>
  tagsByCompany: Map<string, string[]>
}): QueuedCompany[] {
  const {
    filters,
    contactCount,
    companies,
    contacts,
    phonesByContact,
    lastCallMap,
    tagsByCompany,
  } = input

  const statusSet =
    filters.status.length > 0 ? new Set(filters.status) : null

  const eligibleCompanies = companies.filter((c) => {
    if (c.status === 'do_not_call') return false
    if (statusSet && !statusSet.has(c.status)) return false
    if (filters.zone.length > 0 && (!c.zone || !filters.zone.includes(c.zone)))
      return false
    if (
      filters.state.length > 0 &&
      (!c.state || !filters.state.includes(c.state))
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
  const eligibleIds = new Set(eligibleCompanies.map((c) => c.id))

  const contactsByCompany = new Map<string, QueuedContact[]>()
  for (const c of contacts) {
    if (!eligibleIds.has(c.company_id)) continue
    const phones = buildContactPhones(c, phonesByContact)
    if (phones.length === 0) continue
    const qc: QueuedContact = {
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      job_title: c.job_title,
      email: c.email,
      is_primary: !!c.is_primary,
      phones,
    }
    const list = contactsByCompany.get(c.company_id) ?? []
    list.push(qc)
    contactsByCompany.set(c.company_id, list)
  }

  const now = Date.now()
  const out: QueuedCompany[] = []
  for (const comp of eligibleCompanies) {
    const list = contactsByCompany.get(comp.id)
    if (!list || list.length === 0) continue
    const lastCall = lastCallMap.get(comp.id) ?? null
    if (isWithinCooldown(lastCall, now)) continue
    out.push({
      company_id: comp.id,
      company_name: comp.name,
      company_industry: comp.industry,
      company_zone: comp.zone,
      company_city: comp.city,
      company_state: comp.state,
      company_status: comp.status,
      company_priority: comp.priority,
      contacts: list,
      activeContactId: pickInitialActiveContactId(list),
      lastCallDate: lastCall,
    })
  }
  out.sort((a, b) => {
    if (!a.lastCallDate && !b.lastCallDate) return 0
    if (!a.lastCallDate) return -1
    if (!b.lastCallDate) return 1
    return (
      new Date(a.lastCallDate).getTime() -
      new Date(b.lastCallDate).getTime()
    )
  })
  return out.slice(0, Math.max(1, contactCount))
}
