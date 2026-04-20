'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SearchIcon,
  ClipboardCheckIcon,
  BriefcaseIcon,
  UsersIcon,
  TrendingUpIcon,
  PhoneIcon,
  CalendarIcon,
  TargetIcon,
  FootprintsIcon,
  CalculatorIcon,
  LayoutDashboardIcon,
  ClipboardListIcon,
  ShieldIcon,
  ReceiptIcon,
  ClockIcon,
  ImageIcon,
  CheckSquareIcon,
  DollarSignIcon,
  CalendarRangeIcon,
  SettingsIcon,
  LockIcon,
  FileTextIcon,
  ListChecksIcon,
  BookOpenIcon,
  DownloadIcon,
  BarChart3Icon,
  Trash2Icon,
  BugIcon,
  MonitorIcon,
  WrenchIcon,
  PackageIcon,
  BoxesIcon,
  WarehouseIcon,
  FolderOpenIcon,
  BanknoteIcon,
  BuildingIcon,
  LoaderIcon,
  type LucideIcon,
} from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import type { FeatureKey } from '@/types'

type AccessRule =
  | { type: 'all' }
  | { type: 'roles'; roles: string[] }
  | { type: 'permission'; feature: FeatureKey }
  | { type: 'admin' }
  | { type: 'scheduler' }

interface NavPage {
  name: string
  route: string
  icon: LucideIcon
  description: string
  keywords: string[]
  access: AccessRule
}

interface SearchResult {
  id: string
  name: string
  route: string
  icon: LucideIcon
  secondaryLabel: string
  category: string
}

const SALES_ROLES = ['admin', 'office_manager', 'salesman']

