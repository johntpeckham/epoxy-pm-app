'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BriefcaseIcon, ClipboardListIcon, LogOutIcon, MenuIcon, XIcon } from 'lucide-react'

interface SidebarProps {
  userEmail?: string
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isJobsActive = pathname === '/jobs' || pathname.startsWith('/projects')
  const isReportsActive = pathname === '/daily-reports'

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Peckham Coatings</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
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
      </nav>

      {/* User / Sign Out */}
      <div className="px-3 py-4 border-t border-gray-800">
        {userEmail && (
          <div className="px-3 py-2 mb-2">
            <p className="text-gray-500 text-xs truncate">{userEmail}</p>
          </div>
        )}
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
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-black border-b border-gray-800 flex items-center px-4 h-14">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-gray-400 hover:text-white p-1"
          aria-label="Open menu"
        >
          <MenuIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm">Peckham Coatings</span>
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
