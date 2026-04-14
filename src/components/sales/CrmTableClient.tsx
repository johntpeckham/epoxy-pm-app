'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  PlusIcon,
  UploadIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from 'lucide-react'
import Portal from '@/components/ui/Portal'
import NewCompanyModal from './NewCompanyModal'

type CompanyStatus = 'prospect' | 'contacted' | 'hot_lead' | 'lost' | 'blacklisted'
type CompanyPriority = 'high' | 'medium' | 'low'

interface CompanyRow {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: CompanyStatus
  priority: CompanyPriority | null
  assigned_to: string | null
  assigned_name: string | null
  contact_count: number
  last_activity: string | null
  last_note: string | null
  tag_ids: string[]
  created_at: string
  updated_at: string
}

interface ProfileMini {
  id: string
  display_name: string | null
}

interface TagRow {
  id: string
  name: string
}

type FilterField =
  | 'status'
  | 'zone'
  | 'region'
  | 'state'
  | 'county'
  | 'city'
  | 'industry'
  | 'priority'
  | 'assigned_to'
  | 'tags'

const STATUS_LABELS: Record<CompanyStatus, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  hot_lead: 'Hot Lead',
  lost: 'Lost',
  blacklisted: 'Blacklisted',
}

const PRIORITY_LABELS: Record<CompanyPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const STATUS_TEXT_COLOR: Record<CompanyStatus, string> = {
  prospect: 'text-[#27500A]',
  contacted: 'text-[#0C447C]',
  hot_lead: 'text-[#854F0B]',
  lost: 'text-[#791F1F]',
  blacklisted: 'text-gray-400',
}

const PRIORITY_TEXT_COLOR: Record<CompanyPriority, string> = {
  high: 'text-amber-600',
  medium: 'text-gray-700',
  low: 'text-gray-400',
}

const PAGE_SIZE = 50

const FILTER_CONFIG: { field: FilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'zone', label: 'Zone' },
  { field: 'region', label: 'Region' },
  { field: 'state', label: 'State' },
  { field: 'county', label: 'County' },
  { field: 'city', label: 'City' },
  { field: 'industry', label: 'Industry' },
  { field: 'priority', label: 'Priority' },
  { field: 'assigned_to', label: 'Assigned to' },
  { field: 'tags', label: 'Tags' },
]

type SortField =
  | 'name'
  | 'industry'
  | 'zone'
  | 'location'
  | 'status'
  | 'priority'
  | 'contact_count'
  | 'last_activity'
  | 'assigned_name'
  | 'last_note'

interface CrmTableClientProps {
  userId: string
}