const NAV_PAGES: NavPage[] = [
  { name: 'My Work', route: '/my-work', icon: ClipboardCheckIcon, description: 'Home', keywords: [], access: { type: 'all' } },
  { name: 'Employee Summary', route: '/my-work/employee-summary', icon: ClipboardCheckIcon, description: 'My Work', keywords: [], access: { type: 'all' } },
  { name: 'Manage Playbook', route: '/my-work/manage-playbook', icon: ClipboardCheckIcon, description: 'My Work', keywords: [], access: { type: 'all' } },
  { name: 'Office', route: '/office', icon: BriefcaseIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Contacts', route: '/office/contacts', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Customers', route: '/office/customers', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Vendors', route: '/office/vendors', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Sales Dashboard', route: '/sales', icon: TrendingUpIcon, description: 'Sales', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'CRM', route: '/sales/crm', icon: UsersIcon, description: 'Sales', keywords: [], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Dialer', route: '/sales/dialer', icon: PhoneIcon, description: 'Sales', keywords: ['phone', 'calls', 'cold call'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Appointments', route: '/sales/appointments', icon: CalendarIcon, description: 'Sales', keywords: ['meetings', 'schedule'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Leads', route: '/sales/leads', icon: TargetIcon, description: 'Sales', keywords: ['prospects', 'pipeline'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Job Walk', route: '/job-walk', icon: FootprintsIcon, description: 'Sales', keywords: ['site visit', 'pre-construction'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Estimating', route: '/sales/estimating', icon: CalculatorIcon, description: 'Sales', keywords: ['takeoff', 'bid', 'proposal'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Job Board', route: '/job-board', icon: LayoutDashboardIcon, description: 'Job Board', keywords: [], access: { type: 'permission', feature: 'job_board' } },
  { name: 'Job Feed', route: '/jobs', icon: BriefcaseIcon, description: 'Job Board', keywords: [], access: { type: 'permission', feature: 'jobs' } },
  { name: 'Daily Reports', route: '/daily-reports', icon: ClipboardListIcon, description: 'Job Board', keywords: ['field report'], access: { type: 'permission', feature: 'daily_reports' } },
  { name: 'JSA Reports', route: '/jsa-reports', icon: ShieldIcon, description: 'Job Board', keywords: ['safety', 'hazard', 'job safety analysis'], access: { type: 'permission', feature: 'jsa_reports' } },
  { name: 'Job Expenses', route: '/receipts', icon: ReceiptIcon, description: 'Job Board', keywords: ['receipts'], access: { type: 'permission', feature: 'receipts' } },
  { name: 'Timesheets', route: '/timesheets', icon: ClockIcon, description: 'Job Board', keywords: ['timecard', 'hours', 'clock'], access: { type: 'permission', feature: 'timesheets' } },
  { name: 'Photos', route: '/photos', icon: ImageIcon, description: 'Job Board', keywords: [], access: { type: 'permission', feature: 'photos' } },
  { name: 'Field Tasks', route: '/tasks', icon: CheckSquareIcon, description: 'Job Board', keywords: [], access: { type: 'permission', feature: 'tasks' } },
  { name: 'Billing', route: '/billing', icon: DollarSignIcon, description: 'Billing', keywords: ['invoices', 'change orders'], access: { type: 'all' } },
  { name: 'Calendar', route: '/calendar', icon: CalendarIcon, description: 'Calendar', keywords: ['events', 'schedule'], access: { type: 'permission', feature: 'calendar' } },
  { name: 'Scheduler', route: '/scheduler', icon: CalendarRangeIcon, description: 'Scheduler', keywords: ['crew schedule', 'weekly schedule'], access: { type: 'scheduler' } },
  { name: 'SOPs & Forms', route: '/sops', icon: FileTextIcon, description: 'Office', keywords: ['standard operating procedures', 'processes', 'documentation'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Equipment', route: '/equipment', icon: WrenchIcon, description: 'Equipment', keywords: ['tools', 'maintenance', 'inventory'], access: { type: 'roles', roles: SALES_ROLES } },
  { name: 'Material Management', route: '/material-management', icon: PackageIcon, description: 'Materials', keywords: ['products', 'suppliers', 'catalog'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Material Systems', route: '/material-systems', icon: BoxesIcon, description: 'Materials', keywords: ['system templates'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Inventory', route: '/inventory', icon: WarehouseIcon, description: 'Materials', keywords: ['job materials', 'products'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Settings', route: '/profile', icon: SettingsIcon, description: 'Settings & Admin', keywords: ['company info', 'profile'], access: { type: 'all' } },
  { name: 'Permissions', route: '/permissions', icon: LockIcon, description: 'Settings & Admin', keywords: ['roles', 'access'], access: { type: 'admin' } },
  { name: 'Form Management', route: '/form-management', icon: FileTextIcon, description: 'Settings & Admin', keywords: ['templates', 'custom forms'], access: { type: 'admin' } },
  { name: 'Checklist Templates', route: '/checklist-templates', icon: ListChecksIcon, description: 'Settings & Admin', keywords: ['project checklists'], access: { type: 'admin' } },
  { name: 'Job Report Management', route: '/job-report-management', icon: BookOpenIcon, description: 'Settings & Admin', keywords: ['field guides', 'report checklists'], access: { type: 'admin' } },
  { name: 'Data Export', route: '/data-export', icon: DownloadIcon, description: 'Settings & Admin', keywords: ['download', 'zip', 'backup'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Reports', route: '/reports', icon: BarChart3Icon, description: 'Reports', keywords: ['timesheet reports'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Timesheet Reports', route: '/reports/timesheets', icon: BarChart3Icon, description: 'Reports', keywords: ['hours report', 'payroll'], access: { type: 'roles', roles: ['admin', 'office_manager'] } },
  { name: 'Trash Bin', route: '/trash-bin', icon: Trash2Icon, description: 'Settings & Admin', keywords: ['deleted', 'recover', 'restore'], access: { type: 'admin' } },
  { name: 'Bug Reports', route: '/bug-reports', icon: BugIcon, description: 'Settings & Admin', keywords: ['issues', 'problems'], access: { type: 'admin' } },
  { name: 'Command Center', route: '/admin/command-center', icon: MonitorIcon, description: 'Settings & Admin', keywords: ['dashboard', 'metrics', 'admin'], access: { type: 'admin' } },
]

export default function NavigationSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dataResults, setDataResults] = useState<SearchResult[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const { role, schedulerAccess } = useUserRole()
  const { canView } = usePermissions(role)
  const supabaseRef = useRef(createClient())

  const isSalesRole = SALES_ROLES.includes(role)

  const hasAccess = useCallback(
    (access: AccessRule): boolean => {
      switch (access.type) {
        case 'all':
          return true
        case 'roles':
          return access.roles.includes(role)
        case 'permission':
          return canView(access.feature)
        case 'admin':
          return role === 'admin'
        case 'scheduler':
          return role === 'admin' || schedulerAccess
      }
    },
    [role, schedulerAccess, canView]
  )

  const accessiblePages = useMemo(
    () => NAV_PAGES.filter((page) => hasAccess(page.access)),
    [hasAccess]
  )

  const filteredPages = useMemo((): SearchResult[] => {
    if (!query.trim()) {
      return accessiblePages.map((p) => ({
        id: `page-${p.route}`,
        name: p.name,
        route: p.route,
        icon: p.icon,
        secondaryLabel: p.description,
        category: 'Pages',
      }))
    }
    const q = query.toLowerCase()
    return accessiblePages
      .filter(
        (page) =>
          page.name.toLowerCase().includes(q) ||
          page.description.toLowerCase().includes(q) ||
          page.keywords.some((kw) => kw.toLowerCase().includes(q))
      )
      .map((p) => ({
        id: `page-${p.route}`,
        name: p.name,
        route: p.route,
        icon: p.icon,
        secondaryLabel: p.description,
        category: 'Pages',
      }))
  }, [query, accessiblePages])

  const allResults = useMemo(() => {
    const grouped: { category: string; items: SearchResult[] }[] = []
    if (filteredPages.length > 0) {
      grouped.push({ category: 'Pages', items: filteredPages })
    }
    const dataCategories = ['Projects', 'Estimates', 'Companies', 'Contacts', 'Leads', 'Equipment', 'Check Deposits']
    for (const cat of dataCategories) {
      const items = dataResults.filter((r) => r.category === cat)
      if (items.length > 0) {
        grouped.push({ category: cat, items })
      }
    }
    return grouped
  }, [filteredPages, dataResults])

  const flatResults = useMemo(
    () => allResults.flatMap((g) => g.items),
    [allResults]
  )

  const searchData = useCallback(
    async (term: string) => {
      if (term.length < 2) {
        setDataResults([])
        setDataLoading(false)
        return
      }

      setDataLoading(true)
      const supabase = supabaseRef.current
      const pattern = `%${term}%`
      const results: SearchResult[] = []

      try {
        const queries: Promise<void>[] = []

        queries.push(
          Promise.resolve(supabase
            .from('projects')
            .select('id, name, project_number')
            .or(`name.ilike.${pattern},project_number.ilike.${pattern}`)
            .limit(5))
            .then(({ data }) => {
              if (data) {
                for (const p of data) {
                  results.push({
                    id: `project-${p.id}`,
                    name: p.name || p.project_number || 'Untitled',
                    route: `/projects/${p.id}`,
                    icon: FolderOpenIcon,
                    secondaryLabel: p.project_number || 'Project',
                    category: 'Projects',
                  })
                }
              }
            })
        )

        if (isSalesRole) {
          const estimateNameQuery = Promise.resolve(supabase
            .from('estimates')
            .select('id, estimate_number, project_name, company_id')
            .ilike('project_name', pattern)
            .limit(5))
            .then(({ data }) => {
              if (data) {
                for (const e of data) {
                  results.push({
                    id: `estimate-${e.id}`,
                    name: e.project_name || `Estimate #${e.estimate_number}`,
                    route: `/estimates?customer=${e.company_id}&estimate=${e.id}`,
                    icon: CalculatorIcon,
                    secondaryLabel: `#${e.estimate_number}`,
                    category: 'Estimates',
                  })
                }
              }
            })
          queries.push(estimateNameQuery)

          const numericTerm = parseInt(term, 10)
          if (!isNaN(numericTerm)) {
            queries.push(
              Promise.resolve(supabase
                .from('estimates')
                .select('id, estimate_number, project_name, company_id')
                .eq('estimate_number', numericTerm)
                .limit(5))
                .then(({ data }) => {
                  if (data) {
                    for (const e of data) {
                      if (!results.some((r) => r.id === `estimate-${e.id}`)) {
                        results.push({
                          id: `estimate-${e.id}`,
                          name: e.project_name || `Estimate #${e.estimate_number}`,
                          route: `/estimates?customer=${e.company_id}&estimate=${e.id}`,
                          icon: CalculatorIcon,
                          secondaryLabel: `#${e.estimate_number}`,
                          category: 'Estimates',
                        })
                      }
                    }
                  }
                })
            )
          }

          queries.push(
            Promise.resolve(supabase
              .from('companies')
              .select('id, name')
              .ilike('name', pattern)
              .limit(5))
              .then(({ data }) => {
                if (data) {
                  for (const c of data) {
                    results.push({
                      id: `company-${c.id}`,
                      name: c.name,
                      route: `/sales/crm/${c.id}`,
                      icon: BuildingIcon,
                      secondaryLabel: 'CRM',
                      category: 'Companies',
                    })
                  }
                }
              })
          )

          queries.push(
            Promise.resolve(supabase
              .from('contacts')
              .select('id, first_name, last_name, company_id')
              .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
              .limit(5))
              .then(({ data }) => {
                if (data) {
                  for (const c of data) {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
                    results.push({
                      id: `contact-${c.id}`,
                      name: name || 'Unnamed Contact',
                      route: c.company_id ? `/sales/crm/${c.company_id}` : '/office/contacts',
                      icon: UsersIcon,
                      secondaryLabel: 'Contact',
                      category: 'Contacts',
                    })
                  }
                }
              })
          )

          queries.push(
            Promise.resolve(supabase
              .from('leads')
              .select('id, project_name, customer_name')
              .or(`project_name.ilike.${pattern},customer_name.ilike.${pattern}`)
              .limit(5))
              .then(({ data }) => {
                if (data) {
                  for (const l of data) {
                    results.push({
                      id: `lead-${l.id}`,
                      name: l.project_name || l.customer_name || 'Untitled Lead',
                      route: `/sales/leads?lead=${l.id}`,
                      icon: TargetIcon,
                      secondaryLabel: 'Leads',
                      category: 'Leads',
                    })
                  }
                }
              })
          )

          queries.push(
            Promise.resolve(supabase
              .from('equipment')
              .select('id, name, category')
              .ilike('name', pattern)
              .limit(5))
              .then(({ data }) => {
                if (data) {
                  for (const eq of data) {
                    results.push({
                      id: `equipment-${eq.id}`,
                      name: eq.name,
                      route: `/equipment/${eq.id}`,
                      icon: WrenchIcon,
                      secondaryLabel: eq.category || 'Equipment',
                      category: 'Equipment',
                    })
                  }
                }
              })
          )
        }

        if (role === 'admin') {
          queries.push(
            Promise.resolve(supabase
              .from('check_deposits')
              .select('id, name, invoice_number, check_number')
              .or(`name.ilike.${pattern},invoice_number.ilike.${pattern},check_number.ilike.${pattern}`)
              .limit(5))
              .then(({ data }) => {
                if (data) {
                  for (const cd of data) {
                    results.push({
                      id: `check-deposit-${cd.id}`,
                      name: cd.name,
                      route: '/office',
                      icon: BanknoteIcon,
                      secondaryLabel: [
                        cd.invoice_number && `Inv #${cd.invoice_number}`,
                        cd.check_number && `Check #${cd.check_number}`,
                      ].filter(Boolean).join(' · ') || 'Check Deposit',
                      category: 'Check Deposits',
                    })
                  }
                }
              })
          )
        }

        await Promise.all(queries)
        setDataResults(results)
      } catch {
        setDataResults([])
      } finally {
        setDataLoading(false)
      }
    },
    [isSalesRole, role]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setDataResults([])
      setDataLoading(false)
      return
    }
    setDataLoading(true)
    debounceRef.current = setTimeout(() => {
      searchData(query.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchData])

  useEffect(() => {
    setSelectedIndex(0)
  }, [flatResults.length, query])

  function closeSearch() {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
    setDataResults([])
    inputRef.current?.blur()
  }

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        } else {
          closeSearch()
        }
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeSearch()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const navigateTo = useCallback(
    (route: string) => {
      closeSearch()
      router.push(route)
    },
    [router]
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
      return
    }
    if (flatResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % flatResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatResults[selectedIndex]) {
        navigateTo(flatResults[selectedIndex].route)
      }
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  let globalIdx = -1

  return (
    <div ref={containerRef} className="relative">
      {/* Mobile: search icon button */}
      <button
        onClick={() => {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="sm:hidden p-1.5 transition-colors rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        aria-label="Search"
      >
        <SearchIcon className="w-[18px] h-[18px]" />
      </button>

      {/* Desktop: inline search input */}
      <div className="hidden sm:flex items-center relative">
        <SearchIcon className="absolute left-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-[220px] h-7 pl-8 pr-3 text-xs bg-[#2a2a2a] border border-[#3a3a3a] rounded-md text-white placeholder-gray-500 outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
          autoComplete="off"
        />
      </div>

      {/* Mobile: expanded search input when open */}
      {open && (
        <div className="sm:hidden fixed inset-x-0 top-0 z-[100] bg-[#1a1a1a] px-3 py-2 flex items-center gap-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', height: 'calc(3rem + env(safe-area-inset-top, 0px))' }}>
          <SearchIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="flex-1 h-8 px-2 text-sm bg-[#2a2a2a] border border-[#3a3a3a] rounded-md text-white placeholder-gray-500 outline-none focus:border-amber-500/50"
            autoComplete="off"
            autoFocus
          />
          <button onClick={closeSearch} className="text-xs text-gray-400 hover:text-white px-2 py-1">
            Cancel
          </button>
        </div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1.5 w-[min(420px,calc(100vw-16px))] sm:w-[420px] max-h-[70vh] overflow-y-auto bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl z-50 max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(3rem+env(safe-area-inset-top,0px)+4px)] max-sm:w-auto"
        >
          {flatResults.length === 0 && !dataLoading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No results found
            </div>
          ) : (
            allResults.map((group) => (
              <div key={group.category}>
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  {group.category}
                  {dataLoading && group.category !== 'Pages' && (
                    <LoaderIcon className="w-3 h-3 animate-spin text-gray-500" />
                  )}
                </div>
                {group.items.map((result) => {
                  globalIdx++
                  const idx = globalIdx
                  const Icon = result.icon
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={result.id}
                      data-selected={isSelected}
                      onClick={() => navigateTo(result.route)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-amber-500/15 text-white'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isSelected ? 'text-amber-400' : 'text-gray-500'
                        }`}
                      />
                      <span className="flex-1 text-sm truncate">{result.name}</span>
                      <span className="text-[11px] text-gray-500 flex-shrink-0">{result.secondaryLabel}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
          {dataLoading && dataResults.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-3 flex items-center gap-2 text-xs text-gray-500">
              <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
              Searching...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
