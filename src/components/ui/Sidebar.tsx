'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BriefcaseIcon, ClipboardListIcon, ImageIcon, CheckSquareIcon, CalendarIcon, CalendarRangeIcon, XIcon, ShieldIcon, ReceiptIcon, ClockIcon, DollarSignIcon, LayoutDashboardIcon, ClipboardCheckIcon, ChevronRightIcon, FootprintsIcon, UsersIcon, PhoneIcon, MailIcon, TargetIcon, CalculatorIcon, MegaphoneIcon, WrenchIcon } from 'lucide-react'
import { RulerIcon } from 'lucide-react'
import { usePermissions } from '@/lib/usePermissions'

interface SidebarProps {
  userId: string
  userEmail?: string
  displayName?: string
  avatarUrl?: string
}

export default function Sidebar({ userId, userEmail, displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [jobFeedExpanded, setJobFeedExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-job-feed-expanded') === 'true'
  })
  const [toolsExpanded, setToolsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-tools-expanded') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar-job-feed-expanded', String(jobFeedExpanded))
  }, [jobFeedExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-tools-expanded', String(toolsExpanded))
  }, [toolsExpanded])

  const { canView, isHiddenFromSidebar } = usePermissions()
  // Visibility gate for the SALES section (label + divider + four flat
  // items). Estimating + Billing + Job Board + Job Feed now live under
  // PROJECTS — see canViewProjects below. Dialer / Emailer live under
  // Tools (their canView keys gate the Tools section).
  const canViewSales =
    canView('crm') ||
    canView('leads') ||
    canView('appointments') ||
    canView('job_walk')
  const canViewProjects =
    canView('estimating') ||
    canView('job_board') ||
    canView('jobs') ||
    canView('billing')

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('open-mobile-sidebar', handler)
    return () => window.removeEventListener('open-mobile-sidebar', handler)
  }, [])

  const isJobBoardActive = pathname === '/job-board'
  const isJobsActive = pathname === '/jobs' || pathname.startsWith('/projects')

  // Carry the selected project param between Job Board and Job Feed
  const currentProjectId = (isJobBoardActive || isJobsActive) ? searchParams.get('project') : null
  const jobBoardHref = currentProjectId ? `/job-board?project=${currentProjectId}` : '/job-board'
  const jobFeedHref = currentProjectId ? `/jobs?project=${currentProjectId}` : '/jobs'
  const isReportsActive = pathname === '/daily-reports'
  const isJsaReportsActive = pathname === '/jsa-reports'
  const isPhotosActive = pathname === '/photos'
  const isTasksActive = pathname === '/tasks'
  const isReceiptsActive = pathname === '/receipts'
  const isTimesheetsActive = pathname === '/timesheets'
  const isCalendarActive = pathname === '/calendar'
  const isSchedulerActive = pathname === '/scheduler' || pathname.startsWith('/scheduler/')
  const isTakeoffToolsActive = pathname === '/tools/takeoff' || pathname.startsWith('/tools/takeoff/')
  const isMarketingActive = pathname === '/marketing' || pathname.startsWith('/marketing/')
  const isBillingActive = pathname === '/billing'
  const isMyWorkActive = pathname === '/my-work'
  const isOfficeActive = pathname === '/office' || pathname.startsWith('/office/')
  const isSalesCrmActive = pathname === '/sales/crm' || pathname.startsWith('/sales/crm/')
  const isSalesDialerActive = pathname === '/sales/dialer' || pathname.startsWith('/sales/dialer/')
  const isSalesEmailerActive = pathname === '/sales/emailer' || pathname.startsWith('/sales/emailer/')
  const isSalesAppointmentsActive = pathname === '/sales/appointments' || pathname.startsWith('/sales/appointments/')
  const isSalesLeadsActive = pathname === '/sales/leads' || pathname.startsWith('/sales/leads/')
  const isJobWalkActive = pathname === '/job-walk' || pathname.startsWith('/job-walk/')
  const isEstimatingActive =
    pathname === '/estimating' || pathname.startsWith('/estimating/')

  // Auto-open the Job Feed group when any descendant route (Daily Reports /
  // JSA Reports / Job Expenses / Timesheets / Photos / Field Tasks) is
  // active, so the user doesn't have to manually expand to reach where
  // they are. Intentionally NOT triggered by isJobsActive itself —
  // clicking the Job Feed text/icon should navigate without auto-toggling
  // the chevron (matches the Job Board / Sales pattern).
  useEffect(() => {
    if (
      isReportsActive ||
      isJsaReportsActive ||
      isReceiptsActive ||
      isTimesheetsActive ||
      isPhotosActive ||
      isTasksActive
    ) {
      setJobFeedExpanded(true)
    }
  }, [
    isReportsActive,
    isJsaReportsActive,
    isReceiptsActive,
    isTimesheetsActive,
    isPhotosActive,
    isTasksActive,
  ])

  // Auto-open the Tools group when a Takeoff or Scheduler route is
  // active. Dialer / Emailer routes intentionally do NOT auto-open the
  // group — users reach those via the CRM top-row buttons and shouldn't
  // have their sidebar state mutated as a side effect. The
  // isSalesDialerActive / isSalesEmailerActive booleans are still used
  // below to drive the active-item highlight inside the Tools group
  // when the user has it manually expanded.
  useEffect(() => {
    if (isTakeoffToolsActive || isSchedulerActive) {
      setToolsExpanded(true)
    }
  }, [isTakeoffToolsActive, isSchedulerActive])

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-4 space-y-1">
        <Link
          href="/my-work"
          prefetch={false}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isMyWorkActive
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-gray-400 hover:text-white hover:bg-neutral-800'
          }`}
        >
          <ClipboardCheckIcon className="w-5 h-5 flex-shrink-0" />
          My Work
        </Link>
        {canView('office') && (
          <Link
            href="/office"
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isOfficeActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <BriefcaseIcon className="w-5 h-5 flex-shrink-0" />
            Office
          </Link>
        )}
        {canViewSales && (
          <>
            {/* Divider above the SALES group label. Rendered together
                with the label so a user who can't see any SALES item
                doesn't get an orphan divider. */}
            <div className="mx-3 my-2 border-t border-neutral-800/60" />
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Sales
            </div>
            {canView('crm') && (
              <Link
                href="/sales/crm"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isSalesCrmActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <UsersIcon className="w-5 h-5 flex-shrink-0" />
                CRM
              </Link>
            )}
            {canView('leads') && (
              <Link
                href="/sales/leads"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isSalesLeadsActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <TargetIcon className="w-5 h-5 flex-shrink-0" />
                Leads
              </Link>
            )}
            {canView('appointments') && (
              <Link
                href="/sales/appointments"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isSalesAppointmentsActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <CalendarIcon className="w-5 h-5 flex-shrink-0" />
                Appointments
              </Link>
            )}
            {canView('job_walk') && (
              <Link
                href="/job-walk"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isJobWalkActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <FootprintsIcon className="w-5 h-5 flex-shrink-0" />
                Job Walk
              </Link>
            )}
          </>
        )}

        {canViewProjects && (
          <>
            {/* Divider above the PROJECTS group label. Rendered together
                with the label so a user who can't see any PROJECTS item
                doesn't get an orphan divider. */}
            <div className="mx-3 my-2 border-t border-neutral-800/60" />
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Projects
            </div>
            {canView('estimating') && (
              <Link
                href="/estimating"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isEstimatingActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <CalculatorIcon className="w-5 h-5 flex-shrink-0" />
                Estimating
              </Link>
            )}
            {/* Job Board — flat top-level link. No chevron, no nesting. */}
            {canView('job_board') && (
              <Link
                href={jobBoardHref}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isJobBoardActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <LayoutDashboardIcon className="w-5 h-5 flex-shrink-0" />
                Job Board
              </Link>
            )}
            {/* Job Feed — promoted to top-level alongside Job Board. Keeps
                its chevron and its six sub-items, now at single-indent
                (pl-6) since Job Feed is no longer nested under Job Board. */}
            {canView('jobs') && (
              <div>
                <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                  isJobsActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}>
                  <Link
                    href={jobFeedHref}
                    prefetch={false}
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0"
                  >
                    <BriefcaseIcon className="w-5 h-5 flex-shrink-0" />
                    Job Feed
                  </Link>
                  <button
                    onClick={() => setJobFeedExpanded(!jobFeedExpanded)}
                    className="px-2 py-2.5 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
                    aria-label={jobFeedExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
                  >
                    <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${jobFeedExpanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                <div
                  className="overflow-hidden transition-all duration-200 ease-in-out"
                  style={{
                    maxHeight: jobFeedExpanded ? '600px' : '0px',
                    opacity: jobFeedExpanded ? 1 : 0,
                  }}
                >
                  {canView('daily_reports') && !isHiddenFromSidebar('daily_reports') && (
                    <Link
                      href="/daily-reports"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isReportsActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <ClipboardListIcon className="w-4 h-4 flex-shrink-0" />
                      Daily Reports
                    </Link>
                  )}
                  {canView('jsa_reports') && !isHiddenFromSidebar('jsa_reports') && (
                    <Link
                      href="/jsa-reports"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isJsaReportsActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <ShieldIcon className="w-4 h-4 flex-shrink-0" />
                      JSA Reports
                    </Link>
                  )}
                  {canView('receipts') && !isHiddenFromSidebar('receipts') && (
                    <Link
                      href="/receipts"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isReceiptsActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <ReceiptIcon className="w-4 h-4 flex-shrink-0" />
                      Job Expenses
                    </Link>
                  )}
                  {canView('timesheets') && !isHiddenFromSidebar('timesheets') && (
                    <Link
                      href="/timesheets"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isTimesheetsActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <ClockIcon className="w-4 h-4 flex-shrink-0" />
                      Timesheets
                    </Link>
                  )}
                  {canView('photos') && !isHiddenFromSidebar('photos') && (
                    <Link
                      href="/photos"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isPhotosActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 flex-shrink-0" />
                      Photos
                    </Link>
                  )}
                  {canView('tasks') && !isHiddenFromSidebar('tasks') && (
                    <Link
                      href="/tasks"
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isTasksActive
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                      }`}
                    >
                      <CheckSquareIcon className="w-4 h-4 flex-shrink-0" />
                      Field Tasks
                    </Link>
                  )}
                </div>
              </div>
            )}
            {canView('billing') && (
              <Link
                href="/billing"
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`hidden md:flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isBillingActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <DollarSignIcon className="w-5 h-5 flex-shrink-0" />
                Billing
              </Link>
            )}
          </>
        )}

        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-neutral-800/60" />

        {canView('calendar') && (
          <Link
            href="/calendar"
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isCalendarActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <CalendarIcon className="w-5 h-5 flex-shrink-0" />
            Calendar
          </Link>
        )}

        {canView('marketing') && (
          <Link
            href="/marketing"
            prefetch={false}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isMarketingActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <MegaphoneIcon className="w-5 h-5 flex-shrink-0" />
            Marketing
          </Link>
        )}

        {/* Tools — chevron group with NO destination route. Children:
            Dialer + Emailer (mobile-visible), then Takeoff + Scheduler
            inside a desktop-only sub-wrapper. The outer wrapper is
            always-rendered so Dialer/Emailer reach mobile users the way
            they did when they lived in the Sales group. */}
        {(canView('dialer') ||
          canView('emailer') ||
          canView('estimating') ||
          canView('scheduler')) && (
          <div>
            <div className="flex items-center rounded-lg text-sm font-medium text-gray-400">
              <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
                <WrenchIcon className="w-5 h-5 flex-shrink-0" />
                Tools
              </div>
              <button
                onClick={() => setToolsExpanded(!toolsExpanded)}
                className="px-2 py-2.5 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
                aria-label={toolsExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
              >
                <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${toolsExpanded ? 'rotate-90' : ''}`} />
              </button>
            </div>
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxHeight: toolsExpanded ? '600px' : '0px',
                opacity: toolsExpanded ? 1 : 0,
              }}
            >
              {canView('dialer') && (
                <Link
                  href="/sales/dialer"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSalesDialerActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                  Dialer
                </Link>
              )}
              {canView('emailer') && (
                <Link
                  href="/sales/emailer"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSalesEmailerActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <MailIcon className="w-4 h-4 flex-shrink-0" />
                  Emailer
                </Link>
              )}
              {/* Takeoff + Scheduler stay desktop-only to preserve the
                  previous visibility rule for Scheduler. */}
              <div className="hidden lg:block">
                {canView('estimating') && (
                  <Link
                    href="/tools/takeoff"
                    prefetch={false}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isTakeoffToolsActive
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    <RulerIcon className="w-4 h-4 flex-shrink-0" />
                    Takeoff
                  </Link>
                )}
                {canView('scheduler') && (
                  <Link
                    href="/scheduler"
                    prefetch={false}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isSchedulerActive
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    <CalendarRangeIcon className="w-4 h-4 flex-shrink-0" />
                    Scheduler
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

      </nav>

      <div className="pb-2" />
    </div>
  )

  return (
    <>
      {/* Mobile top bar removed — replaced by GlobalHeader */}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60"
          style={{ top: 'calc(3rem + env(safe-area-inset-top, 0px))' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed left-0 bottom-0 z-40 w-64 bg-neutral-900 transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ top: 'calc(3rem + env(safe-area-inset-top, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="absolute right-3 top-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        {navContent}
      </div>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-56 bg-neutral-900 border-r border-neutral-800 fixed bottom-0 left-0"
        style={{ top: '3rem' }}
      >
        {navContent}
      </aside>

    </>
  )
}
