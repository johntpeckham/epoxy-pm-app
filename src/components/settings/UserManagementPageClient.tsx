'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeftIcon, UsersIcon, ShieldIcon, PlusIcon, CalendarRangeIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AccessLevel, UserRole } from '@/types'

interface UserRow {
  id: string
  email: string
  email_confirmed_at: string | null
  display_name: string | null
  avatar_url: string | null
  role: UserRole
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  salesman: 'Salesman',
  office_manager: 'Office Manager',
  foreman: 'Foreman',
  crew: 'Crew',
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  salesman: 'bg-blue-100 text-blue-700',
  office_manager: 'bg-purple-100 text-purple-700',
  foreman: 'bg-amber-100 text-amber-700',
  crew: 'bg-gray-100 text-gray-600',
}

interface UserManagementPageClientProps {
  currentUserId: string
}

export default function UserManagementPageClient({ currentUserId }: UserManagementPageClientProps) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [schedulerUserIds, setSchedulerUserIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/list-users')
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to load users')
        setUsers([])
        setSchedulerUserIds(new Set())
        setLoading(false)
        return
      }

      const fetched = (result.users ?? []) as UserRow[]
      setUsers(fetched)

      // Batch-fetch scheduler permission for every non-admin user. Admins
      // get the scheduler badge via the hook shortcut and are not stored
      // in user_permissions.
      const nonAdminIds = fetched.filter((u) => u.role !== 'admin').map((u) => u.id)

      if (nonAdminIds.length === 0) {
        setSchedulerUserIds(new Set())
      } else {
        const supabase = createClient()
        const { data: rows } = await supabase
          .from('user_permissions')
          .select('user_id, access_level')
          .eq('feature', 'scheduler')
          .in('user_id', nonAdminIds)

        const ids = new Set<string>()
        for (const row of (rows ?? []) as { user_id: string; access_level: AccessLevel }[]) {
          if (row.access_level !== 'off') ids.add(row.user_id)
        }
        setSchedulerUserIds(ids)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
      setUsers([])
      setSchedulerUserIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <Header />

        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message={error} onRetry={loadUsers} />
        ) : users.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                isCurrentUser={u.id === currentUserId}
                hasScheduler={u.role === 'admin' || schedulerUserIds.has(u.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 min-w-0 mb-2">
        <Link href="/profile" className="flex-shrink-0">
          <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
        </Link>
        <UsersIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
          User management
        </h1>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl">
          Manage users who have access to the app. Edit individual permissions by clicking a user.
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/permissions"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition"
          >
            <ShieldIcon className="w-4 h-4" />
            User permissions
          </Link>
          <Link
            href="/settings/users/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
          >
            <PlusIcon className="w-4 h-4" />
            Add user
          </Link>
        </div>
      </div>
    </div>
  )
}

function UserCard({
  user,
  isCurrentUser,
  hasScheduler,
}: {
  user: UserRow
  isCurrentUser: boolean
  hasScheduler: boolean
}) {
  const displayName = user.display_name?.trim() || user.email.split('@')[0]
  const initials = getInitials(user.display_name, user.email)
  const roleLabel = ROLE_LABEL[user.role] ?? user.role
  const roleBadge = ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'

  return (
    <Link
      href={`/settings/users/${user.id}`}
      className="group block bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-4 hover:border-amber-300 dark:hover:border-amber-500/40 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition"
    >
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={user.avatar_url} initials={initials} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-gray-900 dark:text-white truncate">
            {displayName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${roleBadge}`}>
          {roleLabel}
        </span>
        {hasScheduler && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
            <CalendarRangeIcon className="w-3 h-3" />
            Scheduler
          </span>
        )}
        {isCurrentUser && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900">
            You
          </span>
        )}
      </div>
    </Link>
  )
}

function Avatar({ avatarUrl, initials }: { avatarUrl: string | null; initials: string }) {
  if (avatarUrl) {
    return (
      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
        <Image
          src={avatarUrl}
          alt=""
          width={48}
          height={48}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }
  return (
    <div className="w-12 h-12 rounded-full bg-gray-700 text-white flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-semibold">{initials}</span>
    </div>
  )
}

function getInitials(displayName: string | null, email: string): string {
  const source = (displayName && displayName.trim()) || email.split('@')[0] || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-[#2a2a2a]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 dark:bg-[#2a2a2a] rounded w-2/3" />
              <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-1/2" />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <div className="h-5 bg-gray-200 dark:bg-[#2a2a2a] rounded-full w-16" />
            <div className="h-5 bg-gray-200 dark:bg-[#2a2a2a] rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-8 text-center">
      <UsersIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p className="text-sm font-medium text-gray-900 dark:text-white">No users found.</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Add your first user to grant them access to the app.
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white dark:bg-[#242424] border border-red-200 dark:border-red-900/40 rounded-xl p-6 text-center">
      <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load users.</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 border border-amber-200 rounded-lg transition"
      >
        Try again
      </button>
    </div>
  )
}
