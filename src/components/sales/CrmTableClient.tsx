'use client'

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  UploadIcon,
  DownloadIcon,
  MergeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Trash2Icon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  Building2Icon,
} from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'
import Portal from '@/components/ui/Portal'
import NewCompanyModal from './NewCompanyModal'
import ImportCsvModal from './ImportCsvModal'
import MergeCompaniesModal from './MergeCompaniesModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ExistingCustomersView from './ExistingCustomersView'
import { toCsv, downloadCsv } from '@/lib/csv'

type CrmViewMode = 'new' | 'existing'

type CompanyStatus = 'prospect' | 'contacted' | 'hot_lead' | 'lost' | 'blacklisted' | 'active' | 'inactive'
type CompanyPriority = 'high' | 'medium' | 'low'

interface ContactRow {
  id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

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
  contacts: ContactRow[]
  last_activity: string | null
  last_note: string | null
  tag_ids: string[]
  created_at: string
  updated_at: string
  archived: boolean
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
  active: 'Active',
  inactive: 'Inactive',
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
  active: 'text-green-600',
  inactive: 'text-gray-400',
}

const PRIORITY_TEXT_COLOR: Record<CompanyPriority, string> = {
  high: 'text-amber-600',
  medium: 'text-gray-700',
  low: 'text-gray-400',
}

const PAGE_SIZE = 50

const FILTER_CONFIG: { field: FilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'region', label: 'Region' },
  { field: 'industry', label: 'Industry' },
  { field: 'priority', label: 'Priority' },
  { field: 'assigned_to', label: 'Assigned to' },
  { field: 'tags', label: 'Tags' },
]

