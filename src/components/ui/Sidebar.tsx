'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BriefcaseIcon, ClipboardListIcon, ImageIcon, CheckSquareIcon, CalendarIcon, CalendarRangeIcon, XIcon, ShieldIcon, ReceiptIcon, ClockIcon, DollarSignIcon, LayoutDashboardIcon, ClipboardCheckIcon, ChevronRightIcon, FootprintsIcon, TrendingUpIcon, UsersIcon, PhoneIcon, MailIcon, TargetIcon, CalculatorIcon, MegaphoneIcon, WrenchIcon } from 'lucide-react'
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
  const [jobBoardExpanded, setJobBoardExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-job-board-expanded') === 'true'
  })
  const [salesExpanded, setSalesExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-sales-expanded') === 'true'
  })
  const [toolsExpanded, setToolsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-tools-expanded') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar-job-feed-expanded', String(jobFeedExpanded))
  }, [jobFeedExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-job-board-expanded', String(jobBoardExpanded))
  }, [jobBoardExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-sales-expanded', String(salesExpanded))
  }, [salesExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-tools-expanded', String(toolsExpanded))
  }, [toolsExpanded])

  const { canView, isHiddenFromSidebar } = usePermissions()
  // Sales section is shown when the user can view any sales sub-feature.
  const canViewSales =
    canView('crm') ||
    canView('dialer') ||
    canView('emailer') ||
    canView('leads') ||
    canView('appointments') ||
    canView('estimating') ||
    canView('job_walk')

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
  const isMarketingActive = pathname === '/marketing' || pathname.startsWith('/marketing/')
  const isBillingActive = pathname === '/billing'
  const isMyWorkActive = pathname === '/my-work'
  const isOfficeActive = pathname === '/office' || pathname.startsWith('/office/')
  const isSalesActive = pathname === '/sales'
  const isSalesCrmActive = pathname === '/sales/crm' || pathname.startsWith('/sales/crm/')
  const isSalesDialerActive = pathname === '/sales/dialer' || pathname.startsWith('/sales/dialer/')
  const isSalesEmailerActive = pathname === '/sales/emailer' || pathname.startsWith('/sales/emailer/')
  const isSalesAppointmentsActive = pathname === '/sales/appointments' || pathname.startsWith('/sales/appointments/')
  const isSalesLeadsActive = pathname === '/sales/leads' || pathname.startsWith('/sales/leads/')
  const isJobWalkActive = pathname === '/job-walk' || pathname.startsWith('/job-walk/')
  const isEstimatingActive =
    pathname === '/estimating' || pathname.startsWith('/estimating/')

  // Keep Sales section expanded when any sub-item is active
  useEffect(() => {
    if (
      isSalesCrmActive ||
      isSalesDialerActive ||
      isSalesEmailerActive ||
      isSalesAppointmentsActive ||
      isSalesLeadsActive ||
      isJobWalkActive
    ) {
      setSalesExpanded(true)
    }
  }, [
    isSalesCrmActive,
    isSalesDialerActive,
    isSalesEmailerActive,
    isSalesAppointmentsActive,
    isSalesLeadsActive,
    isJobWalkActive,
  ])

  useEffect(() => {
    if (
      isJobsActive ||
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
    isJobsActive,
    isReportsActive,
    isJsaReportsActive,
    isReceiptsActive,
    isTimesheetsActive,
    isPhotosActive,
    isTasksActive,
  ])

  // Auto-open the Job Board group when Job Board itself is active OR any
  // descendant route (Job Feed and its children) is active, so the user
  // doesn't have to manually expand two levels to reach where they are.
  useEffect(() => {
    if (
      isJobBoardActive ||
      isJobsActive ||
      isReportsActive ||
      isJsaReportsActive ||
      isReceiptsActive ||
      isTimesheetsActive ||
      isPhotosActive ||
      isTasksActive
    ) {
      setJobBoardExpanded(true)
    }
  }, [
    isJobBoardActive,
    isJobsActive,
    isReportsActive,
    isJsaReportsActive,
    isReceiptsActive,
    isTimesheetsActive,
    isPhotosActive,
    isTasksActive,
  ])

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <nav className="flex-1 px-3 pt-3 pb-4 space-y-1">
        <Link
          href="/my-work"
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
        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-neutral-800/60" />

        {canViewSales && (
          <div>
            <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
              isSalesActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-neutral-800'
            }`}>
              <Link
                href="/sales"
                onClick={() => setMobileOpen(false)}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0"
              >
                <TrendingUpIcon className="w-5 h-5 flex-shrink-0" />
                Sales
              </Link>
              <button
                onClick={() => setSalesExpanded(!salesExpanded)}
                className="px-2 py-2.5 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
                aria-label={salesExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
              >
                <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${salesExpanded ? 'rotate-90' : ''}`} />
              </button>
            </div>
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxHeight: salesExpanded ? '600px' : '0px',
                opacity: salesExpanded ? 1 : 0,
              }}
            >
              {canView('crm') && (
                <Link
                  href="/sales/crm"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSalesCrmActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <UsersIcon className="w-4 h-4 flex-shrink-0" />
                  CRM
                </Link>
              )}
              {canView('dialer') && (
                <Link
                  href="/sales/dialer"
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
              {canView('appointments') && (
                <Link
                  href="/sales/appointments"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSalesAppointmentsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                  Appointments
                </Link>
              )}
              {canView('leads') && (
                <Link
                  href="/sales/leads"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSalesLeadsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <TargetIcon className="w-4 h-4 flex-shrink-0" />
                  Leads
                </Link>
              )}
              {canView('job_walk') && (
                <Link
                  href="/job-walk"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isJobWalkActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <FootprintsIcon className="w-4 h-4 flex-shrink-0" />
                  Job Walk
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-neutral-800/60" />

        {canView('estimating') && (
          <Link
            href="/estimating"
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

        {/* Job Board — chevron group whose only child is the Job Feed
            chevron group (a "child group"). Mirrors the Sales two-click-
            target pattern: the Link area navigates to /job-board, the
            chevron toggles expand/collapse. */}
        {canView('job_board') && (
          <div>
            <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
              isJobBoardActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-neutral-800'
            }`}>
              <Link
                href={jobBoardHref}
                onClick={() => setMobileOpen(false)}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0"
              >
                <LayoutDashboardIcon className="w-5 h-5 flex-shrink-0" />
                Job Board
              </Link>
              <button
                onClick={() => setJobBoardExpanded(!jobBoardExpanded)}
                className="px-2 py-2.5 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
                aria-label={jobBoardExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
              >
                <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${jobBoardExpanded ? 'rotate-90' : ''}`} />
              </button>
            </div>
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxHeight: jobBoardExpanded ? '800px' : '0px',
                opacity: jobBoardExpanded ? 1 : 0,
              }}
            >
              {/* Job Feed — child of Job Board, AND a chevron group of
                  its own. Indented one level (pl-6 on the Link area to
                  match other child links); its own children indent one
                  more level (pl-10). */}
              {canView('jobs') && (
                <div>
                  <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                    isJobsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                  }`}>
                    <Link
                      href={jobFeedHref}
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 flex items-center gap-2.5 pl-6 pr-3 py-2 min-w-0"
                    >
                      <BriefcaseIcon className="w-4 h-4 flex-shrink-0" />
                      Job Feed
                    </Link>
                    <button
                      onClick={() => setJobFeedExpanded(!jobFeedExpanded)}
                      className="px-2 py-2 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
            </div>
          </div>
        )}

        {canView('billing') && (
          <Link
            href="/billing"
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

        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-neutral-800/60" />

        {canView('calendar') && (
          <Link
            href="/calendar"
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

        {/* Tools — chevron group with NO destination route. Scheduler is
            the only child today. The desktop-only `hidden lg:block` on
            the wrapper preserves Scheduler's existing visibility rule
            (its ancestor — and thus the whole group — is hidden on
            mobile / tablet). The group hides entirely if no children
            are visible to this user. */}
        {canView('scheduler') && (
          <div className="hidden lg:block">
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
              <Link
                href="/scheduler"
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
