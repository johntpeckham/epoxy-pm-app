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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type StatusFilter = 'prospect_contacted' | 'hot_lead' | 'all'
type PriorityFilter = 'all' | 'high' | 'high_medium'

interface CompanyRow {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  county: string | null
  city: string | null
  state: string | null
  status: string
  priority: 'high' | 'medium' | 'low' | null
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
  contact_email: string | null
  company_id: string
  company_name: string
  company_industry: string | null
  company_priority: 'high' | 'medium' | 'low' | null
  last_call_date: string | null
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
  const [regionCounty, setRegionCounty] = useState<string>('')
  const [industry, setIndustry] = useState<string>('')
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('prospect_contacted')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [manualQueue, setManualQueue] = useState<string[]>([])

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: compData },
      { data: contactData },
      { data: callData },
    ] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, industry, zone, region, county, city, state, status, priority')
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

  const regionsOrCounties = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) {
      if (c.region) s.add(c.region)
      if (c.county) s.add(c.county)
    }
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
    const eligibleCompanies = companies.filter((c) => {
      if (c.status === 'blacklisted') return false
      if (statusFilter === 'prospect_contacted' &&
          c.status !== 'prospect' && c.status !== 'contacted') return false
      if (statusFilter === 'hot_lead' && c.status !== 'hot_lead') return false
      if (zone && c.zone !== zone) return false
      if (regionCounty && c.region !== regionCounty && c.county !== regionCounty)
        return false
      if (industry && c.industry !== industry) return false
      if (priorityFilter === 'high' && c.priority !== 'high') return false
      if (
        priorityFilter === 'high_medium' &&
        c.priority !== 'high' &&
        c.priority !== 'medium'
      )
        return false
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
      const comp = companyMap.get(c.company_id)
      if (!comp) continue
      out.push({
        contact_id: c.id,
        contact_first_name: c.first_name,
        contact_last_name: c.last_name,
        contact_email: c.email,
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
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
    regionCounty,
    industry,
    statusFilter,
    priorityFilter,
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
        contact_email: c.email,
        company_id: comp.id,
        company_name: comp.name,
        company_industry: comp.industry,
        company_priority: comp.priority,
        last_call_date: lastCallMap.get(c.company_id) ?? null,
      })
    }
    return out
  }, [manualQueue, contacts, companyMap, lastCallMap])

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
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
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
                who haven&rsquo;t been emailed recently come first.
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
                    Region / County
                  </label>
                  <select
                    value={regionCounty}
                    onChange={(e) => setRegionCounty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">All regions</option>
                    {regionsOrCounties.map((r) => (
                      <option key={r} value={r}>
                        {r}
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
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="prospect_contacted">Prospect + Contacted</option>
                    <option value="hot_lead">Hot leads only</option>
                    <option value="all">All statuses</option>
                  </select>
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
              </div>
              <button
                onClick={() => setToast('Email session coming soon')}
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
                onClick={() => setToast('Email session coming soon')}
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
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
