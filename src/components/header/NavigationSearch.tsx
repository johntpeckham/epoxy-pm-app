'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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

const NAV_PAGES: NavPage[] = [
  { name: 'My Work', route: '/my-work', icon: ClipboardCheckIcon, description: 'Home', keywords: [], access: { type: 'all' } },
  { name: 'Employee Summary', route: '/my-work/employee-summary', icon: ClipboardCheckIcon, description: 'My Work', keywords: [], access: { type: 'all' } },
  { name: 'Manage Playbook', route: '/my-work/manage-playbook', icon: ClipboardCheckIcon, description: 'My Work', keywords: [], access: { type: 'all' } },
  { name: 'Office', route: '/office', icon: BriefcaseIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Contacts', route: '/office/contacts', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Customers', route: '/office/customers', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Vendors', route: '/office/vendors', icon: UsersIcon, description: 'Office', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Sales Dashboard', route: '/sales', icon: TrendingUpIcon, description: 'Sales', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'CRM', route: '/sales/crm', icon: UsersIcon, description: 'Sales', keywords: [], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Dialer', route: '/sales/dialer', icon: PhoneIcon, description: 'Sales', keywords: ['phone', 'calls', 'cold call'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Appointments', route: '/sales/appointments', icon: CalendarIcon, description: 'Sales', keywords: ['meetings', 'schedule'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Leads', route: '/sales/leads', icon: TargetIcon, description: 'Sales', keywords: ['prospects', 'pipeline'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Job Walk', route: '/job-walk', icon: FootprintsIcon, description: 'Sales', keywords: ['site visit', 'pre-construction'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
  { name: 'Estimating', route: '/sales/estimating', icon: CalculatorIcon, description: 'Sales', keywords: ['takeoff', 'bid', 'proposal'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
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
  { name: 'Equipment', route: '/equipment', icon: WrenchIcon, description: 'Equipment', keywords: ['tools', 'maintenance', 'inventory'], access: { type: 'roles', roles: ['admin', 'office_manager', 'salesman'] } },
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
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { role, schedulerAccess } = useUserRole()
  const { canView } = usePermissions(role)

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

  const filteredPages = useMemo(() => {
    if (!query.trim()) return accessiblePages
    const q = query.toLowerCase()
    return accessiblePages.filter(
      (page) =>
        page.name.toLowerCase().includes(q) ||
        page.description.toLowerCase().includes(q) ||
        page.keywords.some((kw) => kw.toLowerCase().includes(q))
    )
  }, [query, accessiblePages])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredPages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const navigateTo = useCallback(
    (route: string) => {
      setOpen(false)
      router.push(route)
    },
    [router]
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredPages.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredPages.length) % filteredPages.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredPages[selectedIndex]) {
        navigateTo(filteredPages[selectedIndex].route)
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 transition-colors rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        aria-label="Search pages"
        title="Search pages (⌘K)"
      >
        <SearchIcon className="w-[18px] h-[18px]" />
      </button>
    )
  }

  return (
    <>
      <button
        className="p-1.5 transition-colors rounded-lg text-white bg-white/10"
        aria-label="Search pages"
        title="Search pages (⌘K)"
      >
        <SearchIcon className="w-[18px] h-[18px]" />
      </button>
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      >
        <div
          className="w-full max-w-lg bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3a3a3a]">
            <SearchIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
              placeholder="Search pages..."
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
              autoComplete="off"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-500 bg-[#2a2a2a] border border-[#3a3a3a] rounded">
              ESC
            </kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
            {filteredPages.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No pages found
              </div>
            ) : (
              filteredPages.map((page, index) => {
                const Icon = page.icon
                const isSelected = index === selectedIndex
                return (
                  <button
                    key={page.route}
                    data-selected={isSelected}
                    onClick={() => navigateTo(page.route)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
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
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{page.name}</div>
                      <div className="text-xs text-gray-500 truncate">{page.description}</div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}
