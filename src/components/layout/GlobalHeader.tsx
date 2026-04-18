'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SettingsIcon, LogOutIcon, MenuIcon } from 'lucide-react'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import { MonitorIcon } from 'lucide-react'
import NotificationBell from '@/components/ui/NotificationBell'

interface GlobalHeaderProps {
  userId: string
  userEmail?: string
  displayName?: string
  avatarUrl?: string
}

export default function GlobalHeader({ userId, userEmail, displayName, avatarUrl }: GlobalHeaderProps) {
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false)
  const avatarDropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { settings: companySettings } = useCompanySettings()
  const { role } = useUserRole()

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
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
    function handleClick(e: MouseEvent) {
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(e.target as Node)) {
        setAvatarDropdownOpen(false)
      }
    }
    if (avatarDropdownOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [avatarDropdownOpen])

  return (
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
        <Link href="/my-work" className="flex items-center gap-2.5">
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

      <div className="flex items-center gap-2">
        {role === 'admin' && (
          <button
            onClick={openCommandCenter}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Command center"
            title="Command center"
          >
            <MonitorIcon className="w-[18px] h-[18px]" />
          </button>
        )}
        <NotificationBell userId={userId} />
        <Link
          href="/profile"
          className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
          aria-label="Settings"
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
        </Link>
        <div className="relative" ref={avatarDropdownRef}>
          <button
            onClick={() => setAvatarDropdownOpen(!avatarDropdownOpen)}
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
              <Link
                href="/profile"
                onClick={() => setAvatarDropdownOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <SettingsIcon className="w-4 h-4" />
                Settings
              </Link>
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
  )
}
