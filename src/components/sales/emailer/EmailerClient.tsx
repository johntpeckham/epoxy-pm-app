'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  MailIcon,
  ClockIcon,
  UserPlusIcon,
  SearchIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileTextIcon,
  SparklesIcon,
  SendIcon,
  SkipForwardIcon,
  CheckCircle2Icon,
  RotateCcwIcon,
  BuildingIcon,
  PhoneIcon,
  MapPinIcon,
  ArrowRightIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MultiSelectDropdown from '../MultiSelectDropdown'
import { useAssignableUsers } from '@/lib/useAssignableUsers'

type PriorityFilter = 'all' | 'high' | 'high_medium'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'hot_lead', label: 'Hot lead' },
  { value: 'lost', label: 'Lost' },
]

const UNASSIGNED_SENTINEL = '__unassigned__'

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

interface EmailQueueContact {
  contact_id: string
  contact_first_name: string
  contact_last_name: string
  contact_job_title: string | null
  contact_email: string | null
  contact_phone: string | null
  company_id: string
  company_name: string
  company_industry: string | null
  company_zone: string | null
  company_city: string | null
  company_state: string | null
  company_status: string
  company_priority: 'high' | 'medium' | 'low' | null
  last_call_date: string | null
}

interface RecentCall {
  id: string
  outcome: string
  call_date: string
  notes: string | null
}