export default function CrmTableClient({ userId }: CrmTableClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMini[]>([])
  const [allTags, setAllTags] = useState<TagRow[]>([])
  const [totalContactCount, setTotalContactCount] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchInput])

  const [filters, setFilters] = useState<Record<FilterField, Set<string>>>({
    status: new Set(),
    zone: new Set(),
    region: new Set(),
    state: new Set(),
    county: new Set(),
    city: new Set(),
    industry: new Set(),
    priority: new Set(),
    assigned_to: new Set(),
    tags: new Set(),
  })

  const [sortField, setSortField] = useState<SortField>('last_activity')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const [showNewModal, setShowNewModal] = useState(false)
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)

    // Profiles (for assigned_to display + filter options)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, display_name')
    const profilesList: ProfileMini[] = (profileData ?? []).map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? null,
    }))
    setProfiles(profilesList)
    const profileMap = new Map(profilesList.map((p) => [p.id, p.display_name]))

    // Tags
    const { data: tagData } = await supabase
      .from('crm_tags')
      .select('id, name')
      .order('name', { ascending: true })
    setAllTags((tagData ?? []) as TagRow[])

    // Total contact count (for header subtitle)
    const { count: contactCountRaw } = await supabase
      .from('crm_contacts')
      .select('id', { count: 'exact', head: true })
    setTotalContactCount(contactCountRaw ?? 0)

    // Companies — fetch all (client-side filter/sort/paginate keeps aggregate
    // sorting correct across pages; dataset is expected to stay in the low
    // thousands for Phase 1B).
    const { data: companyData } = await supabase
      .from('crm_companies')
      .select(
        'id, name, industry, zone, region, state, county, city, status, priority, assigned_to, created_at, updated_at'
      )
    const companyRows = (companyData ?? []) as Array<{
      id: string
      name: string
      industry: string | null
      zone: string | null
      region: string | null
      state: string | null
      county: string | null
      city: string | null
      status: CompanyStatus
      priority: CompanyPriority | null
      assigned_to: string | null
      created_at: string
      updated_at: string
    }>
    const companyIds = companyRows.map((c) => c.id)

    // Contact counts per company
    const contactCounts = new Map<string, number>()
    if (companyIds.length > 0) {
      const { data: contactsForCount } = await supabase
        .from('crm_contacts')
        .select('company_id')
        .in('company_id', companyIds)
      for (const row of (contactsForCount ?? []) as { company_id: string }[]) {
        contactCounts.set(row.company_id, (contactCounts.get(row.company_id) ?? 0) + 1)
      }
    }

    // Last call date per company
    const lastActivity = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: callRows } = await supabase
        .from('crm_call_log')
        .select('company_id, call_date')
        .in('company_id', companyIds)
        .order('call_date', { ascending: false })
      for (const row of (callRows ?? []) as { company_id: string; call_date: string }[]) {
        if (!lastActivity.has(row.company_id)) {
          lastActivity.set(row.company_id, row.call_date)
        }
      }
    }

    // Most recent comment content per company
    const lastNote = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: commentRows } = await supabase
        .from('crm_comments')
        .select('company_id, content, created_at')
        .in('company_id', companyIds)
        .order('created_at', { ascending: false })
      for (const row of (commentRows ?? []) as {
        company_id: string
        content: string
        created_at: string
      }[]) {
        if (!lastNote.has(row.company_id)) {
          lastNote.set(row.company_id, row.content)
        }
      }
    }

    // Tags per company
    const tagsByCompany = new Map<string, string[]>()
    if (companyIds.length > 0) {
      const { data: tagLinks } = await supabase
        .from('crm_company_tags')
        .select('company_id, tag_id')
        .in('company_id', companyIds)
      for (const row of (tagLinks ?? []) as { company_id: string; tag_id: string }[]) {
        const list = tagsByCompany.get(row.company_id) ?? []
        list.push(row.tag_id)
        tagsByCompany.set(row.company_id, list)
      }
    }

    // Contact names used for search (map company_id → joined names)
    const contactNameBlob = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: contactNameRows } = await supabase
        .from('crm_contacts')
        .select('company_id, first_name, last_name')
        .in('company_id', companyIds)
      for (const row of (contactNameRows ?? []) as {
        company_id: string
        first_name: string
        last_name: string
      }[]) {
        const existing = contactNameBlob.get(row.company_id) ?? ''
        contactNameBlob.set(
          row.company_id,
          `${existing} ${row.first_name} ${row.last_name}`.toLowerCase()
        )
      }
    }

    const merged: CompanyRow[] = companyRows.map((c) => ({
      ...c,
      assigned_name: c.assigned_to ? profileMap.get(c.assigned_to) ?? null : null,
      contact_count: contactCounts.get(c.id) ?? 0,
      last_activity: lastActivity.get(c.id) ?? null,
      last_note: lastNote.get(c.id) ?? null,
      tag_ids: tagsByCompany.get(c.id) ?? [],
    }))
    // attach the search blob under a non-enumerable key via Map in state
    searchBlobRef.current = contactNameBlob

    setCompanies(merged)
    setLoading(false)
  }, [supabase])

  // Contact-names search blob (kept in ref so state deps stay minimal).
  const searchBlobRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ─── Filter options (from actual data) ───────────────────────────────────
  const filterOptions = useMemo((): Record<FilterField, { value: string; label: string }[]> => {
    const uniqueField = (fld: keyof CompanyRow): string[] => {
      const set = new Set<string>()
      for (const c of companies) {
        const v = c[fld]
        if (typeof v === 'string' && v.trim() !== '') set.add(v)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    }
    const assignedSet = new Set<string>()
    for (const c of companies) {
      if (c.assigned_to) assignedSet.add(c.assigned_to)
    }
    const assignedList = Array.from(assignedSet)
      .map((id) => ({
        value: id,
        label:
          profiles.find((p) => p.id === id)?.display_name ||
          `User ${id.slice(0, 6)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return {
      status: (['prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted'] as CompanyStatus[]).map(
        (s) => ({ value: s, label: STATUS_LABELS[s] })
      ),
      zone: uniqueField('zone').map((v) => ({ value: v, label: v })),
      region: uniqueField('region').map((v) => ({ value: v, label: v })),
      state: uniqueField('state').map((v) => ({ value: v, label: v })),
      county: uniqueField('county').map((v) => ({ value: v, label: v })),
      city: uniqueField('city').map((v) => ({ value: v, label: v })),
      industry: uniqueField('industry').map((v) => ({ value: v, label: v })),
      priority: (['high', 'medium', 'low'] as CompanyPriority[]).map((p) => ({
        value: p,
        label: PRIORITY_LABELS[p],
      })),
      assigned_to: assignedList,
      tags: allTags.map((t) => ({ value: t.id, label: t.name })),
    }
  }, [companies, profiles, allTags])

  // ─── Filter + search + sort ──────────────────────────────────────────────
  const filteredSorted = useMemo(() => {
    let rows = companies

    // Column filters (AND across fields; OR within a field)
    const applySetFilter = (field: keyof CompanyRow, selected: Set<string>) => {
      if (selected.size === 0) return
      rows = rows.filter((r) => {
        const v = r[field]
        return typeof v === 'string' && selected.has(v)
      })
    }
    applySetFilter('status', filters.status)
    applySetFilter('zone', filters.zone)
    applySetFilter('region', filters.region)
    applySetFilter('state', filters.state)
    applySetFilter('county', filters.county)
    applySetFilter('city', filters.city)
    applySetFilter('industry', filters.industry)
    applySetFilter('priority', filters.priority)
    if (filters.assigned_to.size > 0) {
      rows = rows.filter((r) => r.assigned_to != null && filters.assigned_to.has(r.assigned_to))
    }
    if (filters.tags.size > 0) {
      rows = rows.filter((r) => r.tag_ids.some((t) => filters.tags.has(t)))
    }

    // Search across company name, contact names, and city
    if (search !== '') {
      rows = rows.filter((r) => {
        const inName = r.name.toLowerCase().includes(search)
        const inCity = (r.city ?? '').toLowerCase().includes(search)
        const inContacts = (searchBlobRef.current.get(r.id) ?? '').includes(search)
        return inName || inCity || inContacts
      })
    }

    // Sort
    const asc = sortAsc ? 1 : -1
    const cmpStr = (a: string | null, b: string | null) => {
      const av = (a ?? '').toLowerCase()
      const bv = (b ?? '').toLowerCase()
      if (av === bv) return 0
      // empty strings always sort to the bottom regardless of direction
      if (av === '') return 1
      if (bv === '') return -1
      return av < bv ? -asc : asc
    }
    const cmpNum = (a: number, b: number) => (a === b ? 0 : a < b ? -asc : asc)
    const sorted = [...rows].sort((a, b) => {
      switch (sortField) {
        case 'name':
          return cmpStr(a.name, b.name)
        case 'industry':
          return cmpStr(a.industry, b.industry)
        case 'zone':
          return cmpStr(a.zone, b.zone)
        case 'location':
          return cmpStr(
            `${a.city ?? ''} ${a.state ?? ''}`,
            `${b.city ?? ''} ${b.state ?? ''}`
          )
        case 'status':
          return cmpStr(a.status, b.status)
        case 'priority':
          return cmpStr(a.priority, b.priority)
        case 'contact_count':
          return cmpNum(a.contact_count, b.contact_count)
        case 'last_activity':
          return cmpStr(a.last_activity, b.last_activity)
        case 'assigned_name':
          return cmpStr(a.assigned_name, b.assigned_name)
        case 'last_note':
          return cmpStr(a.last_note, b.last_note)
        default:
          return 0
      }
    })
    return sorted
  }, [companies, filters, search, sortField, sortAsc])

  const totalCount = filteredSorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, totalCount)
  const pageRows = filteredSorted.slice(pageStart, pageEnd)

  // Reset to page 1 when filters/search/sort change
  const prevKeyRef = useRef<string>('')
  useEffect(() => {
    const key = JSON.stringify({
      s: search,
      f: Object.fromEntries(
        Object.entries(filters).map(([k, v]) => [k, Array.from(v).sort()])
      ),
      sf: sortField,
      sa: sortAsc,
    })
    if (prevKeyRef.current !== '' && prevKeyRef.current !== key) {
      // Change detected → reset to page 1
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
    prevKeyRef.current = key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters, sortField, sortAsc])

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (page <= 1) params.delete('page')
    else params.set('page', String(page))
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc((v) => !v)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  function toggleFilterValue(field: FilterField, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [field]: new Set(prev[field]) } as typeof prev
      if (next[field].has(value)) next[field].delete(value)
      else next[field].add(value)
      return next
    })
  }

  function clearFilter(field: FilterField) {
    setFilters((prev) => ({ ...prev, [field]: new Set() }))
  }

  const activeFilterCount = Object.values(filters).reduce((n, s) => n + s.size, 0)

  // ─── Helpers for render ──────────────────────────────────────────────────
  function formatDate(iso: string | null): { text: string; stale: boolean } {
    if (!iso) return { text: '—', stale: false }
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return { text: '—', stale: false }
    const now = Date.now()
    const ageMs = now - d.getTime()
    const stale = ageMs > 30 * 24 * 60 * 60 * 1000
    const text = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return { text, stale }
  }
  function formatAssigned(full: string | null): string {
    if (!full) return '—'
    const parts = full.trim().split(/\s+/)
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1][0]}.`
  }

  const pageNumbers = useMemo(() => {
    // Compact pagination: show 1 … current-1, current, current+1 … N
    const nums: (number | 'ellipsis')[] = []
    const add = (n: number) => {
      if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n)
    }
    add(1)
    if (safePage > 3) nums.push('ellipsis')
    for (let i = safePage - 1; i <= safePage + 1; i++) add(i)
    if (safePage < totalPages - 2) nums.push('ellipsis')
    add(totalPages)
    return nums
  }, [safePage, totalPages])

  // ─── Render ──────────────────────────────────────────────────────────────
  const headerCell = (
    label: string,
    field: SortField | null,
    extraClass = ''
  ) => (
    <th
      onClick={field ? () => toggleSort(field) : undefined}
      className={`text-[11px] font-normal text-gray-400 text-left ${
        field ? 'cursor-pointer select-none hover:text-gray-600' : ''
      } ${extraClass}`}
      style={{ paddingTop: 14, paddingBottom: 14 }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {field && sortField === field && (
          sortAsc ? (
            <ArrowUpIcon className="w-3 h-3" />
          ) : (
            <ArrowDownIcon className="w-3 h-3" />
          )
        )}
      </span>
    </th>
  )

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* ── Header ── */}
      <div className="px-7 pt-8 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[22px] font-medium text-gray-900 leading-tight">CRM</h1>
          <p className="text-sm text-gray-400 mt-1">
            {companies.length} {companies.length === 1 ? 'company' : 'companies'} ·{' '}
            {totalContactCount} {totalContactCount === 1 ? 'contact' : 'contacts'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" style={{ width: 280 }}>
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search companies or contacts..."
              className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => showToast('CSV import — coming soon')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <UploadIcon className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New company
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="px-7 pb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filter:</span>
        {FILTER_CONFIG.map(({ field, label }) => {
          const selected = filters[field]
          const options = filterOptions[field]
          const active = selected.size > 0
          return (
            <div key={field} className="relative">
              <button
                onClick={() => setOpenFilter((f) => (f === field ? null : field))}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                style={{ borderRadius: 20 }}
              >
                {label}
                {active && <span className="text-[10px] text-blue-500">({selected.size})</span>}
                {active ? (
                  <XIcon
                    className="w-3 h-3 ml-0.5 hover:text-blue-900"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFilter(field)
                    }}
                  />
                ) : (
                  <ChevronDownIcon className="w-3 h-3" />
                )}
              </button>
              {openFilter === field && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setOpenFilter(null)}
                  />
                  <div
                    className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[200px] max-h-[300px] overflow-y-auto"
                  >
                    {options.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No values</div>
                    ) : (
                      options.map((opt) => {
                        const checked = selected.has(opt.value)
                        return (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFilterValue(field, opt.value)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                            />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        {activeFilterCount > 0 && (
          <button
            onClick={() =>
              setFilters({
                status: new Set(),
                zone: new Set(),
                region: new Set(),
                state: new Set(),
                county: new Set(),
                city: new Set(),
                industry: new Set(),
                priority: new Set(),
                assigned_to: new Set(),
                tags: new Set(),
              })
            }
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="px-7 py-16 text-sm text-gray-400 text-center">Loading…</div>
      ) : totalCount === 0 ? (
        <div className="px-7 py-20 flex flex-col items-center justify-center text-center">
          <p className="text-sm text-gray-500 mb-4">
            {companies.length === 0
              ? 'No companies yet. Add your first company to get started.'
              : 'No companies match the current filters.'}
          </p>
          {companies.length === 0 && (
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New company
            </button>
          )}
        </div>
      ) : (
        <div className="w-full">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200" style={{ borderBottomWidth: '0.5px' }}>
                {headerCell('Company', 'name', 'pl-7 pr-2')}
                {headerCell('Industry', 'industry', 'px-2')}
                {headerCell('Zone', 'zone', 'px-2')}
                {headerCell('Location', 'location', 'px-2')}
                {headerCell('Status', 'status', 'px-2')}
                {headerCell('Priority', 'priority', 'px-2')}
                {headerCell('Contacts', 'contact_count', 'px-2 text-center')}
                {headerCell('Last activity', 'last_activity', 'px-2')}
                {headerCell('Assigned', 'assigned_name', 'px-2')}
                {headerCell('Last note', 'last_note', 'pl-2 pr-7')}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const blacklisted = c.status === 'blacklisted'
                const last = formatDate(c.last_activity)
                const cityState = [c.city, c.state].filter(Boolean).join(', ')
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/sales/crm/${c.id}`)}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      blacklisted ? 'opacity-40' : ''
                    }`}
                    style={{ borderBottomWidth: '0.5px' }}
                  >
                    <td
                      className="pl-7 pr-2 text-sm font-medium text-gray-900 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.name}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.industry || '—'}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.zone || '—'}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {cityState || '—'}
                    </td>
                    <td
                      className={`px-2 text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {STATUS_LABELS[c.status]}
                    </td>
                    <td
                      className={`px-2 text-sm ${
                        c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'
                      }`}
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.priority ? PRIORITY_LABELS[c.priority] : '—'}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 text-center"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.contact_count}
                    </td>
                    <td
                      className={`px-2 text-sm ${last.stale ? 'text-amber-600' : 'text-gray-600'}`}
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {last.text}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {formatAssigned(c.assigned_name)}
                    </td>
                    <td
                      className="pl-2 pr-7 text-sm text-gray-500 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                      title={c.last_note ?? ''}
                    >
                      {c.last_note || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Pagination footer ── */}
          <div className="px-7 py-4 flex items-center justify-between bg-gray-50 border-t border-gray-200" style={{ borderTopWidth: '0.5px' }}>
            <p className="text-xs text-gray-400">
              Showing {pageStart + 1}-{pageEnd} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e-${i}`} className="px-2 text-xs text-gray-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`px-2.5 py-1 text-xs rounded ${
                      p === safePage
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              {safePage < totalPages && (
                <button
                  onClick={() => goToPage(safePage + 1)}
                  className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded ml-1"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
            {toast}
          </div>
        </Portal>
      )}

      {/* ── New Company modal ── */}
      {showNewModal && (
        <NewCompanyModal
          userId={userId}
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false)
            fetchAll()
          }}
        />
      )}
    </div>
  )
}
