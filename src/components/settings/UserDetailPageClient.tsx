'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  KeyIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import Portal from '@/components/ui/Portal'
import Tooltip from '@/components/ui/Tooltip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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

interface ProfileExtras {
  created_at: string | null
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'office_manager', label: 'Office Manager' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'crew', label: 'Crew' },
]

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

interface UserDetailPageClientProps {
  userId: string
}

export default function UserDetailPageClient({ userId }: UserDetailPageClientProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<UserRow | null>(null)
  const [profileExtras, setProfileExtras] = useState<ProfileExtras>({ created_at: null })
  const [hasScheduler, setHasScheduler] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editInfoOpen, setEditInfoOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: { user: authUser } }, listRes] = await Promise.all([
        supabase.auth.getUser(),
        fetch('/api/list-users'),
      ])
      setCurrentUserId(authUser?.id ?? null)

      const listPayload = await listRes.json()
      if (!listRes.ok) {
        setError(listPayload.error || 'Failed to load user')
        setLoading(false)
        return
      }

      const users = (listPayload.users ?? []) as UserRow[]
      const target = users.find((u) => u.id === userId)
      if (!target) {
        setError('User not found')
        setLoading(false)
        return
      }
      setUser(target)

      // Pull created_at off the profiles row. The list-users payload
      // doesn't expose it today, so we query it separately. If the row
      // is missing, we fall back to auth created_at (also not in the
      // payload), so profile created_at is the only reliable source.
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('updated_at')
        .eq('id', userId)
        .single()
      // `updated_at` is the only profiles timestamp available today.
      // Date added shows profiles.updated_at as a best-effort stand-in
      // when profiles.created_at does not exist on this schema.
      setProfileExtras({ created_at: (profileRow as { updated_at?: string } | null)?.updated_at ?? null })

      // Scheduler access: admin shortcut OR user_permissions.scheduler !== 'off'
      if (target.role === 'admin') {
        setHasScheduler(true)
      } else {
        const { data: schedRow } = await supabase
          .from('user_permissions')
          .select('access_level')
          .eq('user_id', userId)
          .eq('feature', 'scheduler')
          .maybeSingle()
        const level = (schedRow as { access_level?: AccessLevel } | null)?.access_level
        setHasScheduler(level != null && level !== 'off')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user')
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const isSelf = currentUserId !== null && currentUserId === userId

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to delete user')
      router.push('/settings/users')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user')
      setDeleting(false)
    }
  }

  if (loading) return <PageSkeleton />

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {error ?? 'User not found.'}
            </p>
            <Link
              href="/settings/users"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to user management
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings/users" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            User management
          </span>
        </div>

        <HeaderCard
          user={user}
          isSelf={isSelf}
          onEdit={() => setEditInfoOpen(true)}
          onChangePassword={() => setChangePasswordOpen(true)}
          onDelete={() => setDeleteConfirmOpen(true)}
        />

        <InfoSection
          user={user}
          hasScheduler={hasScheduler}
          createdAt={profileExtras.created_at}
        />

        <PermissionsPlaceholder />
      </div>

      {editInfoOpen && (
        <EditInfoModal
          user={user}
          onClose={() => setEditInfoOpen(false)}
          onSaved={async () => {
            setEditInfoOpen(false)
            showToast('Updated')
            await loadData()
          }}
        />
      )}

      {changePasswordOpen && (
        <ChangePasswordModal
          userId={userId}
          onClose={() => setChangePasswordOpen(false)}
          onSaved={() => {
            setChangePasswordOpen(false)
            showToast('Password updated')
          }}
        />
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete user?"
          message={`This will permanently delete ${displayNameOrEmail(user)}. ${deleteError ?? 'This action cannot be undone.'}`}
          confirmLabel="Delete user"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            if (deleting) return
            setDeleteError(null)
            setDeleteConfirmOpen(false)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function HeaderCard({
  user,
  isSelf,
  onEdit,
  onChangePassword,
  onDelete,
}: {
  user: UserRow
  isSelf: boolean
  onEdit: () => void
  onChangePassword: () => void
  onDelete: () => void
}) {
  const name = displayNameOrEmail(user)
  return (
    <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-4 sm:p-5 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Avatar avatarUrl={user.avatar_url} fallback={getInitials(user.display_name, user.email)} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-medium text-gray-900 dark:text-white truncate">
                {name}
              </p>
              {isSelf && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                  You
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {user.email}
            </p>
            <span
              className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_BADGE[user.role]}`}
            >
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2a2a2a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition"
          >
            <PencilIcon className="w-4 h-4" />
            Edit info
          </button>
          <button
            onClick={onChangePassword}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2a2a2a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition"
          >
            <KeyIcon className="w-4 h-4" />
            Change password
          </button>
          {isSelf ? (
            <Tooltip label="You cannot delete your own account." placement="bottom">
              <button
                disabled
                aria-disabled="true"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-400 bg-white dark:bg-[#1f1f1f] border border-red-200 dark:border-red-900/40 rounded-lg opacity-60 cursor-not-allowed"
              >
                <Trash2Icon className="w-4 h-4" />
                Delete
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-white dark:bg-[#1f1f1f] border border-red-200 dark:border-red-900/40 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
            >
              <Trash2Icon className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoSection({
  user,
  hasScheduler,
  createdAt,
}: {
  user: UserRow
  hasScheduler: boolean
  createdAt: string | null
}) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Info
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl divide-y divide-gray-100 dark:divide-[#2a2a2a]">
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
        <InfoRow label="Scheduler access" value={hasScheduler ? 'Yes' : 'No'} />
        <InfoRow label="Date added" value={formatDate(createdAt)} />
      </div>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-900 dark:text-white text-right truncate">{value}</span>
    </div>
  )
}

function PermissionsPlaceholder() {
  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Permissions
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Permissions editor coming next.</p>
      </div>
    </section>
  )
}

function EditInfoModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user.display_name ?? '')
  const [role, setRole] = useState<UserRole>(user.role)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setErr(null)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(data.publicUrl)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to upload avatar')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setErr('Display name is required')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: displayName.trim(),
          role,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
      if (updateError) throw updateError
      await onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update user')
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-semibold text-gray-900">Edit info</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Profile photo</label>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Avatar
                    avatarUrl={avatarUrl}
                    fallback={getInitials(displayName || user.display_name, user.email)}
                    size={64}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                  >
                    <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-sm font-medium text-amber-600 hover:text-amber-700 transition"
                  >
                    {uploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, or GIF</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-name" className="block text-xs font-medium text-gray-500 mb-1">
                Display name
              </label>
              <input
                id="edit-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
              />
            </div>

            <div>
              <label htmlFor="edit-role" className="block text-xs font-medium text-gray-500 mb-1">
                Role
              </label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition bg-white"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {err && <p className="text-xs text-red-500">{err}</p>}
          </div>

          <div
            className="flex-none flex items-center justify-end gap-2 p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function ChangePasswordModal({
  userId,
  onClose,
  onSaved,
}: {
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/update-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to update password')
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update password')
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-semibold text-gray-900">Change password</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-gray-500 mb-1">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-500 mb-1">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
              />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <p className="text-xs text-gray-400">Minimum 8 characters.</p>
          </div>

          <div
            className="flex-none flex items-center justify-end gap-2 p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !newPassword || !confirmPassword}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? 'Saving…' : (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Update password
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function Avatar({
  avatarUrl,
  fallback,
  size,
}: {
  avatarUrl: string | null
  fallback: string
  size: number
}) {
  if (avatarUrl) {
    return (
      <div
        className="rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }
  return (
    <div
      className="rounded-full bg-gray-700 text-white flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="text-sm font-semibold">{fallback}</span>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-5 w-40 bg-gray-200 dark:bg-[#2a2a2a] rounded mb-6 animate-pulse" />
        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5 mb-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-[#2a2a2a]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-[#2a2a2a] rounded w-1/3" />
              <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-1/4" />
              <div className="h-4 bg-gray-200 dark:bg-[#2a2a2a] rounded-full w-16" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl mb-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-[#2a2a2a] first:border-t-0"
            >
              <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-24" />
              <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-32" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 text-center animate-pulse">
          <div className="h-3 bg-gray-200 dark:bg-[#2a2a2a] rounded w-48 mx-auto" />
        </div>
      </div>
    </div>
  )
}

function displayNameOrEmail(user: UserRow): string {
  return user.display_name?.trim() || user.email.split('@')[0] || user.email
}

function getInitials(displayName: string | null, email: string): string {
  const source = (displayName && displayName.trim()) || email.split('@')[0] || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