// Sub-fields grouped under the Region filter chip
const REGION_GROUP_FIELDS: { field: FilterField; label: string }[] = [
  { field: 'region', label: 'Region' },
  { field: 'zone', label: 'Zone' },
  { field: 'state', label: 'State' },
  { field: 'county', label: 'County' },
  { field: 'city', label: 'City' },
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

  const [viewMode, setViewMode] = useState<CrmViewMode>('new')

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMini[]>([])
  const [allTags, setAllTags] = useState<TagRow[]>([])

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

  const [includeArchived, setIncludeArchived] = useState(false)
  const { role } = useUserRole()
  const isAdmin = role === 'admin'

  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<{ id: string; name: string; archive: boolean } | null>(null)
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function updateCompanyField<K extends keyof CompanyRow>(
    id: string,
    field: K,
    value: CompanyRow[K]
  ) {
    const prev = companies.find((c) => c.id === id)
    if (!prev || prev[field] === value) return
    // Optimistic update
    setCompanies((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c
        const next = { ...c, [field]: value } as CompanyRow
        if (field === 'assigned_to') {
          const newAssigned = value as string | null
          next.assigned_name = newAssigned
            ? profiles.find((p) => p.id === newAssigned)?.display_name ?? null
            : null
        }
        return next
      })
    )
    const updates: Record<string, unknown> = { [field]: value }
    const { error } = await supabase.from('companies').update(updates).eq('id', id)
    if (error) {
      showToast(`Save failed: ${error.message}`)
      // revert
      setCompanies((cs) =>
        cs.map((c) => (c.id === id ? { ...c, [field]: prev[field] } : c))
      )
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('companies').delete().in('id', ids)
    setDeleting(false)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      return
    }
    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    showToast(`Deleted ${ids.length} ${ids.length === 1 ? 'company' : 'companies'}`)
    fetchAll()
  }

  async function handleArchiveToggle(id: string, name: string, archive: boolean) {
    if (!isAdmin) {
      showToast('Only admins can archive or restore companies. Contact your admin.')
      return
    }
    setShowArchiveConfirm({ id, name, archive })
  }

  async function confirmArchive() {
    if (!showArchiveConfirm) return
    const { id, archive } = showArchiveConfirm
    setArchivingId(id)
    const updates: Record<string, unknown> = {
      archived: archive,
      archived_at: archive ? new Date().toISOString() : null,
      archived_by: archive ? userId : null,
    }
    const { error } = await supabase.from('companies').update(updates).eq('id', id)
    setArchivingId(null)
    setShowArchiveConfirm(null)
    if (error) {
      showToast(`${archive ? 'Archive' : 'Restore'} failed: ${error.message}`)
      return
    }
    showToast(`Company ${archive ? 'archived' : 'restored'}`)
    fetchAll()
  }

  async function handleExport() {
    const rowsToExport = filteredSorted
    if (rowsToExport.length === 0) return
    const ids = rowsToExport.map((r) => r.id)

    // Pull primary contact + address for each company in one round-trip.
    const [{ data: contactRows }, { data: addressRows }, { data: companyExtras }] =
      await Promise.all([
        supabase
          .from('contacts')
          .select('company_id, first_name, last_name, email, phone, is_primary')
          .in('company_id', ids),
        supabase
          .from('crm_company_addresses')
          .select('company_id, address, city, state, is_primary')
          .in('company_id', ids),
        supabase
          .from('companies')
          .select('id, lead_source, deal_value')
          .in('id', ids),
      ])

    const primaryContactByCompany = new Map<
      string,
      { name: string; email: string | null; phone: string | null }
    >()
    for (const row of (contactRows ?? []) as Array<{
      company_id: string
      first_name: string
      last_name: string
      email: string | null
      phone: string | null
      is_primary: boolean
    }>) {
      const existing = primaryContactByCompany.get(row.company_id)
      if (!existing || (row.is_primary && !existing)) {
        // If no existing, assign. If one exists but this one is primary and it isn't, prefer.
      }
      if (!existing || row.is_primary) {
        primaryContactByCompany.set(row.company_id, {
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          phone: row.phone,
        })
      }
    }

    const primaryAddressByCompany = new Map<string, string>()
    for (const row of (addressRows ?? []) as Array<{
      company_id: string
      address: string
      city: string | null
      state: string | null
      is_primary: boolean
    }>) {
      const current = primaryAddressByCompany.get(row.company_id)
      if (!current || row.is_primary) {
        primaryAddressByCompany.set(
          row.company_id,
          [row.address, row.city, row.state].filter(Boolean).join(', ')
        )
      }
    }

    const extrasMap = new Map<
      string,
      { lead_source: string | null; deal_value: number | null }
    >()
    for (const row of (companyExtras ?? []) as Array<{
      id: string
      lead_source: string | null
      deal_value: number | null
    }>) {
      extrasMap.set(row.id, { lead_source: row.lead_source, deal_value: row.deal_value })
    }

    const header = [
      'Company name',
      'Industry',
      'Zone',
      'Region',
      'State',
      'County',
      'City',
      'Status',
      'Priority',
      'Lead source',
      'Deal value',
      'Assigned to',
      'Contact count',
      'Last activity',
      'Primary contact name',
      'Primary contact email',
      'Primary contact phone',
      'Primary address',
    ]
    const csvRows: (string | number | null)[][] = [header]
    for (const r of rowsToExport) {
      const c = primaryContactByCompany.get(r.id)
      const addr = primaryAddressByCompany.get(r.id) ?? ''
      const extras = extrasMap.get(r.id)
      csvRows.push([
        r.name,
        r.industry,
        r.zone,
        r.region,
        r.state,
        r.county,
        r.city,
        r.status,
        r.priority,
        extras?.lead_source ?? '',
        extras?.deal_value ?? '',
        r.assigned_name ?? '',
        r.contact_count,
        r.last_activity ?? '',
        c?.name ?? '',
        c?.email ?? '',
        c?.phone ?? '',
        addr,
      ])
    }
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`crm-export-${today}.csv`, toCsv(csvRows))
    showToast(`Exported ${rowsToExport.length} companies`)
  }

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

    // Companies — fetch all (client-side filter/sort/paginate keeps aggregate
    // sorting correct across pages; dataset is expected to stay in the low
    // thousands for Phase 1B).
    let companyQuery = supabase
      .from('companies')
      .select(
        'id, name, industry, zone, region, state, county, city, status, priority, assigned_to, created_at, updated_at, archived'
      )
    if (!includeArchived) companyQuery = companyQuery.eq('archived', false)
    const { data: companyData } = await companyQuery
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
      archived: boolean
    }>
    const companyIds = companyRows.map((c) => c.id)

    // Contacts per company (full details for expandable sub-rows)
    const contactsByCompany = new Map<string, ContactRow[]>()
    const contactCounts = new Map<string, number>()
    if (companyIds.length > 0) {
      const { data: contactsForCount } = await supabase
        .from('contacts')
        .select('id, company_id, first_name, last_name, job_title, email, phone, is_primary')
        .in('company_id', companyIds)
        .order('is_primary', { ascending: false })
        .order('last_name', { ascending: true })
      for (const row of (contactsForCount ?? []) as Array<{
        id: string
        company_id: string
        first_name: string
        last_name: string
        job_title: string | null
        email: string | null
        phone: string | null
        is_primary: boolean
      }>) {
        contactCounts.set(row.company_id, (contactCounts.get(row.company_id) ?? 0) + 1)
        const list = contactsByCompany.get(row.company_id) ?? []
        list.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          job_title: row.job_title,
          email: row.email,
          phone: row.phone,
          is_primary: row.is_primary,
        })
        contactsByCompany.set(row.company_id, list)
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
    for (const [cid, list] of contactsByCompany) {
      contactNameBlob.set(
        cid,
        list
          .map((k) => `${k.first_name} ${k.last_name}`)
          .join(' ')
          .toLowerCase()
      )
    }

    const merged: CompanyRow[] = companyRows.map((c) => ({
      ...c,
      assigned_name: c.assigned_to ? profileMap.get(c.assigned_to) ?? null : null,
      contact_count: contactCounts.get(c.id) ?? 0,
      contacts: contactsByCompany.get(c.id) ?? [],
      last_activity: lastActivity.get(c.id) ?? null,
      last_note: lastNote.get(c.id) ?? null,
      tag_ids: tagsByCompany.get(c.id) ?? [],
    }))
    // attach the search blob under a non-enumerable key via Map in state
    searchBlobRef.current = contactNameBlob

    setCompanies(merged)
    setLoading(false)
  }, [supabase, includeArchived])

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

  if (viewMode === 'existing') {
    return (
      <ExistingCustomersView
        userId={userId}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* ── Header ── */}
      <div className="px-7 pt-8 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <Link
            href="/sales"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Sales
          </Link>
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2Icon className="w-5 h-5 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">CRM</h1>
          </div>
          <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('new')}
              className="px-3 py-1 rounded-full font-medium transition-colors bg-white text-gray-900 shadow-sm"
            >
              New customers
            </button>
            <button
              onClick={() => setViewMode('existing')}
              className="px-3 py-1 rounded-full font-medium transition-colors text-gray-500 hover:text-gray-700"
            >
              Existing customers
            </button>
          </div>
          </div>
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
          {selectedIds.size >= 1 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2Icon className="w-4 h-4" />
              Delete selected
            </button>
          )}
          {selectedIds.size === 2 && (
            <button
              onClick={() => setShowMergeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <MergeIcon className="w-4 h-4" />
              Merge selected
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={filteredSorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <UploadIcon className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
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
          const isRegionGroup = field === 'region'
          const groupFields = isRegionGroup ? REGION_GROUP_FIELDS : [{ field, label }]
          const activeCount = groupFields.reduce((n, g) => n + filters[g.field].size, 0)
          const selected = filters[field]
          const options = filterOptions[field]
          const active = activeCount > 0
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
                {active && <span className="text-[10px] text-blue-500">({activeCount})</span>}
                {active ? (
                  <XIcon
                    className="w-3 h-3 ml-0.5 hover:text-blue-900"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isRegionGroup) {
                        for (const g of groupFields) clearFilter(g.field)
                      } else {
                        clearFilter(field)
                      }
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
                    className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[220px] max-h-[380px] overflow-y-auto"
                  >
                    {isRegionGroup ? (
                      groupFields.map((g, gi) => {
                        const gOptions = filterOptions[g.field]
                        const gSelected = filters[g.field]
                        return (
                          <div key={g.field} className={gi > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
                            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                              {g.label}
                            </div>
                            {gOptions.length === 0 ? (
                              <div className="px-3 py-1.5 text-xs text-gray-300">No values</div>
                            ) : (
                              gOptions.map((opt) => {
                                const checked = gSelected.has(opt.value)
                                return (
                                  <label
                                    key={opt.value}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleFilterValue(g.field, opt.value)}
                                      className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                                    />
                                    <span className="truncate">{opt.label}</span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        )
                      })
                    ) : options.length === 0 ? (
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
                              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
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
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
            />
            Include archived
          </label>
        )}
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
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
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
              <col style={{ width: '3%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200" style={{ borderBottomWidth: '0.5px' }}>
                <th className="pl-5 pr-0" style={{ paddingTop: 10, paddingBottom: 10 }}></th>
                <th className="px-0" style={{ paddingTop: 10, paddingBottom: 10 }}></th>
                {headerCell('Company', 'name', 'pl-2 pr-2')}
                {headerCell('Industry', 'industry', 'px-2')}
                {headerCell('Zone', 'zone', 'px-2')}
                {headerCell('Location', 'location', 'px-2')}
                {headerCell('Status', 'status', 'px-2')}
                {headerCell('Priority', 'priority', 'px-2')}
                {headerCell('Contacts', 'contact_count', 'px-2')}
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
                const hasContacts = c.contacts.length > 0
                const expanded = expandedIds.has(c.id)
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => router.push(`/sales/crm/${c.id}`)}
                      className={`group border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        blacklisted || c.archived ? 'opacity-40' : ''
                      }`}
                      style={{ borderBottomWidth: '0.5px' }}
                    >
                      <td
                        className="pl-5 pr-0 align-middle"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {hasContacts ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(c.id)}
                            className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-amber-600 rounded hover:bg-amber-50"
                            aria-label={expanded ? 'Collapse contacts' : 'Expand contacts'}
                          >
                            {expanded ? (
                              <ChevronDownIcon className="w-4 h-4" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td
                        className="px-0 align-middle"
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
                        className="pl-2 pr-2 text-sm font-medium text-gray-900"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        <span className="flex items-center gap-1.5 truncate" title={c.name}>
                          {c.name}
                          {c.archived && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-500 rounded">
                              Archived
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        className="px-2 text-sm text-gray-600"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        <span className="block truncate">{c.industry || '—'}</span>
                      </td>
                      <td
                        className="px-2 text-sm text-gray-600"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        <span className="block truncate">{c.zone || '—'}</span>
                      </td>
                      <td
                        className="px-2 text-sm text-gray-600"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        <span className="block truncate">{cityState || '—'}</span>
                      </td>
                      <td
                        className={`px-2 text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EditableSelectCell
                          value={c.status}
                          showHoverChevron
                          options={(
                            ['prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted'] as CompanyStatus[]
                          ).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                          displayClassName={`text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                          className={`text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                          onSave={(v) =>
                            updateCompanyField(c.id, 'status', (v ?? 'prospect') as CompanyStatus)
                          }
                        />
                      </td>
                      <td
                        className={`px-2 text-sm ${
                          c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'
                        }`}
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EditableSelectCell
                          value={c.priority}
                          allowEmpty
                          showHoverChevron
                          emptyLabel="—"
                          options={(['high', 'medium', 'low'] as CompanyPriority[]).map((p) => ({
                            value: p,
                            label: PRIORITY_LABELS[p],
                          }))}
                          displayClassName={`text-sm ${
                            c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'
                          }`}
                          className={`text-sm ${
                            c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'
                          }`}
                          onSave={(v) =>
                            updateCompanyField(c.id, 'priority', (v as CompanyPriority | null) ?? null)
                          }
                        />
                      </td>
                      <td
                        className="px-2 text-sm text-gray-600"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {hasContacts ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(c.id)}
                            className="text-sm text-gray-600 hover:text-amber-700 hover:underline cursor-pointer"
                          >
                            {c.contact_count} {c.contact_count === 1 ? 'contact' : 'contacts'}
                          </button>
                        ) : (
                          <span className="text-gray-400">0 contacts</span>
                        )}
                      </td>
                      <td
                        className={`px-2 text-sm ${last.stale ? 'text-amber-600' : 'text-gray-600'}`}
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        {last.text}
                      </td>
                      <td
                        className="px-2 text-sm text-gray-600"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EditableSelectCell
                          value={c.assigned_to}
                          allowEmpty
                          showHoverChevron
                          emptyLabel="—"
                          options={profiles
                            .filter((p) => p.display_name)
                            .map((p) => ({ value: p.id, label: p.display_name ?? '' }))
                            .sort((a, b) => a.label.localeCompare(b.label))}
                          displayLabel={formatAssigned(c.assigned_name)}
                          displayClassName="text-sm text-gray-600"
                          className="text-sm text-gray-600"
                          onSave={(v) => updateCompanyField(c.id, 'assigned_to', v)}
                        />
                      </td>
                      <td
                        className="pl-2 pr-2 text-sm text-gray-500"
                        style={{ paddingTop: 14, paddingBottom: 14 }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate flex-1" title={c.last_note ?? ''}>
                            {c.last_note || '—'}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleArchiveToggle(c.id, c.name, !c.archived)
                              }}
                              disabled={archivingId === c.id}
                              className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-opacity"
                              title={c.archived ? 'Restore company' : 'Archive company'}
                            >
                              {c.archived ? (
                                <ArchiveRestoreIcon className="w-3.5 h-3.5" />
                              ) : (
                                <ArchiveIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded &&
                      c.contacts.map((k) => {
                        const fullName = `${k.first_name} ${k.last_name}`.trim()
                        return (
                          <tr
                            key={`${c.id}-${k.id}`}
                            onClick={() => router.push(`/sales/crm/${c.id}`)}
                            className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                              blacklisted ? 'opacity-40' : ''
                            }`}
                            style={{ borderBottomWidth: '0.5px' }}
                          >
                            <td className="pl-5 pr-0" style={{ paddingTop: 10, paddingBottom: 10 }} />
                            <td className="px-0" style={{ paddingTop: 10, paddingBottom: 10 }} />
                            <td
                              className="pl-2 pr-2 text-sm text-gray-700"
                              style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 40 }}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm text-gray-800 truncate" title={fullName}>
                                  {fullName || '—'}
                                  {k.is_primary && (
                                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0 text-[10px] font-medium text-amber-700 bg-amber-100 rounded">
                                      Primary
                                    </span>
                                  )}
                                </span>
                                {k.job_title && (
                                  <span className="text-xs text-gray-400 truncate" title={k.job_title}>
                                    {k.job_title}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              colSpan={3}
                              className="px-2 text-sm text-gray-600"
                              style={{ paddingTop: 10, paddingBottom: 10 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {k.phone ? (
                                <a
                                  href={`tel:${k.phone}`}
                                  className="text-sm text-gray-700 hover:text-amber-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {k.phone}
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td
                              colSpan={5}
                              className="px-2 text-sm text-gray-600 truncate"
                              style={{ paddingTop: 10, paddingBottom: 10 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {k.email ? (
                                <a
                                  href={`mailto:${k.email}`}
                                  className="text-sm text-gray-700 hover:text-amber-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {k.email}
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td
                              className="pl-2 pr-7"
                              style={{ paddingTop: 10, paddingBottom: 10 }}
                            />
                          </tr>
                        )
                      })}
                  </Fragment>
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

      {/* ── Import CSV modal ── */}
      {showImportModal && (
        <ImportCsvModal
          userId={userId}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false)
            fetchAll()
          }}
        />
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete selected companies"
          message={`Delete ${selectedIds.size} selected ${
            selectedIds.size === 1 ? 'company' : 'companies'
          }? This will also delete all their contacts, call logs, comments, and files. This cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleBulkDelete}
          onCancel={() => (deleting ? null : setShowDeleteConfirm(false))}
        />
      )}

      {/* ── Archive confirmation ── */}
      {showArchiveConfirm && (
        <ConfirmDialog
          title={showArchiveConfirm.archive ? 'Archive company' : 'Restore company'}
          message={
            showArchiveConfirm.archive
              ? `Archive "${showArchiveConfirm.name}"? It will be hidden from the CRM list but not deleted.`
              : `Restore "${showArchiveConfirm.name}"? It will reappear in the CRM list.`
          }
          confirmLabel={showArchiveConfirm.archive ? 'Archive' : 'Restore'}
          variant={showArchiveConfirm.archive ? 'destructive' : 'default'}
          loading={archivingId !== null}
          onConfirm={confirmArchive}
          onCancel={() => (archivingId ? null : setShowArchiveConfirm(null))}
        />
      )}

      {/* ── Merge companies modal ── */}
      {showMergeModal && selectedIds.size === 2 && (
        <MergeCompaniesModal
          companyIdA={[...selectedIds][0]}
          companyIdB={[...selectedIds][1]}
          onClose={() => setShowMergeModal(false)}
          onMerged={() => {
            setShowMergeModal(false)
            setSelectedIds(new Set())
            showToast('Companies merged')
            fetchAll()
          }}
        />
      )}
    </div>
  )
}

// ── Inline-edit helpers ─────────────────────────────────────────────────────
// Shared input chrome: same font-size as cell text, no border, subtle underline
// on focus. Uses `inherit` color so it blends into the cell.
const INLINE_INPUT_CLS =
  'w-full bg-transparent outline-none border-0 border-b border-transparent focus:border-amber-400 px-0 py-0 m-0 text-inherit text-sm font-[inherit]'

interface EditableSelectCellProps {
  value: string | null
  options: { value: string; label: string }[]
  allowEmpty?: boolean
  emptyLabel?: string
  placeholder?: string
  className?: string
  displayClassName?: string
  displayLabel?: string
  showHoverChevron?: boolean
  onSave: (next: string | null) => void
}

function EditableSelectCell({
  value,
  options,
  allowEmpty = false,
  emptyLabel = '—',
  placeholder = '—',
  className = '',
  displayClassName = '',
  displayLabel,
  showHoverChevron = false,
  onSave,
}: EditableSelectCellProps) {
  const [editing, setEditing] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus()
    }
  }, [editing])

  function commit(next: string) {
    setEditing(false)
    const nextVal = next === '' ? null : next
    if (nextVal !== (value ?? null)) onSave(nextVal)
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        defaultValue={value ?? ''}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className={`${INLINE_INPUT_CLS} ${className}`}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }
  const current = options.find((o) => o.value === value)
  const text = displayLabel ?? (current ? current.label : placeholder)
  if (showHoverChevron) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className={`group inline-flex items-center gap-1 w-full cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-amber-50 ${displayClassName}`}
      >
        <span className="truncate">{text}</span>
        <ChevronDownIcon className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </span>
    )
  }
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className={`block w-full cursor-pointer truncate ${displayClassName}`}
    >
      {text}
    </span>
  )
}
