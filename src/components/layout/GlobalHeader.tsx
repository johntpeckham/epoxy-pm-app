'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SettingsIcon, LogOutIcon, MenuIcon, BugIcon, PencilIcon, BuildingIcon, UsersIcon, Building2Icon, DownloadIcon, MoonIcon, BarChart3Icon } from 'lucide-react'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { usePermissions } from '@/lib/usePermissions'
import { MonitorIcon } from 'lucide-react'
import NotificationBell from '@/components/ui/NotificationBell'
import NavigationSearch from '@/components/header/NavigationSearch'
import ReportProblemModal from '@/components/bug-reports/ReportProblemModal'
import { useTheme } from '@/components/theme/ThemeProvider'

interface GlobalHeaderProps {
  userId: string
  userEmail?: string
  displayName?: string
  avatarUrl?: string
}

export default function GlobalHeader({ userId, userEmail, displayName, avatarUrl }: GlobalHeaderProps) {
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showReportDropdown, setShowReportDropdown] = useState(false)
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false)
  const [commandCenterOpen, setCommandCenterOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const avatarDropdownRef = useRef<HTMLDivElement>(null)
  const reportDropdownRef = useRef<HTMLDivElement>(null)
  const settingsDropdownRef = useRef<HTMLDivElement>(null)
  const commandCenterRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { settings: companySettings } = useCompanySettings()
  const { canView } = usePermissions()
  const { theme, toggleTheme } = useTheme()
  const isDarkMode = theme === 'dark'

  const hasAnySettingsAccess =
    canView('company_info') ||
    canView('user_management') ||
    canView('employee_management') ||
    canView('sales_management') ||
    canView('vendor_management') ||
    canView('warranty_management') ||
    canView('prelien_management') ||
    canView('material_management') ||
    canView('job_feed_forms') ||
    canView('job_reports') ||
    canView('checklist_templates') ||
    canView('data_export') ||
    canView('reports') ||
    canView('trash_bin')

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function closeAllDropdowns() {
    setAvatarDropdownOpen(false)
    setShowReportDropdown(false)
    setSettingsDropdownOpen(false)
    setCommandCenterOpen(false)
    setNotificationsOpen(false)
  }

  function openMobileSidebar() {
    window.dispatchEvent(new Event('open-mobile-sidebar'))
  }

  function openCommandCenter() {
    const w = Math.min(1920, typeof window !== 'undefined' ? window.screen?.availWidth || 1920 : 1920)
    const h = Math.min(1080, typeof window !== 'undefined' ? window.screen?.availHeight || 1080 : 1080)
    const features = `width=${w},height=${h},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`
    window.open('/admin/command-center', 'peckham_command_center', features)
  }

  useEffect(() => {
    const anyOpen = avatarDropdownOpen || showReportDropdown || settingsDropdownOpen || commandCenterOpen || notificationsOpen
    if (!anyOpen) return

    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(target)) {
        setAvatarDropdownOpen(false)
      }
      if (reportDropdownRef.current && !reportDropdownRef.current.contains(target)) {
        setShowReportDropdown(false)
      }
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(target)) {
        setSettingsDropdownOpen(false)
      }
      if (commandCenterRef.current && !commandCenterRef.current.contains(target)) {
        setCommandCenterOpen(false)
      }
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationsOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeAllDropdowns()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [avatarDropdownOpen, showReportDropdown, settingsDropdownOpen, commandCenterOpen, notificationsOpen])

  return (
    <>
    <header
      className="fixed top-0 left-0 right-0 z-50 h-12 bg-[#1a1a1a] flex items-center justify-between px-4"
      style={{
        borderBottom: '0.5px solid #333',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(3rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={openMobileSidebar}
          className="lg:hidden text-gray-400 hover:text-white p-1"
          aria-label="Open menu"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <Link href="/my-work" prefetch={false} className="flex items-center gap-2.5">
          {companySettings?.logo_url ? (
            <div className="w-7 h-7 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#ffffff' }}>
              <Image
                src={companySettings.logo_url}
                alt="Company logo"
                width={28}
                height={28}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          <span className="text-white font-semibold text-sm hidden sm:inline">Peckham Coatings</span>
        </Link>
      </div>

      <div className="relative flex items-center gap-2">
        <NavigationSearch />
        {canView('command_center') && (
          <div ref={commandCenterRef}>
            <button
              onClick={() => {
                if (commandCenterOpen) {
                  setCommandCenterOpen(false)
                } else {
                  closeAllDropdowns()
                  setCommandCenterOpen(true)
                }
              }}
              className={`p-1.5 transition-colors rounded-lg ${commandCenterOpen ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              aria-label="Command Center menu"
              aria-expanded={commandCenterOpen}
            >
              <MonitorIcon className="w-[18px] h-[18px]" />
            </button>
            {commandCenterOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-56 bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50"
              >
                <button
                  role="menuitem"
                  onClick={() => { setCommandCenterOpen(false); openCommandCenter() }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <MonitorIcon className="w-4 h-4 flex-shrink-0" />
                  Open Command Center
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={notificationRef}>
          <NotificationBell
            userId={userId}
            isOpen={notificationsOpen}
            onOpenChange={(open) => {
              if (open) closeAllDropdowns()
              setNotificationsOpen(open)
            }}
          />
        </div>
        <div ref={reportDropdownRef}>
          <button
            onClick={() => {
              if (canView('bug_reports')) {
                if (showReportDropdown) {
                  setShowReportDropdown(false)
                } else {
                  closeAllDropdowns()
                  setShowReportDropdown(true)
                }
              } else {
                closeAllDropdowns()
                setShowReportModal(true)
              }
            }}
            className={`p-1.5 transition-colors rounded-lg ${showReportDropdown ? 'text-amber-400 bg-white/10' : 'text-amber-500 hover:text-amber-400 hover:bg-white/10'}`}
            aria-label="Report a problem"
            title="Report a Problem"
          >
            <BugIcon className="w-[18px] h-[18px]" />
          </button>
          {showReportDropdown && canView('bug_reports') && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50">
              <button
                onClick={() => { setShowReportDropdown(false); setShowReportModal(true) }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <BugIcon className="w-4 h-4" />
                Report a Problem
              </button>
              <div className="border-t border-[#3a3a3a]" />
              <button
                onClick={() => { setShowReportDropdown(false); router.push('/bug-reports') }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                View All Reports
              </button>
            </div>
          )}
        </div>
        <div ref={settingsDropdownRef}>
          <button
            onClick={() => {
              if (settingsDropdownOpen) {
                setSettingsDropdownOpen(false)
              } else {
                closeAllDropdowns()
                setSettingsDropdownOpen(true)
              }
            }}
            className={`p-1.5 transition-colors rounded-lg ${settingsDropdownOpen ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            aria-label="Settings menu"
            aria-expanded={settingsDropdownOpen}
          >
            <SettingsIcon className="w-[18px] h-[18px]" />
          </button>
          {settingsDropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1.5 w-56 sm:w-56 max-sm:right-[-8px] max-sm:w-[calc(100vw-16px)] bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50"
            >
              <button
                role="menuitem"
                onClick={() => { setSettingsDropdownOpen(false); router.push('/profile?edit=1') }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
              >
                <PencilIcon className="w-4 h-4 flex-shrink-0" />
                Edit profile
              </button>
              {canView('company_info') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/profile?section=company-info') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <BuildingIcon className="w-4 h-4 flex-shrink-0" />
                  Company info
                </button>
              )}
              {canView('user_management') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/settings/users') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <UsersIcon className="w-4 h-4 flex-shrink-0" />
                  User management
                </button>
              )}
              {canView('employee_management') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/profile?section=employee-management') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <UsersIcon className="w-4 h-4 flex-shrink-0" />
                  Employee management
                </button>
              )}
              {canView('vendor_management') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/profile?section=vendor-management') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <Building2Icon className="w-4 h-4 flex-shrink-0" />
                  Vendor management
                </button>
              )}
              {canView('data_export') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/data-export') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <DownloadIcon className="w-4 h-4 flex-shrink-0" />
                  Data export
                </button>
              )}
              {canView('reports') && (
                <button
                  role="menuitem"
                  onClick={() => { setSettingsDropdownOpen(false); router.push('/reports') }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                >
                  <BarChart3Icon className="w-4 h-4 flex-shrink-0" />
                  Reports
                </button>
              )}
              <div
                role="menuitem"
                className="flex items-center justify-between w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
              >
                <div className="flex items-center gap-2.5">
                  <MoonIcon className="w-4 h-4 flex-shrink-0" />
                  Dark mode
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDarkMode}
                  aria-label="Toggle dark mode"
                  onClick={(e) => { e.stopPropagation(); toggleTheme() }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDarkMode ? 'bg-amber-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {hasAnySettingsAccess && (
                <>
                  <div className="border-t border-[#3a3a3a]" />
                  <button
                    role="menuitem"
                    onClick={() => { setSettingsDropdownOpen(false); router.push('/profile') }}
                    className="flex items-center justify-center w-full px-3 py-2.5 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors min-h-[44px]"
                  >
                    View all settings
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="relative" ref={avatarDropdownRef}>
          <button
            onClick={() => {
              if (avatarDropdownOpen) {
                setAvatarDropdownOpen(false)
              } else {
                closeAllDropdowns()
                setAvatarDropdownOpen(true)
              }
            }}
            className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-amber-500/50 transition-all"
          >
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
          </button>
          {avatarDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50">
              <button
                onClick={() => { setAvatarDropdownOpen(false); router.push('/profile?edit=1') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <PencilIcon className="w-4 h-4" />
                Edit profile
              </button>
              <div className="border-t border-[#3a3a3a]" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOutIcon className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
      {showReportModal && (
        <ReportProblemModal
          onClose={() => setShowReportModal(false)}
          userId={userId}
        />
      )}
    </>
  )
}
