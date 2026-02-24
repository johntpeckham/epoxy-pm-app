'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UsersIcon, MailIcon, Loader2Icon, CheckIcon } from 'lucide-react'
import type { UserRole } from '@/types'

interface UserRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  email?: string
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'crew', label: 'Crew' },
]

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  salesman: 'bg-blue-100 text-blue-700',
  foreman: 'bg-amber-100 text-amber-700',
  crew: 'bg-gray-100 text-gray-600',
}

export default function UserManagement({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/list-users')
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to fetch users')
        setLoading(false)
        return
      }

      setUsers(result.users as UserRow[])
    } catch {
      setError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function handleRoleChange(userId: string, newRole: UserRole) {
    setUpdatingId(userId)
    setError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      setError(updateError.message)
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
    }
    setUpdatingId(null)
  }

  async function handleInviteUser() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(false)

    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to invite user')

      setInviteEmail('')
      setInviteSuccess(true)
      setTimeout(() => setInviteSuccess(false), 3000)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite user')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <UsersIcon className="w-5 h-5 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">User Management</h2>
      </div>
      <p className="text-xs text-gray-400 mb-5">Manage user roles and invite new team members.</p>

      {/* Invite Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Invite New User
        </h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
            />
          </div>
          <button
            onClick={handleInviteUser}
            disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {inviteSuccess ? (
              <>
                <CheckIcon className="w-4 h-4" />
                Sent
              </>
            ) : inviting ? (
              'Sending...'
            ) : (
              'Invite'
            )}
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-500 mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-xs text-green-600 mt-2">Invitation sent successfully!</p>}
      </div>

      {/* User List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-500">
                      {(user.display_name || user.email || '?')[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.display_name || user.email || 'Unnamed User'}
                    {user.id === currentUserId && (
                      <span className="text-xs text-gray-400 ml-1.5">(you)</span>
                    )}
                  </p>
                  {user.email && user.display_name && (
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {user.id === currentUserId ? (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE_COLORS[user.role]}`}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                ) : (
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    disabled={updatingId === user.id}
                    className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No users found.</p>
          )}
        </div>
      )}
    </div>
  )
}
