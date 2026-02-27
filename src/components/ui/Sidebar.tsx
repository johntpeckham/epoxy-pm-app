'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BriefcaseIcon, ClipboardListIcon, ImageIcon, CheckSquareIcon, CalendarIcon, LogOutIcon, MenuIcon, XIcon, ShieldIcon } from 'lucide-react'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const { settings: companySettings } = useCompanySettings()
  const { role } = useUserRole()
  const { canView } = usePermissions(role)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isJobsActive = pathname === '/jobs' || pathname.startsWith('/projects')
  const isReportsActive = pathname === '/daily-reports'
  const isJsaReportsActive = pathname === '/jsa-reports'
  const isPhotosActive = pathname === '/photos'
  const isTasksActive = pathname === '/tasks'
  const isCalendarActive = pathname === '/calendar'
  const isProfileActive = pathname === '/profile'

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'
  const userName = displayName || userEmail?.split('@')[0] || 'User'

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companySettings?.logo_url ? (
              <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
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
        {canView('jobs') && (
          <Link
            href="/jobs"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isJobsActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <BriefcaseIcon className="w-5 h-5 flex-shrink-0" />
            Jobs
          </Link>
        )}
        {canView('daily_reports') && (
          <Link
            href="/daily-reports"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isReportsActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <ClipboardListIcon className="w-5 h-5 flex-shrink-0" />
            Daily Reports
          </Link>
        )}
        {canView('jsa_reports') && (
          <Link
            href="/jsa-reports"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isJsaReportsActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <ShieldIcon className="w-5 h-5 flex-shrink-0" />
            JSA Reports
          </Link>
        )}
        {canView('photos') && (
          <Link
            href="/photos"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isPhotosActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <ImageIcon className="w-5 h-5 flex-shrink-0" />
            Photos
          </Link>
        )}
        {canView('tasks') && (
          <Link
            href="/tasks"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isTasksActive
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <CheckSquareIcon className="w-5 h-5 flex-shrink-0" />
            Tasks
          </Link>
        )}
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
      </nav>

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
              <div className="w-7 h-7 rounded-md overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
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
      >
        <div className="absolute top-3 right-3">
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
    </>
  )
}
