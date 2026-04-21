'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SearchIcon,
  XIcon,
  DownloadIcon,
  UploadIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { toCsv, downloadCsv } from '@/lib/csv'
import CustomerDetailModal from './CustomerDetailModal'

type ViewMode = 'new' | 'existing'

interface ExistingCustomersViewProps {
  userId?: string
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  onNewCompany?: () => void
  onImportCsv?: () => void
}

interface CustomerRow {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  created_at: string
  crm_company_id: string | null
  industry: string | null
  region: string | null
  assigned_to: string | null
  assigned_name: string | null
  tag_ids: string[]
  jobs_completed: number
  total_revenue: number
  last_contact: string | null
  last_job: string | null
}

interface ProfileMini {
  id: string
  display_name: string | null
}

interface TagRow {
  id: string
  name: string
}

type SortField =
  | 'name'
  | 'industry'
  | 'location'
  | 'jobs_completed'
  | 'total_revenue'
  | 'last_contact'
  | 'last_job'
  | 'assigned_name'

type LastContactFilter = 'all' | '30' | '60' | '90' | '90plus'

const PAGE_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

function currentMs(): number {
  return Date.now()
}

export default function ExistingCustomersView({
  viewMode,
  setViewMode,
  onNewCompany,
  onImportCsv,
}: ExistingCustomersViewProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMini[]>([])
  const [allTags, setAllTags] = useState<TagRow[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(
      () => setSearch(searchInput.trim().toLowerCase()),
      300
    )
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchInput])

  const [filterIndustry, setFilterIndustry] = useState<Set<string>>(new Set())
  const [filterRegion, setFilterRegion] = useState<Set<string>>(new Set())
  const [filterAssigned, setFilterAssigned] = useState<Set<string>>(new Set())
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set())
  const [filterLastContact, setFilterLastContact] =
    useState<LastContactFilter>('all')
  const [openFilter, setOpenFilter] = useState<string | null>(null)

  const [sortField, setSortField] = useState<SortField>('last_contact')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailCustomer, setDetailCustomer] = useState<CustomerRow | null>(null)

  const [page, setPage] = useState(1)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const toggleSort = useCallback(
    (f: SortField) => {
      if (sortField === f) setSortAsc((a) => !a)
      else {
        setSortField(f)
        setSortAsc(false)
      }
    },
    [sortField]
  )

  const fetchAll = useCallback(async () => {
    const [
      { data: customerRows },
      { data: estimateRows },
      { data: estimatingProjectRows },
      { data: projectRows },
      { data: invoiceRows },
      { data: crmCompanyRows },
      { data: profileRows },
      { data: tagRows },
      { data: companyTagRows },
    ] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, company, email, phone, city, state, created_at')
        .eq('archived', false),
      supabase
        .from('estimates')
        .select('id, company_id, total, status, created_at'),
      supabase
        .from('estimating_projects')
        .select('id, company_id, status, created_at, updated_at'),
      supabase
        .from('projects')
        .select('id, company_id, client_name, status, created_at'),
      supabase
        .from('invoices')
        .select('id, company_id, total, issued_date'),
      supabase
        .from('companies')
        .select('id, name, industry, region, assigned_to')
        .eq('archived', false),
      supabase
        .from('profiles')
        .select('id, display_name'),
      supabase
        .from('crm_tags')
        .select('id, name'),
      supabase
        .from('crm_company_tags')
        .select('company_id, tag_id'),
    ])

    setProfiles((profileRows as ProfileMini[] | null) ?? [])
    setAllTags((tagRows as TagRow[] | null) ?? [])

    const profileMap = new Map<string, string | null>()
    for (const p of (profileRows ?? []) as ProfileMini[]) {
      profileMap.set(p.id, p.display_name)
    }

    // crm_company lookup by normalized name
    const crmByName = new Map<
      string,
      {
        id: string
        industry: string | null
        region: string | null
        assigned_to: string | null
      }
    >()
    for (const row of (crmCompanyRows ?? []) as Array<{
      id: string
      name: string
      industry: string | null
      region: string | null
      assigned_to: string | null
    }>) {
      const key = (row.name ?? '').trim().toLowerCase()
      if (!key) continue
      if (!crmByName.has(key)) {
        crmByName.set(key, {
          id: row.id,
          industry: row.industry,
          region: row.region,
          assigned_to: row.assigned_to,
        })
      }
    }

    const tagsByCompany = new Map<string, string[]>()
    for (const row of (companyTagRows ?? []) as Array<{
      company_id: string
      tag_id: string
    }>) {
      const list = tagsByCompany.get(row.company_id) ?? []
      list.push(row.tag_id)
      tagsByCompany.set(row.company_id, list)
    }

    // Aggregate estimates per customer: accepted count + revenue + latest.
    const acceptedByCustomer = new Map<
      string,
      { count: number; revenue: number; lastDate: string | null }
    >()
    const lastEstimateDate = new Map<string, string>()
    for (const row of (estimateRows ?? []) as Array<{
      company_id: string | null
      total: number | null
      status: string | null
      created_at: string
    }>) {
      if (!row.company_id) continue
      const existing = lastEstimateDate.get(row.company_id)
      if (!existing || row.created_at > existing) {
        lastEstimateDate.set(row.company_id, row.created_at)
      }
      if ((row.status ?? '').toLowerCase() === 'accepted') {
        const cur =
          acceptedByCustomer.get(row.company_id) ?? {
            count: 0,
            revenue: 0,
            lastDate: null as string | null,
          }
        cur.count += 1
        cur.revenue += Number(row.total ?? 0)
        if (!cur.lastDate || row.created_at > cur.lastDate) {
          cur.lastDate = row.created_at
        }
        acceptedByCustomer.set(row.company_id, cur)
      }
    }

    // Aggregate completed estimating_projects per customer
    const completedEstProjByCustomer = new Map<
      string,
      { count: number; lastDate: string | null }
    >()
    for (const row of (estimatingProjectRows ?? []) as Array<{
      company_id: string
      status: string
      created_at: string
      updated_at: string | null
    }>) {
      if ((row.status ?? '').toLowerCase() !== 'completed') continue
      const when = row.updated_at ?? row.created_at
      const cur =
        completedEstProjByCustomer.get(row.company_id) ?? {
          count: 0,
          lastDate: null as string | null,
        }
      cur.count += 1
      if (!cur.lastDate || when > cur.lastDate) cur.lastDate = when
      completedEstProjByCustomer.set(row.company_id, cur)
    }

    // Aggregate completed projects by client_name
    const completedProjByName = new Map<
      string,
      { count: number; lastDate: string | null }
    >()
    for (const row of (projectRows ?? []) as Array<{
      client_name: string | null
      status: string
      created_at: string
    }>) {
      if ((row.status ?? '').toLowerCase() !== 'completed') continue
      const key = (row.client_name ?? '').trim().toLowerCase()
      if (!key) continue
      const cur =
        completedProjByName.get(key) ?? {
          count: 0,
          lastDate: null as string | null,
        }
      cur.count += 1
      if (!cur.lastDate || row.created_at > cur.lastDate) {
        cur.lastDate = row.created_at
      }
      completedProjByName.set(key, cur)
    }

    // Aggregate invoices per customer (additional revenue signal)
    const invoiceByCustomer = new Map<
      string,
      { revenue: number; lastDate: string | null }
    >()
    for (const row of (invoiceRows ?? []) as Array<{
      company_id: string | null
      total: number | null
      issued_date: string | null
    }>) {
      if (!row.company_id) continue
      const cur =
        invoiceByCustomer.get(row.company_id) ?? {
          revenue: 0,
          lastDate: null as string | null,
        }
      cur.revenue += Number(row.total ?? 0)
      if (row.issued_date && (!cur.lastDate || row.issued_date > cur.lastDate)) {
        cur.lastDate = row.issued_date
      }
      invoiceByCustomer.set(row.company_id, cur)
    }

    // Latest call_date by customer (via crm_company name match)
    const lastCallByCompany = new Map<string, string>()
    const companyIds = Array.from(
      new Set((crmCompanyRows ?? []).map((c: { id: string }) => c.id))
    )
    if (companyIds.length > 0) {
      const { data: callRows } = await supabase
        .from('crm_call_log')
        .select('company_id, call_date')
        .in('company_id', companyIds)
        .order('call_date', { ascending: false })
      for (const row of (callRows ?? []) as Array<{
        company_id: string
        call_date: string
      }>) {
        if (!lastCallByCompany.has(row.company_id)) {
          lastCallByCompany.set(row.company_id, row.call_date)
        }
      }
    }

    const rows: CustomerRow[] = []
    for (const c of (customerRows ?? []) as Array<{
      id: string
      name: string
      company: string | null
      email: string | null
      phone: string | null
      city: string | null
      state: string | null
      created_at: string
    }>) {
      const nameKey = (c.name ?? '').trim().toLowerCase()
      const crm = nameKey ? crmByName.get(nameKey) : undefined

      const accepted = acceptedByCustomer.get(c.id)
      const estProj = completedEstProjByCustomer.get(c.id)
      const projByName = nameKey ? completedProjByName.get(nameKey) : undefined

      const hasAcceptedEstimate = (accepted?.count ?? 0) > 0
      const hasCompletedJob =
        (estProj?.count ?? 0) > 0 || (projByName?.count ?? 0) > 0
      if (!hasAcceptedEstimate && !hasCompletedJob) continue

      const jobsCompleted = (estProj?.count ?? 0) + (projByName?.count ?? 0)

      const invoices = invoiceByCustomer.get(c.id)
      const totalRevenue =
        (accepted?.revenue ?? 0) + (invoices?.revenue ?? 0)

      // Last contact: max of call_date, last estimate date, customer created_at
      const touches: string[] = []
      if (crm) {
        const call = lastCallByCompany.get(crm.id)
        if (call) touches.push(call)
      }
      const estDate = lastEstimateDate.get(c.id)
      if (estDate) touches.push(estDate)
      if (c.created_at) touches.push(c.created_at)
      const lastContact = touches.length
        ? touches.reduce((a, b) => (a > b ? a : b))
        : null

      // Last job: max of estimating_projects.completed and projects.completed and invoice date
      const jobTouches: string[] = []
      if (estProj?.lastDate) jobTouches.push(estProj.lastDate)
      if (projByName?.lastDate) jobTouches.push(projByName.lastDate)
      if (invoices?.lastDate) jobTouches.push(invoices.lastDate)
      const lastJob = jobTouches.length
        ? jobTouches.reduce((a, b) => (a > b ? a : b))
        : null

      const assignedId = crm?.assigned_to ?? null
      rows.push({
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state,
        created_at: c.created_at,
        crm_company_id: crm?.id ?? null,
        industry: crm?.industry ?? null,
        region: crm?.region ?? null,
        assigned_to: assignedId,
        assigned_name: assignedId ? profileMap.get(assignedId) ?? null : null,
        tag_ids: crm ? tagsByCompany.get(crm.id) ?? [] : [],
        jobs_completed: jobsCompleted,
        total_revenue: totalRevenue,
        last_contact: lastContact,
        last_job: lastJob,
      })
    }

    setCustomers(rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  const filterOptions = useMemo(() => {
    const industries = new Set<string>()
    const regions = new Set<string>()
    const assigned = new Set<string>()
    const tagIds = new Set<string>()
    for (const c of customers) {
      if (c.industry) industries.add(c.industry)
      if (c.region) regions.add(c.region)
      if (c.assigned_to) assigned.add(c.assigned_to)
      for (const t of c.tag_ids) tagIds.add(t)
    }
    return {
      industries: Array.from(industries).sort(),
      regions: Array.from(regions).sort(),
      assigned: Array.from(assigned),
      tags: Array.from(tagIds),
    }
  }, [customers])

  const staleCount = useMemo(() => {
    const cutoff = currentMs() - 60 * DAY_MS
    let n = 0
    for (const c of customers) {
      if (!c.last_contact) {
        n += 1
        continue
      }
      const t = new Date(c.last_contact).getTime()
      if (!Number.isNaN(t) && t < cutoff) n += 1
    }
    return n
  }, [customers])

  const filteredSorted = useMemo(() => {
    const now = currentMs()
    const lastContactCutoff: number | null =
      filterLastContact === '30'
        ? now - 30 * DAY_MS
        : filterLastContact === '60'
        ? now - 60 * DAY_MS
        : filterLastContact === '90'
        ? now - 90 * DAY_MS
        : null

    const arr = customers.filter((c) => {
      if (filterIndustry.size > 0 && !(c.industry && filterIndustry.has(c.industry))) {
        return false
      }
      if (filterRegion.size > 0 && !(c.region && filterRegion.has(c.region))) {
        return false
      }
      if (
        filterAssigned.size > 0 &&
        !(c.assigned_to && filterAssigned.has(c.assigned_to))
      ) {
        return false
      }
      if (
        filterTags.size > 0 &&
        !c.tag_ids.some((t) => filterTags.has(t))
      ) {
        return false
      }

      if (filterLastContact === '90plus') {
        const ninety = now - 90 * DAY_MS
        const t = c.last_contact ? new Date(c.last_contact).getTime() : 0
        if (Number.isNaN(t) || t >= ninety) return false
      } else if (lastContactCutoff !== null) {
        const t = c.last_contact ? new Date(c.last_contact).getTime() : 0
        if (Number.isNaN(t) || t < lastContactCutoff) return false
      }

      if (search) {
        const blob = [
          c.name,
          c.company,
          c.email,
          c.phone,
          c.industry,
          c.city,
          c.state,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!blob.includes(search)) return false
      }
      return true
    })

    const cmpStr = (a: string | null, b: string | null) => {
      const av = (a ?? '').toLowerCase()
      const bv = (b ?? '').toLowerCase()
      if (av < bv) return -1
      if (av > bv) return 1
      return 0
    }
    const cmpNum = (a: number, b: number) => a - b
    const cmpDate = (a: string | null, b: string | null) => {
      const av = a ? new Date(a).getTime() : 0
      const bv = b ? new Date(b).getTime() : 0
      return av - bv
    }

    arr.sort((a, b) => {
      let r = 0
      switch (sortField) {
        case 'name':
          r = cmpStr(a.name, b.name)
          break
        case 'industry':
          r = cmpStr(a.industry, b.industry)
          break
        case 'location':
          r = cmpStr(
            [a.city, a.state].filter(Boolean).join(', '),
            [b.city, b.state].filter(Boolean).join(', ')
          )
          break
        case 'jobs_completed':
          r = cmpNum(a.jobs_completed, b.jobs_completed)
          break
        case 'total_revenue':
          r = cmpNum(a.total_revenue, b.total_revenue)
          break
        case 'last_contact':
          r = cmpDate(a.last_contact, b.last_contact)
          break
        case 'last_job':
          r = cmpDate(a.last_job, b.last_job)
          break
        case 'assigned_name':
          r = cmpStr(a.assigned_name, b.assigned_name)
          break
      }
      return sortAsc ? r : -r
    })
    return arr
  }, [
    customers,
    search,
    filterIndustry,
    filterRegion,
    filterAssigned,
    filterTags,
    filterLastContact,
    sortField,
    sortAsc,
  ])

  const totalCount = filteredSorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, totalCount)
  const pageRows = filteredSorted.slice(pageStart, pageEnd)

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExport() {
    if (filteredSorted.length === 0) return
    const header = [
      'Customer',
      'Company',
      'Email',
      'Phone',
      'Industry',
      'City',
      'State',
      'Jobs completed',
      'Total revenue',
      'Last contact',
      'Last job',
      'Assigned',
    ]
    const rows: (string | number | null | undefined)[][] = [
      header,
      ...filteredSorted.map((c) => [
        c.name,
        c.company ?? '',
        c.email ?? '',
        c.phone ?? '',
        c.industry ?? '',
        c.city ?? '',
        c.state ?? '',
        c.jobs_completed,
        c.total_revenue.toFixed(2),
        c.last_contact ?? '',
        c.last_job ?? '',
        c.assigned_name ?? '',
      ]),
    ]
    const csv = toCsv(rows)
    downloadCsv(
      `existing-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    )
    showToast(`Exported ${filteredSorted.length} customers`)
  }

  function openDetail(c: CustomerRow) {
    if (c.crm_company_id) {
      router.push(`/sales/crm/${c.crm_company_id}`)
      return
    }
    setDetailCustomer(c)
  }

  function formatDate(iso: string | null): { text: string; stale: boolean } {
    if (!iso) return { text: '—', stale: false }
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return { text: '—', stale: false }
    const ageMs = currentMs() - d.getTime()
    const stale = ageMs > 60 * DAY_MS
    const text = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return { text, stale }
  }

  function formatAssigned(full: string | null): string {
    if (!full) return '—'
    const parts = full.trim().split(/\s+/)
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1][0]}.`
  }

  function formatCurrency(n: number): string {
    return `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const headerCell = (label: string, field: SortField | null, extraClass = '') => (
    <th
      onClick={field ? () => toggleSort(field) : undefined}
      className={`text-[11px] font-normal text-gray-400 text-left ${
        field ? 'cursor-pointer select-none hover:text-gray-600' : ''
      } ${extraClass}`}
      style={{ paddingTop: 14, paddingBottom: 14 }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {field && sortField === field &&
          (sortAsc ? (
            <ArrowUpIcon className="w-3 h-3" />
          ) : (
            <ArrowDownIcon className="w-3 h-3" />
          ))}
      </span>
    </th>
  )

  const ViewToggle = (
    <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs">
      <button
        onClick={() => setViewMode('new')}
        className={`px-3 py-1 rounded-full font-medium transition-colors ${
          viewMode === 'new'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Prospects
      </button>
      <button
        onClick={() => setViewMode('existing')}
        className={`px-3 py-1 rounded-full font-medium transition-colors ${
          viewMode === 'existing'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Customers
      </button>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">CRM</h1>
          </div>
          {ViewToggle}
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
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleExport}
            disabled={filteredSorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => onImportCsv?.()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <UploadIcon className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => onNewCompany?.()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New company
          </button>
        </div>
      </div>

      {/* ── Warning banner (wired in a later pass) ── */}
      {staleCount > 0 && (
        <div className="mx-4 sm:mx-6 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs">
          <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span>
            {staleCount} customer{staleCount === 1 ? '' : 's'} not contacted in 60+ days
          </span>
          <button
            onClick={() => setFilterLastContact('90plus')}
            className="ml-auto text-amber-700 underline hover:text-amber-900"
          >
            Show only these
          </button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filter:</span>

        <FilterChip
          label="Industry"
          openKey="industry"
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
          selected={filterIndustry}
          setSelected={setFilterIndustry}
          options={filterOptions.industries.map((v) => ({ value: v, label: v }))}
        />

        <FilterChip
          label="Region"
          openKey="region"
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
          selected={filterRegion}
          setSelected={setFilterRegion}
          options={filterOptions.regions.map((v) => ({ value: v, label: v }))}
        />

        <FilterChip
          label="Assigned to"
          openKey="assigned"
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
          selected={filterAssigned}
          setSelected={setFilterAssigned}
          options={filterOptions.assigned.map((id) => ({
            value: id,
            label: profiles.find((p) => p.id === id)?.display_name ?? id.slice(0, 8),
          }))}
        />

        <FilterChip
          label="Tags"
          openKey="tags"
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
          selected={filterTags}
          setSelected={setFilterTags}
          options={filterOptions.tags.map((id) => ({
            value: id,
            label: allTags.find((t) => t.id === id)?.name ?? id.slice(0, 8),
          }))}
        />

        {/* Last contact — single-select */}
        <div className="relative">
          <button
            onClick={() =>
              setOpenFilter((f) => (f === 'last_contact' ? null : 'last_contact'))
            }
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
              filterLastContact !== 'all'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            style={{ borderRadius: 20 }}
          >
            Last contact
            {filterLastContact !== 'all' && (
              <span className="text-[10px] text-blue-500">
                (
                {filterLastContact === '30'
                  ? '<30d'
                  : filterLastContact === '60'
                  ? '<60d'
                  : filterLastContact === '90'
                  ? '<90d'
                  : '>90d'}
                )
              </span>
            )}
          </button>
          {openFilter === 'last_contact' && (
            <div className="absolute z-20 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
              {(
                [
                  { v: 'all', l: 'All' },
                  { v: '30', l: '< 30 days' },
                  { v: '60', l: '< 60 days' },
                  { v: '90', l: '< 90 days' },
                  { v: '90plus', l: '> 90 days' },
                ] as { v: LastContactFilter; l: string }[]
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => {
                    setFilterLastContact(o.v)
                    setOpenFilter(null)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                    filterLastContact === o.v
                      ? 'text-blue-700 font-medium'
                      : 'text-gray-700'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}
        </div>

        {(filterIndustry.size > 0 ||
          filterRegion.size > 0 ||
          filterAssigned.size > 0 ||
          filterTags.size > 0 ||
          filterLastContact !== 'all') && (
          <button
            onClick={() => {
              setFilterIndustry(new Set())
              setFilterRegion(new Set())
              setFilterAssigned(new Set())
              setFilterTags(new Set())
              setFilterLastContact('all')
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline ml-1"
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
          <p className="text-sm text-gray-500 mb-1">
            No customers yet.
          </p>
          <p className="text-xs text-gray-400">
            Customers appear here once they have a completed job or accepted
            estimate.
          </p>
        </div>
      ) : (
        <div className="mx-4 sm:mx-6 mb-4 bg-white dark:bg-[#242424] rounded-lg border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200" style={{ borderBottomWidth: '0.5px' }}>
                <th className="pl-7 pr-0" style={{ paddingTop: 10, paddingBottom: 10 }}></th>
                {headerCell('Customer', 'name', 'pl-2 pr-2')}
                {headerCell('Industry', 'industry', 'px-2')}
                {headerCell('Location', 'location', 'px-2')}
                {headerCell('Jobs', 'jobs_completed', 'px-2 text-center')}
                {headerCell('Total revenue', 'total_revenue', 'px-2')}
                {headerCell('Last contact', 'last_contact', 'px-2')}
                {headerCell('Last job', 'last_job', 'px-2')}
                {headerCell('Assigned', 'assigned_name', 'pl-2 pr-7')}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const last = formatDate(c.last_contact)
                const lastJob = formatDate(c.last_job)
                const cityState = [c.city, c.state].filter(Boolean).join(', ')
                return (
                  <tr
                    key={c.id}
                    onClick={() => openDetail(c)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    style={{ borderBottomWidth: '0.5px' }}
                  >
                    <td
                      className="pl-7 pr-0 align-middle"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleRowSelected(c.id)}
                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td
                      className="pl-2 pr-2"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {c.email || c.phone || c.company || '—'}
                      </div>
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
                      {cityState || '—'}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600 text-center"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.jobs_completed}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {c.total_revenue > 0 ? formatCurrency(c.total_revenue) : '—'}
                    </td>
                    <td
                      className={`px-2 text-sm ${
                        last.stale ? 'text-amber-600' : 'text-gray-600'
                      }`}
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {last.text}
                    </td>
                    <td
                      className="px-2 text-sm text-gray-600"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {lastJob.text}
                    </td>
                    <td
                      className="pl-2 pr-7 text-sm text-gray-600 truncate"
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      {formatAssigned(c.assigned_name)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Pagination footer ── */}
          <div
            className="px-7 py-4 flex items-center justify-between bg-gray-50 dark:bg-[#2a2a2a] border-t border-gray-200 dark:border-[#333]"
            style={{ borderTopWidth: '0.5px' }}
          >
            <p className="text-xs text-gray-400">
              Showing {pageStart + 1}-{pageEnd} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              {safePage > 1 && (
                <button
                  onClick={() => setPage(safePage - 1)}
                  className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                >
                  ← Prev
                </button>
              )}
              <span className="px-2 text-xs text-gray-500">
                Page {safePage} of {totalPages}
              </span>
              {safePage < totalPages && (
                <button
                  onClick={() => setPage(safePage + 1)}
                  className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Customer detail modal (unlinked) ── */}
      {detailCustomer && (
        <CustomerDetailModal
          customer={{
            id: detailCustomer.id,
            name: detailCustomer.name,
            company: detailCustomer.company,
            email: detailCustomer.email,
            phone: detailCustomer.phone,
            city: detailCustomer.city,
            state: detailCustomer.state,
          }}
          onClose={() => setDetailCustomer(null)}
          onToast={showToast}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
            {toast}
          </div>
        </Portal>
      )}
    </div>
  )
}

interface FilterChipProps {
  label: string
  openKey: string
  openFilter: string | null
  setOpenFilter: (v: string | null) => void
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  options: { value: string; label: string }[]
}

function FilterChip({
  label,
  openKey,
  openFilter,
  setOpenFilter,
  selected,
  setSelected,
  options,
}: FilterChipProps) {
  const active = selected.size > 0
  function toggle(v: string) {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setSelected(next)
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpenFilter(openFilter === openKey ? null : openKey)}
        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
          active
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
        style={{ borderRadius: 20 }}
      >
        {label}
        {active && <span className="text-[10px] text-blue-500">({selected.size})</span>}
      </button>
      {openFilter === openKey && (
        <div className="absolute z-20 mt-1 w-48 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No options</p>
          ) : (
            options.map((opt) => {
              const checked = selected.has(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    className="w-3 h-3 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className="text-gray-700 truncate">{opt.label}</span>
                </label>
              )
            })
          )}
          {selected.size > 0 && (
            <button
              onClick={() => {
                setSelected(new Set())
                setOpenFilter(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
