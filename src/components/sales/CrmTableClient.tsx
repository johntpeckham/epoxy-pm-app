'use client'

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
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
  SettingsIcon,
  CopyIcon,
} from 'lucide-react'
import { usePermissions } from '@/lib/usePermissions'
import Portal from '@/components/ui/Portal'
import Tooltip from '@/components/ui/Tooltip'
import NewCompanyModal from './NewCompanyModal'

import MergeCompaniesModal from './MergeCompaniesModal'
import FindDuplicatesModal from './FindDuplicatesModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ExistingCustomersView from './ExistingCustomersView'
import { toCsv, downloadCsv } from '@/lib/csv'
import LocationFilter, {
  applyLocationFilter,
  type LocationFilterValue,
} from '@/components/ui/LocationFilter'
import { BUILT_IN_COLUMNS, DEFAULT_VISIBLE_IDS, getVisibleColumns } from './crmColumns'
import type { CrmColumn, CustomColumn } from './crmColumns'
import CrmColumnPicker from './CrmColumnPicker'
import CrmCustomFieldCell from './CrmCustomFieldCell'
import ColumnSettingsModal from './ColumnSettingsModal'

type CrmViewMode = 'new' | 'existing'

type CompanyStatus = 'prospect' | 'contacted' | 'lead_created' | 'appointment_made' | 'not_very_interested' | 'blacklisted' | 'active' | 'inactive'
type CompanyPriority = 'high' | 'medium' | 'low'

interface ContactPhoneRow {
  phone_number: string
  phone_type: string
}

interface ContactRow {
  id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  phone_numbers: ContactPhoneRow[]
}

interface CompanyRow {
  id: string
  name: string
  industry: string | null
  zone: string | null
  state: string | null
  city: string | null
  address: string | null
  status: CompanyStatus
  priority: CompanyPriority | null
  assigned_to: string | null
  assigned_name: string | null
  lead_source: string | null
  contacts: ContactRow[]
  last_activity: string | null
  tag_ids: string[]
  created_at: string
  updated_at: string
  archived: boolean
  number_of_locations: number | null
  revenue_range: string | null
  employee_range: string | null
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
  | 'state'
  | 'city'
  | 'industry'
  | 'priority'
  | 'assigned_to'
  | 'tags'
  | 'job_title'

const STATUS_LABELS: Record<CompanyStatus, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  lead_created: 'Lead Created',
  appointment_made: 'Appointment Made',
  not_very_interested: 'Not Very Interested',
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 'all'] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
const DEFAULT_PAGE_SIZE: PageSize = 25
const PAGE_SIZE_STORAGE_KEYS = {
  new: 'crm.pageSize.prospects',
  existing: 'crm.pageSize.customers',
} as const

function readStoredPageSize(viewMode: CrmViewMode): PageSize {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  try {
    const raw = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEYS[viewMode])
    if (raw === 'all') return 'all'
    const n = Number(raw)
    if (PAGE_SIZE_OPTIONS.includes(n as PageSize)) return n as PageSize
  } catch {}
  return DEFAULT_PAGE_SIZE
}

const FILTER_CONFIG: { field: FilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'industry', label: 'Industry' },
  { field: 'priority', label: 'Priority' },
  { field: 'assigned_to', label: 'Assigned to' },
  { field: 'tags', label: 'Tags' },
  { field: 'job_title', label: 'Job title' },
]

type SortField =
  | 'name'
  | 'industry'
  | 'zone'
  | 'location'
  | 'status'
  | 'priority'
  | 'last_activity'
  | 'assigned_name'

interface CrmTableClientProps {
  userId: string
}

