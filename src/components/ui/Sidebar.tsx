'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BriefcaseIcon, ClipboardListIcon, ImageIcon, CheckSquareIcon, CalendarIcon, CalendarRangeIcon, LogOutIcon, MenuIcon, XIcon, ShieldIcon, ReceiptIcon, ClockIcon, RulerIcon, FileTextIcon, DollarSignIcon, SettingsIcon, LayoutDashboardIcon, ClipboardCheckIcon, ChevronRightIcon, Building2Icon, BugIcon, FootprintsIcon, TrendingUpIcon, UsersIcon, PhoneIcon, TargetIcon, CalculatorIcon, CompassIcon } from 'lucide-react'
import ReportProblemButton from '@/components/bug-reports/ReportProblemButton'
import ReportProblemModal from '@/components/bug-reports/ReportProblemModal'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import NotificationBell from '@/components/ui/NotificationBell'

interface SidebarProps {
  userId: string
  userEmail?: string
  displayName?: string
  avatarUrl?: string
}

export default function Sidebar({ userId, userEmail, displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showMobileReportModal, setShowMobileReportModal] = useState(false)
  const [jobFeedExpanded, setJobFeedExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-job-feed-expanded') === 'true'
  })
  const [salesExpanded, setSalesExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-sales-expanded') === 'true'
  })
  const [estimatingExpanded, setEstimatingExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-estimating-expanded') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar-job-feed-expanded', String(jobFeedExpanded))
  }, [jobFeedExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-sales-expanded', String(salesExpanded))
  }, [salesExpanded])

  useEffect(() => {
    localStorage.setItem('sidebar-estimating-expanded', String(estimatingExpanded))
  }, [estimatingExpanded])

  const { settings: companySettings } = useCompanySettings()
  const { role, schedulerAccess } = useUserRole()
  const { canView } = usePermissions(role)
  const canSeeScheduler = role === 'admin' || schedulerAccess

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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
  const isProfileActive = pathname === '/profile'
  const isEstimatingActive = pathname === '/estimating'
  const isEstimatingEstimatesActive = pathname === '/estimates' || pathname.startsWith('/estimates/')
  const isEstimatingMeasurementsActive = pathname === '/job-takeoff' || pathname.startsWith('/job-takeoff/')
  const isEstimatingProjectTakeoffActive = pathname === '/estimating/project-takeoff' || pathname.startsWith('/estimating/project-takeoff/')
  const isSchedulerActive = pathname === '/scheduler' || pathname.startsWith('/scheduler/')
  // Keep Estimating section expanded when any sub-item is active
  useEffect(() => {
    if (isEstimatingEstimatesActive || isEstimatingMeasurementsActive || isEstimatingProjectTakeoffActive) {
      setEstimatingExpanded(true)
    }
  }, [isEstimatingEstimatesActive, isEstimatingMeasurementsActive, isEstimatingProjectTakeoffActive])
  const isJobWalkActive = pathname === '/job-walk' || pathname.startsWith('/job-walk/')
  const isBillingActive = pathname === '/billing'
  const isMyWorkActive = pathname === '/my-work'
  const isOfficeActive = pathname === '/office' || pathname.startsWith('/office/')
  const isSalesActive = pathname === '/sales'
  const isSalesCrmActive = pathname === '/sales/crm' || pathname.startsWith('/sales/crm/')
  const isSalesDialerActive = pathname === '/sales/dialer' || pathname.startsWith('/sales/dialer/')
  const isSalesAppointmentsActive = pathname === '/sales/appointments' || pathname.startsWith('/sales/appointments/')
  const isSalesLeadsActive = pathname === '/sales/leads' || pathname.startsWith('/sales/leads/')

  // Keep Sales section expanded when any sub-item is active
  useEffect(() => {
    if (isSalesCrmActive || isSalesDialerActive || isSalesAppointmentsActive || isSalesLeadsActive) {
      setSalesExpanded(true)
    }
  }, [isSalesCrmActive, isSalesDialerActive, isSalesAppointmentsActive, isSalesLeadsActive])

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'
  const userName = displayName || userEmail?.split('@')[0] || 'User'

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companySettings?.logo_url ? (
              <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#ffffff' }}>
                <Image
                  src={companySettings.logo_url}
                  alt="Company logo"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            )}
            <div>
              <div className="text-white font-semibold text-sm leading-tight">Peckham Coatings</div>
            </div>
          </div>
          <div className="hidden lg:block">
            <NotificationBell userId={userId} />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link
          href="/my-work"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isMyWorkActive
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <ClipboardCheckIcon className="w-5 h-5 flex-shrink-0" />
          My Work
        </Link>
        {(role === 'admin' || role === 'office_manager' || role === 'salesman') && (
          <Link
            href="/office"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isOfficeActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <BriefcaseIcon className="w-5 h-5 flex-shrink-0" />
            Office
          </Link>
        )}
        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-gray-800/60" />

        {(role === 'admin' || role === 'office_manager' || role === 'salesman') && (
          <div>
            <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
              isSalesActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
                maxHeight: salesExpanded ? '400px' : '0px',
                opacity: salesExpanded ? 1 : 0,
              }}
            >
              <Link
                href="/sales/crm"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSalesCrmActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <UsersIcon className="w-4 h-4 flex-shrink-0" />
                CRM
              </Link>
              <Link
                href="/sales/dialer"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSalesDialerActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                Dialer
              </Link>
              <Link
                href="/sales/appointments"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSalesAppointmentsActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                Appointments
              </Link>
              <Link
                href="/sales/leads"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSalesLeadsActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <TargetIcon className="w-4 h-4 flex-shrink-0" />
                Leads
              </Link>
            </div>
          </div>
        )}

        {(role === 'admin' || role === 'office_manager' || role === 'salesman') && (
          <Link
            href="/job-walk"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isJobWalkActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <FootprintsIcon className="w-5 h-5 flex-shrink-0" />
            Job Walk
          </Link>
        )}

        <div className="hidden md:block">
          <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
            isEstimatingActive
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}>
            <Link
              href="/estimating"
              onClick={() => setMobileOpen(false)}
              className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0"
            >
              <CalculatorIcon className="w-5 h-5 flex-shrink-0" />
              Estimating
            </Link>
            <button
              onClick={() => setEstimatingExpanded(!estimatingExpanded)}
              className="px-2 py-2.5 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
              aria-label={estimatingExpanded ? 'Collapse sub-items' : 'Expand sub-items'}
            >
              <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${estimatingExpanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{
              maxHeight: estimatingExpanded ? '400px' : '0px',
              opacity: estimatingExpanded ? 1 : 0,
            }}
          >
            <Link
              href="/estimates"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isEstimatingEstimatesActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <FileTextIcon className="w-4 h-4 flex-shrink-0" />
              Estimates
            </Link>
            <Link
              href="/job-takeoff"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isEstimatingMeasurementsActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <RulerIcon className="w-4 h-4 flex-shrink-0" />
              Measurements
            </Link>
            <Link
              href="/estimating/project-takeoff"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isEstimatingProjectTakeoffActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <CompassIcon className="w-4 h-4 flex-shrink-0" />
              Project Takeoff
            </Link>
          </div>
        </div>

        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-gray-800/60" />

        {canView('job_board') && (
          <Link
            href={jobBoardHref}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isJobBoardActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <LayoutDashboardIcon className="w-5 h-5 flex-shrink-0" />
            Job Board
          </Link>
        )}
        {canView('jobs') && (
          <div>
            <div className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
              isJobsActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
              <Link
                href={jobFeedHref}
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
                maxHeight: jobFeedExpanded ? '400px' : '0px',
                opacity: jobFeedExpanded ? 1 : 0,
              }}
            >
              {canView('daily_reports') && (
                <Link
                  href="/daily-reports"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isReportsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <ClipboardListIcon className="w-4 h-4 flex-shrink-0" />
                  Daily Reports
                </Link>
              )}
              {canView('jsa_reports') && (
                <Link
                  href="/jsa-reports"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isJsaReportsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <ShieldIcon className="w-4 h-4 flex-shrink-0" />
                  JSA Reports
                </Link>
              )}
              {canView('receipts') && (
                <Link
                  href="/receipts"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isReceiptsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <ReceiptIcon className="w-4 h-4 flex-shrink-0" />
                  Job Expenses
                </Link>
              )}
              {canView('timesheets') && (
                <Link
                  href="/timesheets"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isTimesheetsActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <ClockIcon className="w-4 h-4 flex-shrink-0" />
                  Timesheets
                </Link>
              )}
              {canView('photos') && (
                <Link
                  href="/photos"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isPhotosActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 flex-shrink-0" />
                  Photos
                </Link>
              )}
              {canView('tasks') && (
                <Link
                  href="/tasks"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isTasksActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <CheckSquareIcon className="w-4 h-4 flex-shrink-0" />
                  Field Tasks
                </Link>
              )}
            </div>
          </div>
        )}

        <Link
          href="/billing"
          onClick={() => setMobileOpen(false)}
          className={`hidden md:flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isBillingActive
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <DollarSignIcon className="w-5 h-5 flex-shrink-0" />
          Billing
        </Link>

        {/* Soft divider */}
        <div className="mx-3 my-2 border-t border-gray-800/60" />

        {canView('calendar') && (
          <Link
            href="/calendar"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isCalendarActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <CalendarIcon className="w-5 h-5 flex-shrink-0" />
            Calendar
          </Link>
        )}

        {canSeeScheduler && (
          <Link
            href="/scheduler"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isSchedulerActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <CalendarRangeIcon className="w-5 h-5 flex-shrink-0" />
            Scheduler
          </Link>
        )}

      </nav>

      {/* Report a Problem — desktop only; mobile shows it in the top header */}
      <div className="hidden lg:block px-3 pb-2">
        <ReportProblemButton role={role || 'crew'} userId={userId} />
      </div>

      {/* User / Profile / Sign Out */}
      <div className="px-3 py-4 border-t border-gray-800">
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full mb-1 ${
            isProfileActive
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-bold text-white">{initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate leading-tight">{userName}</p>
            {userEmail && displayName && (
              <p className="text-gray-500 text-xs truncate leading-tight">{userEmail}</p>
            )}
          </div>
          <SettingsIcon className="w-4 h-4 flex-shrink-0 text-gray-500 hover:text-white transition-colors" />
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full"
        >
          <LogOutIcon className="w-5 h-5 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar — safe-area-aware for notch */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-black border-b border-gray-800 flex items-center justify-between px-4 h-14" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Open menu"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            {companySettings?.logo_url ? (
              <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ffffff' }}>
                <Image
                  src={companySettings.logo_url}
                  alt="Company logo"
                  width={28}
                  height={28}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            )}
            <span className="text-white font-semibold text-sm">Peckham Coatings</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userId={userId} />
          <button
            onClick={() => setShowMobileReportModal(true)}
            className="text-amber-400 hover:text-amber-300 p-1.5 rounded-md hover:bg-gray-800 transition-colors"
            aria-label="Report a Problem"
          >
            <BugIcon className="w-5 h-5" />
          </button>
          <Link href="/profile" className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-bold text-white">{initials}</span>
              )}
            </div>
          </Link>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-black transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="absolute right-3" style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-gray-400 hover:text-white p-1.5 rounded-md hover:bg-gray-800"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        {navContent}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-black border-r border-gray-800 fixed top-0 bottom-0 left-0">
        {navContent}
      </aside>

      {showMobileReportModal && (
        <ReportProblemModal
          onClose={() => setShowMobileReportModal(false)}
          userId={userId}
        />
      )}
    </>
  )
}