interface RecentComment {
  id: string
  content: string
  created_at: string
}

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (!withTime) return date
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} · ${time}`
}

interface EmailerClientProps {
  userId: string
}

export default function EmailerClient({ userId }: EmailerClientProps) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [lastCallMap, setLastCallMap] = useState<Map<string, string>>(new Map())

  const [howMany, setHowMany] = useState<number>(25)
  const [zone, setZone] = useState<string>('')
  const [industry, setIndustry] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string[]>([
    'prospect',
    'contacted',
  ])
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [assignedToIds, setAssignedToIds] = useState<string[]>([])
  const { users: assignableUsers } = useAssignableUsers()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [manualQueue, setManualQueue] = useState<string[]>([])

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [mode, setMode] = useState<'setup' | 'session' | 'complete'>('setup')
  const [sessionQueue, setSessionQueue] = useState<EmailQueueContact[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [skippedCount, setSkippedCount] = useState(0)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [recentComment, setRecentComment] = useState<RecentComment | null>(null)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [sessionTemplatesOpen, setSessionTemplatesOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (mode !== 'session') return
    const current = sessionQueue[currentIndex]
    if (!current) return
    let cancelled = false
    setSidebarLoading(true)
    setRecentCalls([])
    setRecentComment(null)

    async function load() {
      const companyId = current.company_id
      const [{ data: calls }, { data: comments }] = await Promise.all([
        supabase
          .from('crm_call_log')
          .select('id, outcome, call_date, notes')
          .eq('company_id', companyId)
          .order('call_date', { ascending: false })
          .limit(3),
        supabase
          .from('crm_comments')
          .select('id, content, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      setRecentCalls((calls ?? []) as RecentCall[])
      setRecentComment(((comments ?? [])[0] as RecentComment) ?? null)
      setSidebarLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, currentIndex, sessionQueue, supabase])

  function startSession(queue: EmailQueueContact[]) {
    if (queue.length === 0) {
      setToast('No contacts match your filters')
      return
    }
    setSessionQueue(queue)
    setCurrentIndex(0)
    setSubject('')
    setBody('')
    setSkippedCount(0)
    setMode('session')
  }

  function skipContact() {
    const current = sessionQueue[currentIndex]
    if (current) {
      setSkippedIds((prev) => new Set(prev).add(current.contact_id))
    }
    setSkippedCount((prev) => prev + 1)
    if (currentIndex >= sessionQueue.length - 1) {
      setMode('complete')
    } else {
      setCurrentIndex((prev) => prev + 1)
      setSubject('')
      setBody('')
    }
  }

  function endSession() {
    setMode('setup')
    setSessionQueue([])
    setCurrentIndex(0)
    setSubject('')
    setBody('')
    setSkippedIds(new Set())
  }

  function newSession() {
    setMode('setup')
    setSessionQueue([])
    setCurrentIndex(0)
    setSubject('')
    setBody('')
    setSkippedCount(0)
    setSkippedIds(new Set())
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: compData },
      { data: contactData },
      { data: callData },
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
        .from('crm_call_log')
        .select('company_id, call_date')
        .order('call_date', { ascending: false }),
    ])
    setCompanies((compData ?? []) as CompanyRow[])
    setContacts((contactData ?? []) as ContactRow[])
    const calls = (callData ?? []) as { company_id: string; call_date: string }[]
    const m = new Map<string, string>()
    for (const c of calls) {
      if (!m.has(c.company_id)) m.set(c.company_id, c.call_date)
    }
    setLastCallMap(m)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const zones = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (c.zone) s.add(c.zone)
    return [...s].sort()
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

  const autoQueue = useMemo<EmailQueueContact[]>(() => {
    const statusSet = statusFilter.length > 0 ? new Set(statusFilter) : null
    const assignedSet =
      assignedToIds.length > 0 ? new Set(assignedToIds) : null

    const eligibleCompanies = companies.filter((c) => {
      if (c.status === 'blacklisted') return false
      if (statusSet && !statusSet.has(c.status)) return false
      if (zone && c.zone !== zone) return false
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

    const eligibleContacts = contacts.filter((c) => eligibleIds.has(c.company_id))

    const picked = new Map<string, ContactRow>()
    for (const c of eligibleContacts) {
      const existing = picked.get(c.company_id)
      if (!existing) {
        picked.set(c.company_id, c)
      } else if (!existing.is_primary && c.is_primary) {
        picked.set(c.company_id, c)
      }
    }

    const out: EmailQueueContact[] = []
    for (const c of picked.values()) {
      // Reachability: skip contacts without an email address
      if (!c.email || !c.email.trim()) continue
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      out.push({
        contact_id: c.id,
        contact_first_name: c.first_name,
        contact_last_name: c.last_name,
        contact_job_title: c.job_title,
        contact_email: c.email,
        contact_phone: c.phone,
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
        company_zone: comp.zone,
        company_city: comp.city,
        company_state: comp.state,
        company_status: comp.status,
        company_priority: comp.priority,
        last_call_date: lastCallMap.get(c.company_id) ?? null,
      })
    }
    out.sort((a, b) => {
      if (!a.last_call_date && !b.last_call_date) return 0
      if (!a.last_call_date) return -1
      if (!b.last_call_date) return 1
      return (
        new Date(a.last_call_date).getTime() -
        new Date(b.last_call_date).getTime()
      )
    })
    return out.slice(0, Math.max(1, howMany))
  }, [
    companies,
    contacts,
    companyMap,
    lastCallMap,
    zone,
    industry,
    statusFilter,
    priorityFilter,
    assignedToIds,
    howMany,
  ])

  const manualQueueResolved = useMemo<EmailQueueContact[]>(() => {
    const out: EmailQueueContact[] = []
    for (const cid of manualQueue) {
      const c = contacts.find((x) => x.id === cid)
      if (!c) continue
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      out.push({
        contact_id: c.id,
        contact_first_name: c.first_name,
        contact_last_name: c.last_name,
        contact_job_title: c.job_title,
        contact_email: c.email,
        contact_phone: c.phone,
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
        company_zone: comp.zone,
        company_city: comp.city,
        company_state: comp.state,
        company_status: comp.status,
        company_priority: comp.priority,
        last_call_date: lastCallMap.get(c.company_id) ?? null,
      })
    }
    return out
  }, [manualQueue, contacts, companyMap, lastCallMap])

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

  const searchResults = useMemo(() => {
    if (!debouncedSearch) return []
    const queued = new Set(manualQueue)
    const matches: { contact: ContactRow; company: CompanyRow }[] = []
    for (const c of contacts) {
      if (queued.has(c.id)) continue
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      if (comp.status === 'blacklisted') continue
      const hay = `${c.first_name} ${c.last_name} ${comp.name}`.toLowerCase()
      if (hay.includes(debouncedSearch)) {
        matches.push({ contact: c, company: comp })
      }
      if (matches.length >= 12) break
    }
    return matches
  }, [debouncedSearch, contacts, companyMap, manualQueue])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/sales" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <MailIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            Emailer
          </h1>
        </div>
      </div>

      {/* Setup view */}
      {mode === 'setup' && <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
        <div className="max-w-[760px] mx-auto px-6 pt-14 pb-16">
          {/* Centered heading */}
          <div className="text-center mb-10">
            <h1 className="text-[26px] font-medium text-gray-900 dark:text-white leading-tight">
              Start an email session
            </h1>
            <p className="text-sm text-gray-400 mt-2">
              Build your queue, settle in, and start emailing.
            </p>
          </div>

          {/* Two cards */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-stretch">
            {/* Auto-select */}
            <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 md:p-7 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <ClockIcon className="w-4 h-4 text-teal-600" />
                <h2 className="text-[15px] font-medium text-gray-900 dark:text-white">
                  Auto-select
                </h2>
              </div>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Set parameters and we&rsquo;ll build a prioritized queue. Contacts
                who haven&rsquo;t been contacted recently come first.
              </p>
              <div className="space-y-3 flex-1">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">
                    How many emails?
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={howMany}
                    onChange={(e) => setHowMany(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Zone</label>
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">All zones</option>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">
                    Industry
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                onClick={() => startSession(autoQueue)}
                disabled={loading || autoQueue.length === 0}
                className="mt-5 w-full py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 transition-colors"
              >
                Start session — {autoQueue.length} email
                {autoQueue.length === 1 ? '' : 's'}
              </button>
            </div>

            {/* or divider */}
            <div className="hidden md:flex flex-col items-center justify-center">
              <div className="h-full w-px bg-gray-100 dark:bg-[#333]" />
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
                <h2 className="text-[15px] font-medium text-gray-900 dark:text-white">
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
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#333] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.contact.id}
                        onClick={() => {
                          setManualQueue((prev) => [...prev, r.contact.id])
                          setSearch('')
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900 dark:text-white truncate">
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
                    {manualQueueResolved.map((q, idx) => (
                      <div
                        key={q.contact_id}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
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
                          <div className="text-sm text-gray-900 dark:text-white truncate">
                            {q.contact_first_name} {q.contact_last_name}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {q.company_name}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setManualQueue((prev) =>
                              prev.filter((id) => id !== q.contact_id)
                            )
                          }
                          className="text-xs text-gray-400 hover:text-red-600"
                        >
                          remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => startSession(manualQueueResolved)}
                disabled={manualQueueResolved.length === 0}
                className="mt-5 w-full py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 transition-colors"
              >
                Start session — {manualQueueResolved.length} email
                {manualQueueResolved.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          {/* Email Templates section */}
          <div className="mt-10 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden">
            <button
              onClick={() => setTemplatesOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
            >
              {templatesOpen ? (
                <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-gray-400" />
              )}
              <FileTextIcon className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-900 dark:text-white flex-1 text-left">
                Email Templates
              </span>
              <span className="text-xs text-gray-400">0</span>
            </button>
            {templatesOpen && (
              <div className="border-t border-gray-200 dark:border-[#333] px-5 py-4">
                <p className="text-xs text-gray-400 italic">
                  No email templates yet. Templates will be available in a future update.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Session view */}
      {mode === 'session' && sessionQueue[currentIndex] && (() => {
        const current = sessionQueue[currentIndex]
        const progressPct = Math.round((currentIndex / Math.max(1, sessionQueue.length)) * 100)
        const location = [current.company_city, current.company_state].filter(Boolean).join(', ')

        return (
          <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#1a1a1a] min-h-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-4">
                {/* Session bar */}
                <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] px-5 py-3 flex items-center gap-4">
                  <button
                    onClick={endSession}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    End session
                  </button>
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-xs text-gray-500 tabular-nums">
                      {currentIndex + 1} of {sessionQueue.length}
                    </span>
                    <div className="flex-1 h-[3px] bg-gray-100 dark:bg-[#333] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 transition-all duration-500 ease-out"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={skipContact}
                    className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={skipContact}
                    className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors"
                  >
                    {currentIndex >= sessionQueue.length - 1 ? 'Finish' : 'Next contact'}
                    <ArrowRightIcon className="w-3 h-3" />
                  </button>
                </div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                  {/* Left column — Compose + Templates */}
                  <div className="space-y-4">
                    {/* Compose Email card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">
                        Compose Email
                      </p>

                      {/* To */}
                      <div className="mb-3">
                        <label className="block text-[11px] text-gray-400 mb-1">To</label>
                        <div className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-gray-50 dark:bg-[#1a1a1a] text-gray-500 dark:text-gray-400">
                          {current.contact_email || 'No email address'}
                        </div>
                      </div>

                      {/* Subject */}
                      <div className="mb-3">
                        <label className="block text-[11px] text-gray-400 mb-1">Subject</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="Email subject line..."
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                      </div>

                      {/* Body */}
                      <div className="mb-4">
                        <label className="block text-[11px] text-gray-400 mb-1">Body</label>
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          rows={10}
                          placeholder="Compose your email..."
                          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                        />
                      </div>

                      {/* Helper text */}
                      <p className="text-xs text-gray-400 mb-3">
                        AI compose and email sending will be available in a future update.
                      </p>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          disabled
                          title="Coming soon"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-[#333] rounded-lg disabled:opacity-40 transition-colors"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" />
                          AI Compose
                        </button>
                        <button
                          disabled
                          title="Coming soon"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-[#333] rounded-lg disabled:opacity-40 transition-colors"
                        >
                          <SendIcon className="w-3.5 h-3.5" />
                          Send
                        </button>
                        <button
                          onClick={skipContact}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                        >
                          <SkipForwardIcon className="w-3.5 h-3.5" />
                          Skip
                        </button>
                      </div>

                      {/* Collapsible Templates */}
                      <div className="mt-4 border-t border-gray-100 dark:border-[#333] pt-4">
                        <button
                          onClick={() => setSessionTemplatesOpen((v) => !v)}
                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
                        >
                          {sessionTemplatesOpen ? (
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRightIcon className="w-3.5 h-3.5" />
                          )}
                          <FileTextIcon className="w-3.5 h-3.5" />
                          Templates
                        </button>
                        {sessionTemplatesOpen && (
                          <p className="text-xs text-gray-400 italic mt-2 pl-5">
                            No email templates yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right column — Sidebar cards */}
                  <div className="space-y-4">
                    {/* Contact card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">
                        Contact
                      </p>
                      <div className="flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-400 text-sm font-medium mb-3">
                          {current.contact_first_name.charAt(0)}{current.contact_last_name.charAt(0)}
                        </div>
                        <h2 className="text-sm font-medium text-gray-900 dark:text-white leading-tight">
                          {current.contact_first_name} {current.contact_last_name}
                        </h2>
                        {current.contact_job_title && (
                          <p className="text-xs text-gray-500 mt-0.5">{current.contact_job_title}</p>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs">
                          <BuildingIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 dark:text-gray-300 truncate">{current.company_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <MailIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700 dark:text-gray-300 truncate">{current.contact_email || '—'}</span>
                        </div>
                        {current.contact_phone && (
                          <div className="flex items-center gap-2 text-xs">
                            <PhoneIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 tabular-nums">{current.contact_phone}</span>
                          </div>
                        )}
                        {location && (
                          <div className="flex items-center gap-2 text-xs">
                            <MapPinIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300">{location}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Company card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
                        Company
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {current.company_name}
                      </p>
                      {current.company_industry && (
                        <p className="text-xs text-gray-500 mt-0.5">{current.company_industry}</p>
                      )}
                      {location && (
                        <p className="text-xs text-gray-400 mt-0.5">{location}</p>
                      )}
                      {current.company_priority && (
                        <span className={`inline-block mt-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          current.company_priority === 'high'
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                            : current.company_priority === 'medium'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {current.company_priority} priority
                        </span>
                      )}
                    </div>

                    {/* Last Activity card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                        Last activity
                      </p>
                      {sidebarLoading ? (
                        <p className="text-xs text-gray-400 italic">Loading…</p>
                      ) : recentCalls.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No recent activity.</p>
                      ) : (
                        <ul className="space-y-2.5">
                          {recentCalls.map((c) => (
                            <li key={c.id} className="text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="capitalize text-gray-700 dark:text-gray-300">
                                  {c.outcome.replace(/_/g, ' ')}
                                </span>
                                <span className="text-gray-400 tabular-nums">
                                  {formatDate(c.call_date)}
                                </span>
                              </div>
                              {c.notes && (
                                <p className="text-gray-500 mt-0.5 line-clamp-2">
                                  {c.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Notes card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                        Notes
                      </p>
                      {sidebarLoading ? (
                        <p className="text-xs text-gray-400 italic">Loading…</p>
                      ) : !recentComment ? (
                        <p className="text-xs text-gray-400 italic">No notes.</p>
                      ) : (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          <p className="line-clamp-4 whitespace-pre-wrap leading-relaxed">
                            {recentComment.content}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {formatDate(recentComment.created_at, true)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Queue card */}
                    <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                        Queue
                      </p>
                      <ul className="space-y-1">
                        {sessionQueue.map((q, idx) => {
                          const isCurrent = idx === currentIndex
                          const isDone = skippedIds.has(q.contact_id)
                          return (
                            <li
                              key={q.contact_id}
                              className={`text-xs flex items-center gap-2 px-2 py-1 rounded ${
                                isDone
                                  ? 'text-gray-300 dark:text-gray-600 line-through'
                                  : isCurrent
                                    ? 'text-teal-700 dark:text-teal-400 font-medium bg-teal-50 dark:bg-teal-900/20'
                                    : 'text-gray-500'
                              }`}
                            >
                              {isCurrent && (
                                <ChevronRightIcon className="w-3 h-3 text-teal-500 flex-none" />
                              )}
                              <span className="truncate flex-1">
                                {q.contact_first_name} {q.contact_last_name}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Session complete view */}
      {mode === 'complete' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
          <div className="max-w-[520px] mx-auto px-6 pt-16 pb-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-5">
              <CheckCircle2Icon className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-[24px] font-medium text-gray-900 dark:text-white leading-tight">
              Session complete
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {sessionQueue.length} contact{sessionQueue.length === 1 ? '' : 's'} reviewed.
            </p>

            <div className="mt-10 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl divide-y divide-gray-100 dark:divide-[#2a2a2a] text-left">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total contacts</span>
                <span className="text-sm tabular-nums text-gray-500">{sessionQueue.length}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Skipped</span>
                <span className="text-sm tabular-nums text-gray-500">{skippedCount}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-900 dark:text-white font-medium">Emails sent</span>
                <span className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">0</span>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={newSession}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <RotateCcwIcon className="w-4 h-4" />
                Start new session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