export default function CrmTableClient({ userId }: CrmTableClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [viewMode, setViewMode] = useState<CrmViewMode>(() => {
    const v = searchParams.get('view')
    return v === 'existing' || v === 'new' ? v : 'new'
  })

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
    state: new Set(),
    city: new Set(),
    industry: new Set(),
    priority: new Set(),
    assigned_to: new Set(),
    tags: new Set(),
    job_title: new Set(),
  })

  const [sortField, setSortField] = useState<SortField>('name')
  const [sortAsc, setSortAsc] = useState<boolean>(true)

  const [radiusCity, setRadiusCity] = useState<string | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null)
  const [radiusCities, setRadiusCities] = useState<Set<string> | null>(null)

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  // Hydrate (and re-hydrate when active tab changes) from localStorage.
  useEffect(() => {
    setPageSize(readStoredPageSize(viewMode))
  }, [viewMode])

  function changePageSize(next: PageSize) {
    setPageSize(next)
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEYS[viewMode], String(next))
    } catch {}
    // Reset to page 1 so we don't land beyond the new total.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const exportItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!exportMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (!exportMenuRef.current) return
      if (!exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportMenuOpen])

  // Focus first enabled item on open.
  useEffect(() => {
    if (!exportMenuOpen) return
    const first = exportItemRefs.current.find((el) => el && !el.disabled)
    first?.focus()
  }, [exportMenuOpen])

  function onExportMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const items = exportItemRefs.current.filter((el): el is HTMLButtonElement => !!el)
    const enabled = items.filter((el) => !el.disabled)
    if (enabled.length === 0) return
    const active = document.activeElement as HTMLButtonElement | null
    const idx = enabled.indexOf(active as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = enabled[(idx + 1 + enabled.length) % enabled.length] ?? enabled[0]
      next.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = enabled[(idx - 1 + enabled.length) % enabled.length] ?? enabled[enabled.length - 1]
      prev.focus()
    }
  }

  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const [viewArchived, setViewArchived] = useState(false)
  const { canEdit } = usePermissions()
  // Archive/restore actions were previously admin-only. Now driven by edit
  // access on CRM; admin still gets it via the hook shortcut.
  const canArchive = canEdit('crm')

  const [showNewModal, setShowNewModal] = useState(false)

  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showFindDuplicates, setShowFindDuplicates] = useState(false)
  const [dupMergeIds, setDupMergeIds] = useState<[string, string] | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<{ id: string; name: string; archive: boolean } | null>(null)
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Custom columns & column prefs ──────────────────────────────────
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [fieldValues, setFieldValues] = useState<Map<string, Map<string, string>>>(new Map())
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_IDS)
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const allColumns: CrmColumn[] = useMemo(
    () => [...BUILT_IN_COLUMNS, ...customColumns],
    [customColumns]
  )

  const orderedColumns: CrmColumn[] = useMemo(() => {
    if (columnOrder.length === 0) return allColumns
    const orderMap = new Map(columnOrder.map((id, idx) => [id, idx]))
    const ordered = [...allColumns].sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 9999
      const bi = orderMap.get(b.id) ?? 9999
      return ai - bi
    })
    return ordered
  }, [allColumns, columnOrder])

  const visibleColumns = useMemo(
    () => getVisibleColumns(orderedColumns, visibleColumnIds),
    [orderedColumns, visibleColumnIds]
  )

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
    if (!canArchive) {
      showToast('You do not have permission to archive or restore companies. Contact your admin.')
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

  async function exportRows(rowsToExport: CompanyRow[]) {
    if (rowsToExport.length === 0) return
    const ids = rowsToExport.map((r) => r.id)

    // Pull primary contact for each company.
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('company_id, first_name, last_name, email, phone, is_primary')
      .in('company_id', ids)

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
      if (!existing || row.is_primary) {
        primaryContactByCompany.set(row.company_id, {
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          phone: row.phone,
        })
      }
    }

    const header = [
      'Company name',
      'Industry',
      'Zone',
      'State',
      'City',
      'Address',
      'Status',
      'Priority',
      'Lead source',
      'Assigned to',
      'Last activity',
      'Primary contact name',
      'Primary contact email',
      'Primary contact phone',
    ]
    const csvRows: (string | number | null)[][] = [header]
    for (const r of rowsToExport) {
      const c = primaryContactByCompany.get(r.id)
      csvRows.push([
        r.name,
        r.industry,
        r.zone,
        r.state,
        r.city,
        r.address ?? '',
        r.status,
        r.priority,
        r.lead_source ?? '',
        r.assigned_name ?? '',
        r.last_activity ?? '',
        c?.name ?? '',
        c?.email ?? '',
        c?.phone ?? '',
      ])
    }
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`crm-export-${today}.csv`, toCsv(csvRows))
    showToast(`Exported ${rowsToExport.length} companies`)
  }

  function exportVisible() {
    void exportRows(filteredSorted)
  }
  function exportSelected() {
    if (selectedIds.size === 0) return
    const rows = companies.filter((r) => selectedIds.has(r.id))
    void exportRows(rows)
  }
  function exportAll() {
    void exportRows(companies)
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
        'id, name, industry, zone, state, city, address, status, priority, assigned_to, lead_source, created_at, updated_at, archived, number_of_locations, revenue_range, employee_range'
      )
    companyQuery = companyQuery.eq('archived', viewArchived)
    const { data: companyData } = await companyQuery
    const companyRows = (companyData ?? []) as Array<{
      id: string
      name: string
      industry: string | null
      zone: string | null
      state: string | null
      city: string | null
      address: string | null
      status: CompanyStatus
      priority: CompanyPriority | null
      assigned_to: string | null
      lead_source: string | null
      created_at: string
      updated_at: string
      archived: boolean
      number_of_locations: number | null
      revenue_range: string | null
      employee_range: string | null
    }>
    const companyIds = companyRows.map((c) => c.id)

    // Contacts per company (full details for expandable sub-rows)
    const contactsByCompany = new Map<string, ContactRow[]>()
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
        const list = contactsByCompany.get(row.company_id) ?? []
        list.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          job_title: row.job_title,
          email: row.email,
          phone: row.phone,
          is_primary: row.is_primary,
          phone_numbers: [],
        })
        contactsByCompany.set(row.company_id, list)
      }

      // Fetch phone numbers for all contacts
      const allContactIds = (contactsForCount ?? []).map((c: { id: string }) => c.id)
      if (allContactIds.length > 0) {
        const { data: phoneRows } = await supabase
          .from('contact_phone_numbers')
          .select('contact_id, phone_number, phone_type')
          .in('contact_id', allContactIds)
          .order('is_primary', { ascending: false })
        const phoneMap = new Map<string, ContactPhoneRow[]>()
        for (const pr of (phoneRows ?? []) as Array<{ contact_id: string; phone_number: string; phone_type: string }>) {
          const arr = phoneMap.get(pr.contact_id) ?? []
          arr.push({ phone_number: pr.phone_number, phone_type: pr.phone_type })
          phoneMap.set(pr.contact_id, arr)
        }
        for (const contacts of contactsByCompany.values()) {
          for (const c of contacts) {
            c.phone_numbers = phoneMap.get(c.id) ?? []
          }
        }
      }
    }

    // Last activity per company — MAX(latest call date, latest comment created_at)
    const lastActivity = new Map<string, string>()
    if (companyIds.length > 0) {
      const [{ data: callRows }, { data: commentRows }] = await Promise.all([
        supabase
          .from('crm_call_log')
          .select('company_id, call_date')
          .in('company_id', companyIds)
          .order('call_date', { ascending: false }),
        supabase
          .from('crm_comments')
          .select('company_id, created_at')
          .in('company_id', companyIds)
          .order('created_at', { ascending: false }),
      ])
      for (const row of (callRows ?? []) as { company_id: string; call_date: string }[]) {
        const current = lastActivity.get(row.company_id)
        if (!current || row.call_date > current) lastActivity.set(row.company_id, row.call_date)
      }
      for (const row of (commentRows ?? []) as { company_id: string; created_at: string }[]) {
        const current = lastActivity.get(row.company_id)
        if (!current || row.created_at > current) lastActivity.set(row.company_id, row.created_at)
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
      contacts: contactsByCompany.get(c.id) ?? [],
      last_activity: lastActivity.get(c.id) ?? null,
      tag_ids: tagsByCompany.get(c.id) ?? [],
    }))
    // attach the search blob under a non-enumerable key via Map in state
    searchBlobRef.current = contactNameBlob

    setCompanies(merged)

    // Custom columns
    const { data: ccData } = await supabase
      .from('crm_custom_columns')
      .select('*')
      .order('sort_order', { ascending: true })
    const ccRows = (ccData ?? []) as Array<{
      id: string
      name: string
      column_type: 'text' | 'number' | 'date' | 'select'
      select_options: string[] | null
      sort_order: number
    }>
    const customCols: CustomColumn[] = ccRows.map((cc) => ({
      id: `custom_${cc.id}`,
      label: cc.name,
      type: 'custom' as const,
      columnType: cc.column_type,
      selectOptions: cc.select_options,
      sortField: null,
      defaultVisible: false,
      width: '10%',
      dbId: cc.id,
    }))
    setCustomColumns(customCols)

    // Custom field values
    if (companyIds.length > 0) {
      const { data: fvData } = await supabase
        .from('crm_custom_field_values')
        .select('record_id, column_id, value')
        .in('record_id', companyIds)
      const fvMap = new Map<string, Map<string, string>>()
      for (const row of (fvData ?? []) as { record_id: string; column_id: string; value: string | null }[]) {
        if (!row.value) continue
        if (!fvMap.has(row.record_id)) fvMap.set(row.record_id, new Map())
        fvMap.get(row.record_id)!.set(row.column_id, row.value)
      }
      setFieldValues(fvMap)
    }

    // User column preferences
    const { data: prefData } = await supabase
      .from('crm_user_column_preferences')
      .select('visible_columns')
      .eq('user_id', userId)
      .maybeSingle()
    if (prefData?.visible_columns && Array.isArray(prefData.visible_columns)) {
      setVisibleColumnIds(prefData.visible_columns as string[])
    } else {
      setVisibleColumnIds(DEFAULT_VISIBLE_IDS)
    }

    // Company-wide column order
    const { data: orderData } = await supabase
      .from('crm_column_order')
      .select('column_order')
      .eq('company_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    if (orderData?.column_order && Array.isArray(orderData.column_order)) {
      setColumnOrder(orderData.column_order as string[])
    }

    setLoading(false)
  }, [supabase, viewArchived, userId])

  // Contact-names search blob (kept in ref so state deps stay minimal).
  const searchBlobRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ─── Column preference helpers ────────────────────────────────────────────
  function saveColumnPrefs(ids: string[]) {
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current)
    prefsSaveTimer.current = setTimeout(async () => {
      await supabase.from('crm_user_column_preferences').upsert(
        { user_id: userId, company_id: '00000000-0000-0000-0000-000000000000', visible_columns: ids, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,company_id' }
      )
    }, 600)
  }

  function handleToggleColumn(columnId: string) {
    setVisibleColumnIds((prev) => {
      const next = prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
      saveColumnPrefs(next)
      return next
    })
  }

  async function handleCreateCustomColumn(col: {
    name: string
    column_type: 'text' | 'number' | 'date' | 'select'
    select_options: string[] | null
  }) {
    const { data, error } = await supabase
      .from('crm_custom_columns')
      .insert({
        company_id: '00000000-0000-0000-0000-000000000000',
        name: col.name,
        column_type: col.column_type,
        select_options: col.select_options,
        sort_order: customColumns.length,
        created_by: userId,
      })
      .select('*')
      .single()
    if (error || !data) return
    const newCol: CustomColumn = {
      id: `custom_${data.id}`,
      label: data.name,
      type: 'custom',
      columnType: data.column_type,
      selectOptions: data.select_options,
      sortField: null,
      defaultVisible: false,
      width: '10%',
      dbId: data.id,
    }
    setCustomColumns((prev) => [...prev, newCol])
    setVisibleColumnIds((prev) => {
      const next = [...prev, newCol.id]
      saveColumnPrefs(next)
      return next
    })
  }

  async function handleDeleteCustomColumn(dbId: string) {
    await supabase.from('crm_custom_columns').delete().eq('id', dbId)
    const colId = `custom_${dbId}`
    setCustomColumns((prev) => prev.filter((c) => c.dbId !== dbId))
    setVisibleColumnIds((prev) => {
      const next = prev.filter((id) => id !== colId)
      saveColumnPrefs(next)
      return next
    })
    setColumnOrder((prev) => prev.filter((id) => id !== colId))
  }

  function handleColumnOrderSaved(order: string[]) {
    setColumnOrder(order)
  }

  async function handleSaveFieldValue(recordId: string, columnDbId: string, value: string | null) {
    if (value) {
      await supabase.from('crm_custom_field_values').upsert(
        {
          company_id: '00000000-0000-0000-0000-000000000000',
          record_id: recordId,
          column_id: columnDbId,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'record_id,column_id' }
      )
    } else {
      await supabase
        .from('crm_custom_field_values')
        .delete()
        .eq('record_id', recordId)
        .eq('column_id', columnDbId)
    }
    setFieldValues((prev) => {
      const next = new Map(prev)
      const recordMap = new Map(next.get(recordId) ?? [])
      if (value) {
        recordMap.set(columnDbId, value)
      } else {
        recordMap.delete(columnDbId)
      }
      next.set(recordId, recordMap)
      return next
    })
  }

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
      status: (['prospect', 'contacted', 'lead_created', 'appointment_made', 'not_very_interested', 'blacklisted'] as CompanyStatus[]).map(
        (s) => ({ value: s, label: STATUS_LABELS[s] })
      ),
      zone: uniqueField('zone').map((v) => ({ value: v, label: v })),
      state: uniqueField('state').map((v) => ({ value: v, label: v })),
      city: uniqueField('city').map((v) => ({ value: v, label: v })),
      industry: uniqueField('industry').map((v) => ({ value: v, label: v })),
      priority: (['high', 'medium', 'low'] as CompanyPriority[]).map((p) => ({
        value: p,
        label: PRIORITY_LABELS[p],
      })),
      assigned_to: assignedList,
      tags: allTags.map((t) => ({ value: t.id, label: t.name })),
      job_title: (() => {
        const set = new Set<string>()
        for (const c of companies) {
          for (const ct of c.contacts) {
            if (ct.job_title?.trim()) set.add(ct.job_title.trim())
          }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))
      })(),
    }
  }, [companies, profiles, allTags])

  // Derived value for the shared <LocationFilter> component.
  const locationValue: LocationFilterValue = useMemo(
    () => ({
      zones: [...filters.zone],
      cities: [...filters.city],
      states: [...filters.state],
      radiusCity,
      radiusMiles,
    }),
    [filters.zone, filters.city, filters.state, radiusCity, radiusMiles],
  )

  const cityStatePairs = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of companies) {
      if (typeof c.city === 'string' && c.city && !m.has(c.city)) {
        m.set(c.city, typeof c.state === 'string' ? c.state : null)
      }
    }
    return [...m.entries()].map(([city, state]) => ({ city, state }))
  }, [companies])

  const handleLocationChange = useCallback((next: LocationFilterValue) => {
    setFilters((prev) => ({
      ...prev,
      zone: new Set(next.zones),
      city: new Set(next.cities),
      state: new Set(next.states),
    }))
    setRadiusCity(next.radiusCity)
    setRadiusMiles(next.radiusMiles)
  }, [])

  // ─── Filter + search + sort ─────────────────────��────────────────────────
  const filteredSorted = useMemo(() => {
    let rows = companies

    // Prospects tab never shows active (customer) companies
    if (viewMode === 'new') {
      rows = rows.filter((r) => r.status !== 'active')
    }

    // Column filters (AND across fields; OR within a field)
    const applySetFilter = (field: keyof CompanyRow, selected: Set<string>) => {
      if (selected.size === 0) return
      rows = rows.filter((r) => {
        const v = r[field]
        return typeof v === 'string' && selected.has(v)
      })
    }
    applySetFilter('status', filters.status)
    rows = rows.filter((r) => applyLocationFilter(r, locationValue, radiusCities))
    applySetFilter('industry', filters.industry)
    applySetFilter('priority', filters.priority)
    if (filters.assigned_to.size > 0) {
      rows = rows.filter((r) => r.assigned_to != null && filters.assigned_to.has(r.assigned_to))
    }
    if (filters.tags.size > 0) {
      rows = rows.filter((r) => r.tag_ids.some((t) => filters.tags.has(t)))
    }

    if (filters.job_title.size > 0) {
      rows = rows.filter((r) =>
        r.contacts.some((c) => c.job_title != null && filters.job_title.has(c.job_title.trim()))
      )
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
        case 'last_activity':
          return cmpStr(a.last_activity, b.last_activity)
        case 'assigned_name':
          return cmpStr(a.assigned_name, b.assigned_name)
        default:
          return 0
      }
    })
    return sorted
  }, [companies, filters, search, sortField, sortAsc, radiusCities, locationValue, viewMode])

  const totalCount = filteredSorted.length
  const showAll = pageSize === 'all'
  const effectivePageSize = showAll ? Math.max(totalCount, 1) : pageSize
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalCount / effectivePageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = showAll ? 0 : (safePage - 1) * effectivePageSize
  const pageEnd = showAll ? totalCount : Math.min(pageStart + effectivePageSize, totalCount)
  const pageRows = showAll ? filteredSorted : filteredSorted.slice(pageStart, pageEnd)

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

  if (viewMode === 'existing') {
    return (
      <>
        <ExistingCustomersView
          userId={userId}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onNewCompany={() => setShowNewModal(true)}
          onImportCsv={() => router.push('/sales/crm/import')}
        />
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
      </>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/sales" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <div className="flex items-center gap-2">
            <Building2Icon className="w-5 h-5 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">CRM</h1>
          </div>
          <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('new')}
              className="px-3 py-1 rounded-full font-medium transition-colors bg-white text-gray-900 shadow-sm"
            >
              Prospects
            </button>
            <button
              onClick={() => setViewMode('existing')}
              className="px-3 py-1 rounded-full font-medium transition-colors text-gray-500 hover:text-gray-700"
            >
              Customers
            </button>
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
          <div className="relative" ref={exportMenuRef} onKeyDown={onExportMenuKeyDown}>
            <Tooltip label="Export">
              <button
                onClick={() => setExportMenuOpen((v) => !v)}
                className="inline-flex items-center justify-center w-9 h-9 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                title="Export"
                aria-label="Export"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute top-full mt-2 right-0 z-50 min-w-[220px] bg-white border border-gray-200 rounded-md shadow-sm py-1"
                style={{ borderWidth: '0.5px' }}
              >
                <button
                  ref={(el) => { exportItemRefs.current[0] = el }}
                  role="menuitem"
                  onClick={() => { exportVisible(); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                >
                  Export visible rows
                </button>
                <button
                  ref={(el) => { exportItemRefs.current[1] = el }}
                  role="menuitem"
                  disabled={selectedIds.size === 0}
                  onClick={() => {
                    if (selectedIds.size === 0) return
                    exportSelected()
                    setExportMenuOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {selectedIds.size > 0
                    ? `Export selected rows (${selectedIds.size})`
                    : 'Export selected rows'}
                </button>
                <button
                  ref={(el) => { exportItemRefs.current[2] = el }}
                  role="menuitem"
                  onClick={() => { exportAll(); setExportMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                >
                  Export all companies
                </button>
              </div>
            )}
          </div>
          <Tooltip label="Import Center">
            <button
              onClick={() => router.push('/sales/crm/import')}
              className="inline-flex items-center justify-center w-9 h-9 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Import Center"
              aria-label="Import Center"
            >
              <UploadIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip label="Find Duplicates">
            <button
              onClick={() => setShowFindDuplicates(true)}
              className="inline-flex items-center justify-center w-9 h-9 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Find Duplicates"
              aria-label="Find Duplicates"
            >
              <CopyIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip label={viewArchived ? 'View Active' : 'View Archived'}>
            <button
              onClick={() => setViewArchived((v) => !v)}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                viewArchived
                  ? 'text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100'
                  : 'text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
              title={viewArchived ? 'View Active' : 'View Archived'}
              aria-label={viewArchived ? 'View Active' : 'View Archived'}
            >
              {viewArchived ? <ArchiveRestoreIcon className="w-4 h-4" /> : <ArchiveIcon className="w-4 h-4" />}
            </button>
          </Tooltip>
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
      <div className="px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filter:</span>
        {FILTER_CONFIG.map(({ field, label }, idx) => {
          const selected = filters[field]
          const options = filterOptions[field]
          const active = selected.size > 0
          return (
            <Fragment key={field}>
              {idx === 1 && (
                <LocationFilter
                  value={locationValue}
                  onChange={handleLocationChange}
                  availableZones={filterOptions.zone.map((o) => o.value)}
                  availableCities={filterOptions.city.map((o) => o.value)}
                  availableStates={filterOptions.state.map((o) => o.value)}
                  cityStatePairs={cityStatePairs}
                  onRadiusCitiesChange={setRadiusCities}
                />
              )}
              <div className="relative">
                <button
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setDropdownRect(rect)
                    setOpenFilter((f) => (f === field ? null : field))
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                  style={{ borderRadius: 20 }}
                >
                  {label}
                  {active && (
                    <span className="text-[10px] text-blue-500">
                      ({selected.size})
                    </span>
                  )}
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
                {openFilter === field && dropdownRect && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setOpenFilter(null)}
                    />
                    <div
                      className="fixed z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[220px] max-h-[380px] overflow-y-auto"
                      style={{ top: dropdownRect.bottom + 4, left: dropdownRect.left }}
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
                                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                              />
                              <span className="truncate">{opt.label}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </>,
                  document.body
                )}
              </div>
            </Fragment>
          )
        })}
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              setFilters({
                status: new Set(),
                zone: new Set(),
                state: new Set(),
                city: new Set(),
                industry: new Set(),
                priority: new Set(),
                assigned_to: new Set(),
                tags: new Set(),
                job_title: new Set(),
              })
              setRadiusCity(null)
              setRadiusMiles(null)
            }}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Archived banner ── */}
      {viewArchived && (
        <div className="mx-4 sm:mx-6 mt-2 mb-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-700">
          <ArchiveIcon className="w-3.5 h-3.5" />
          Showing archived companies
        </div>
      )}

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
        <div className="mx-4 sm:mx-6 mb-4 bg-white dark:bg-[#242424] rounded-lg border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '3%' }} />
              {visibleColumns.map((col) => (
                <col key={col.id} style={{ width: col.width }} />
              ))}
              <col style={{ width: canArchive ? '72px' : '36px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200" style={{ borderBottomWidth: '0.5px' }}>
                <th className="pl-5 pr-0" style={{ paddingTop: 10, paddingBottom: 10 }}></th>
                <th className="px-0 text-left align-middle" style={{ paddingTop: 14, paddingBottom: 14 }}>
                  <input
                    type="checkbox"
                    ref={(el) => { if (el) { const ct = pageRows.filter((r) => selectedIds.has(r.id)).length; el.indeterminate = ct > 0 && ct < pageRows.length } }}
                    checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                    onChange={() => {
                      const allPageIds = pageRows.map((r) => r.id)
                      const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id))
                      if (allSelected) {
                        setSelectedIds(new Set())
                      } else {
                        setSelectedIds(new Set(allPageIds))
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
                    aria-label="Select all rows"
                  />
                </th>
                {visibleColumns.map((col, i) => {
                  const isFirst = i === 0
                  const isLast = i === visibleColumns.length - 1
                  const cls = isFirst ? 'pl-2 pr-2' : isLast ? 'pl-2 pr-2' : 'px-2'
                  return (
                    <th
                      key={col.id}
                      onClick={col.sortField ? () => toggleSort(col.sortField as SortField) : undefined}
                      className={`text-[11px] font-normal text-gray-400 text-left ${
                        col.sortField ? 'cursor-pointer select-none hover:text-gray-600' : ''
                      } ${cls}`}
                      style={{ paddingTop: 14, paddingBottom: 14 }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.sortField && sortField === col.sortField && (
                          sortAsc ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                  )
                })}
                <th className="px-1" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <div className="inline-flex items-center gap-0.5">
                    {canEdit('crm') && (
                      <button
                        type="button"
                        onClick={() => setShowColumnSettings(true)}
                        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Column settings"
                      >
                        <SettingsIcon className="w-4 h-4" />
                      </button>
                    )}
                    <CrmColumnPicker
                      allColumns={allColumns}
                      visibleIds={visibleColumnIds}
                      onToggle={handleToggleColumn}
                    />
                  </div>
                </th>
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
                      onClick={() => router.push(`/sales/crm/${c.id}?from=${viewMode}`)}
                      className={`group border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        blacklisted || c.archived ? 'opacity-40' : ''
                      }`}
                      style={{ borderBottomWidth: '0.5px' }}
                    >
                      <td
                        className="pl-5 pr-2 align-middle"
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
                        ) : <div className="w-5" />}
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
                      {visibleColumns.map((col) => {
                        const cellPad = { paddingTop: 14, paddingBottom: 14 }
                        if (col.type === 'custom') {
                          const fv = fieldValues.get(c.id)?.get(col.dbId) ?? null
                          return (
                            <td key={col.id} className="px-2 text-sm" style={cellPad} onClick={(e) => e.stopPropagation()}>
                              <CrmCustomFieldCell
                                value={fv}
                                columnType={col.columnType}
                                selectOptions={col.selectOptions}
                                canEdit={canEdit('crm')}
                                onSave={(v) => handleSaveFieldValue(c.id, col.dbId, v)}
                              />
                            </td>
                          )
                        }
                        switch (col.id) {
                          case 'company':
                            return (
                              <td key={col.id} className="pl-2 pr-2 text-sm font-medium text-gray-900" style={cellPad}>
                                <span className="flex items-center gap-1.5 truncate" title={c.name}>
                                  {c.name}
                                  {c.archived && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-500 rounded">Archived</span>
                                  )}
                                </span>
                              </td>
                            )
                          case 'industry':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{c.industry || '—'}</span></td>
                          case 'zone':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{c.zone || '—'}</span></td>
                          case 'location':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{cityState || '—'}</span></td>
                          case 'status':
                            return (
                              <td key={col.id} className={`px-2 text-sm ${STATUS_TEXT_COLOR[c.status]}`} style={cellPad} onClick={(e) => e.stopPropagation()}>
                                <EditableSelectCell
                                  value={c.status}
                                  showHoverChevron
                                  options={(['prospect', 'contacted', 'lead_created', 'appointment_made', 'not_very_interested', 'blacklisted'] as CompanyStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                                  displayClassName={`text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                                  className={`text-sm ${STATUS_TEXT_COLOR[c.status]}`}
                                  onSave={(v) => updateCompanyField(c.id, 'status', (v ?? 'prospect') as CompanyStatus)}
                                />
                              </td>
                            )
                          case 'priority':
                            return (
                              <td key={col.id} className={`px-2 text-sm ${c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'}`} style={cellPad} onClick={(e) => e.stopPropagation()}>
                                <EditableSelectCell
                                  value={c.priority}
                                  allowEmpty
                                  showHoverChevron
                                  emptyLabel="—"
                                  options={(['high', 'medium', 'low'] as CompanyPriority[]).map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
                                  displayClassName={`text-sm ${c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'}`}
                                  className={`text-sm ${c.priority ? PRIORITY_TEXT_COLOR[c.priority] : 'text-gray-400'}`}
                                  onSave={(v) => updateCompanyField(c.id, 'priority', (v as CompanyPriority | null) ?? null)}
                                />
                              </td>
                            )
                          case 'last_activity':
                            return (
                              <td key={col.id} className={`px-2 text-sm ${last.stale ? 'text-amber-600' : 'text-gray-600'}`} style={cellPad}>
                                <div className="flex items-center gap-1">
                                  <span className="flex-1">{last.text}</span>
                                  {canArchive && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleArchiveToggle(c.id, c.name, !c.archived) }}
                                      disabled={archivingId === c.id}
                                      className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-opacity"
                                      title={c.archived ? 'Restore company' : 'Archive company'}
                                    >
                                      {c.archived ? <ArchiveRestoreIcon className="w-3.5 h-3.5" /> : <ArchiveIcon className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            )
                          case 'assigned':
                            return (
                              <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad} onClick={(e) => e.stopPropagation()}>
                                <EditableSelectCell
                                  value={c.assigned_to}
                                  allowEmpty
                                  showHoverChevron
                                  emptyLabel="—"
                                  options={profiles.filter((p) => p.display_name).map((p) => ({ value: p.id, label: p.display_name ?? '' })).sort((a, b) => a.label.localeCompare(b.label))}
                                  displayLabel={formatAssigned(c.assigned_name)}
                                  displayClassName="text-sm text-gray-600"
                                  className="text-sm text-gray-600"
                                  onSave={(v) => updateCompanyField(c.id, 'assigned_to', v)}
                                />
                              </td>
                            )
                          case 'number_of_locations':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{c.number_of_locations != null ? String(c.number_of_locations) : '—'}</span></td>
                          case 'revenue_range':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{c.revenue_range || '—'}</span></td>
                          case 'employee_range':
                            return <td key={col.id} className="px-2 text-sm text-gray-600" style={cellPad}><span className="block truncate">{c.employee_range || '—'}</span></td>
                          default:
                            return <td key={col.id} className="px-2 text-sm text-gray-400" style={cellPad}>—</td>
                        }
                      })}
                      <td style={{ paddingTop: 14, paddingBottom: 14 }} />
                    </tr>
                    {expanded &&
                      c.contacts.map((k) => {
                        const fullName = `${k.first_name} ${k.last_name}`.trim()
                        return (
                          <tr
                            key={`${c.id}-${k.id}`}
                            onClick={() => router.push(`/sales/crm/${c.id}?from=${viewMode}`)}
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
                              colSpan={Math.max(1, Math.floor((visibleColumns.length - 1) / 2))}
                              className="px-2 text-sm text-gray-600"
                              style={{ paddingTop: 10, paddingBottom: 10 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {k.phone_numbers.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {k.phone_numbers.map((pn, pi) => (
                                    <div key={pi} className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-gray-400 uppercase w-10 shrink-0">{pn.phone_type}</span>
                                      <a
                                        href={`tel:${pn.phone_number}`}
                                        className="text-sm text-gray-700 hover:text-amber-700 hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {pn.phone_number}
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              ) : k.phone ? (
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
                              colSpan={Math.max(1, visibleColumns.length - 1 - Math.floor((visibleColumns.length - 1) / 2)) + 1}
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
                          </tr>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>

          {/* ── Pagination footer ── */}
          <div className="px-7 py-4 flex items-center justify-between bg-gray-50 dark:bg-[#2a2a2a] border-t border-gray-200 dark:border-[#333]" style={{ borderTopWidth: '0.5px' }}>
            <p className="text-xs text-gray-400">
              {showAll
                ? `Showing ${totalCount} of ${totalCount}`
                : `Showing ${totalCount === 0 ? 0 : pageStart + 1}-${pageEnd} of ${totalCount}`}
            </p>
            <div className="flex items-center gap-3">
              {!showAll && (
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
              )}
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  const v = e.target.value
                  changePageSize(v === 'all' ? 'all' : (Number(v) as PageSize))
                }}
                aria-label="Rows per page"
                className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {opt === 'all' ? 'All' : `${opt} per page`}
                  </option>
                ))}
              </select>
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
      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete selected companies"
          message={`Delete ${selectedIds.size} selected ${
            selectedIds.size === 1 ? 'company' : 'companies'
          }? This will also delete all their contacts, addresses, appointments, leads, job walks, call logs, notes, files, reminders, and activity history. This cannot be undone.`}
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

      {/* ── Find duplicates modal ── */}
      {showFindDuplicates && (
        <FindDuplicatesModal
          companies={companies}
          onClose={() => { setShowFindDuplicates(false); setDupMergeIds(null) }}
          onMerge={(idA, idB) => {
            setDupMergeIds([idA, idB])
            setShowFindDuplicates(false)
          }}
        />
      )}
      {dupMergeIds && (
        <MergeCompaniesModal
          companyIdA={dupMergeIds[0]}
          companyIdB={dupMergeIds[1]}
          onClose={() => setDupMergeIds(null)}
          onMerged={() => {
            setDupMergeIds(null)
            showToast('Companies merged')
            fetchAll()
          }}
        />
      )}

      {/* ── Column settings modal (admin) ── */}
      {showColumnSettings && (
        <ColumnSettingsModal
          allColumns={allColumns}
          onClose={() => setShowColumnSettings(false)}
          onColumnCreated={handleCreateCustomColumn}
          onColumnDeleted={handleDeleteCustomColumn}
          onOrderSaved={handleColumnOrderSaved}
          columnOrder={columnOrder}
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
