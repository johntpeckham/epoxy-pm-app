'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  AlertTriangleIcon,
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
import {
  FEATURE_KEYS,
  FEATURE_METADATA,
  type FeatureCategory,
  type FeatureKey,
} from '@/lib/featureKeys'
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

interface RoleChangeRequest {
  oldRole: UserRole
  newRole: UserRole
  displayName: string
  /** Count of user_permissions rows the user had at dialog-open time.
   *  Used to show the "no saved permissions" warning in the admin → non-admin
   *  case. */
  existingPermissionCount: number
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

// Mirror of PermissionsClient's level palette so the per-user editor reads
// identically to the template editor.
const ACCESS_OPTIONS: { value: AccessLevel; label: string; activeColor: string }[] = [
  { value: 'full',      label: 'Full',      activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'create',    label: 'Create',    activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'view_only', label: 'View only', activeColor: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'off',       label: 'Off',       activeColor: 'border-gray-500 bg-gray-500 text-white' },
]

const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  core:      'Core',
  job_board: 'Job Board',
  sales:     'Sales',
  office:    'Office',
  settings:  'Settings',
  other:     'Other',
}

const ORDERED_FEATURES: { feature: FeatureKey; displayName: string; category: FeatureCategory; sortOrder: number }[] =
  FEATURE_KEYS.map((feature) => ({ feature, ...FEATURE_METADATA[feature] })).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

const CATEGORY_ORDER: FeatureCategory[] = (() => {
  const seen = new Set<FeatureCategory>()
  const order: FeatureCategory[] = []
  for (const f of ORDERED_FEATURES) {
    if (!seen.has(f.category)) {
      seen.add(f.category)
      order.push(f.category)
    }
  }
  return order
})()

const FEATURES_BY_CATEGORY: Record<FeatureCategory, typeof ORDERED_FEATURES> = (() => {
  const grouped = { core: [], job_board: [], sales: [], office: [], settings: [], other: [] } as Record<
    FeatureCategory,
    typeof ORDERED_FEATURES
  >
  for (const f of ORDERED_FEATURES) grouped[f.category].push(f)
  return grouped
})()

// Maps the new role to its system template name (seeded by Phase 2a).
function templateNameForRole(role: UserRole): string | null {
  if (role === 'admin') return null
  return `${ROLE_LABEL[role]} default`
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

  // Per-user permissions for the editor section. Empty for admins by design.
  const [permissionsMap, setPermissionsMap] = useState<Map<FeatureKey, AccessLevel>>(new Map())
  const [savingFeature, setSavingFeature] = useState<FeatureKey | null>(null)

  const [editInfoOpen, setEditInfoOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Pending role-change dialog. Populated when the admin clicks Save in the
  // Edit Info modal and the role has actually changed; cleared on Cancel /
  // success / error.
  const [roleChange, setRoleChange] = useState<RoleChangeRequest | null>(null)

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

      // Per-user permissions + scheduler badge come from the same table.
      // Admins skip the query — they have no rows by design and the editor
      // renders the read-only notice instead.
      if (target.role === 'admin') {
        setHasScheduler(true)
        setPermissionsMap(new Map())
      } else {
        const { data: permRows } = await supabase
          .from('user_permissions')
          .select('feature, access_level')
          .eq('user_id', userId)

        const next = new Map<FeatureKey, AccessLevel>()
        let schedulerLevel: AccessLevel | undefined
        for (const row of (permRows ?? []) as { feature: string; access_level: AccessLevel }[]) {
          next.set(row.feature as FeatureKey, row.access_level)
          if (row.feature === 'scheduler') schedulerLevel = row.access_level
        }
        setPermissionsMap(next)
        setHasScheduler(schedulerLevel != null && schedulerLevel !== 'off')
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

  // Optimistic per-feature level change. Upserts the user_permissions row;
  // on error reverts the local map and toasts. The caller's onChange below
  // also keeps the scheduler badge in sync without a full refetch.
  const handleLevelChange = useCallback(
    async (feature: FeatureKey, nextLevel: AccessLevel) => {
      const previous = permissionsMap.get(feature)
      setPermissionsMap((prev) => {
        const next = new Map(prev)
        next.set(feature, nextLevel)
        return next
      })
      if (feature === 'scheduler') {
        setHasScheduler(nextLevel !== 'off')
      }
      setSavingFeature(feature)

      const { error: upsertError } = await supabase
        .from('user_permissions')
        .upsert(
          {
            user_id: userId,
            feature,
            access_level: nextLevel,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,feature' },
        )

      setSavingFeature(null)

      if (upsertError) {
        // Revert the optimistic update.
        setPermissionsMap((prev) => {
          const next = new Map(prev)
          if (previous == null) next.delete(feature)
          else next.set(feature, previous)
          return next
        })
        if (feature === 'scheduler') {
          setHasScheduler(previous != null && previous !== 'off')
        }
        showToast('Failed to update — try again')
        // eslint-disable-next-line no-console
        console.error('[UserDetail] Failed to upsert user_permissions:', upsertError)
      }
    },
    [permissionsMap, showToast, supabase, userId],
  )

  // Triggered from the Edit Info modal. Splits non-role saves (always run
  // immediately) from role changes (which open the role-change dialog).
  const handleEditSubmit = useCallback(
    async ({
      displayName,
      avatarUrl,
      role,
    }: {
      displayName: string
      avatarUrl: string | null
      role: UserRole
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user) return { ok: false, error: 'User not loaded' }
      const trimmed = displayName.trim()
      if (!trimmed) return { ok: false, error: 'Display name is required' }

      const roleChanged = role !== user.role
      const nonRoleChanged =
        trimmed !== (user.display_name ?? '') || avatarUrl !== user.avatar_url

      // Save non-role fields first so they persist even if the dialog is
      // cancelled. We deliberately omit `role` from this upsert.
      if (nonRoleChanged) {
        const { error: updateError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            display_name: trimmed,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          })
        if (updateError) {
          return { ok: false, error: updateError.message || 'Failed to update user' }
        }
      }

      if (!roleChanged) {
        // No dialog needed.
        if (nonRoleChanged) {
          showToast('Updated')
          await loadData()
        }
        setEditInfoOpen(false)
        return { ok: true }
      }

      // Role changed — open the dialog. Profile non-role fields are already
      // persisted; the dialog handles the role + permission side effects.
      setEditInfoOpen(false)
      if (nonRoleChanged) {
        // Reflect the saved non-role fields in the header before the dialog
        // resolves, without waiting on a full reload.
        setUser({ ...user, display_name: trimmed, avatar_url: avatarUrl })
      }
      setRoleChange({
        oldRole: user.role,
        newRole: role,
        displayName: trimmed || displayNameOrEmail(user),
        existingPermissionCount: permissionsMap.size,
      })
      return { ok: true }
    },
    [loadData, permissionsMap.size, showToast, supabase, user],
  )

  // Resolves a role-change dialog choice (or cancels). Updates profiles.role
  // and optionally wipes/reseeds or clears user_permissions, then refetches.
  const handleRoleChangeChoice = useCallback(
    async (choice: 'keep' | 'reset' | 'clear'): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!roleChange || !user) return { ok: false, error: 'No pending role change' }
      const newRole = roleChange.newRole

      try {
        if (choice === 'reset') {
          const tplName = templateNameForRole(newRole)
          if (!tplName) {
            return { ok: false, error: 'No template exists for this role.' }
          }
          const { data: template, error: tplErr } = await supabase
            .from('permission_templates')
            .select('id')
            .eq('name', tplName)
            .single()
          if (tplErr || !template) {
            return { ok: false, error: tplErr?.message || `Template "${tplName}" not found` }
          }
          const { data: tplRows, error: tplRowsErr } = await supabase
            .from('template_permissions')
            .select('feature, access_level')
            .eq('template_id', (template as { id: string }).id)
          if (tplRowsErr) return { ok: false, error: tplRowsErr.message }

          const { error: deleteErr } = await supabase
            .from('user_permissions')
            .delete()
            .eq('user_id', user.id)
          if (deleteErr) return { ok: false, error: deleteErr.message }

          if ((tplRows ?? []).length > 0) {
            const insertRows = (tplRows as { feature: string; access_level: AccessLevel }[]).map((r) => ({
              user_id: user.id,
              feature: r.feature,
              access_level: r.access_level,
            }))
            const { error: insertErr } = await supabase
              .from('user_permissions')
              .insert(insertRows)
            if (insertErr) return { ok: false, error: insertErr.message }
          }
        } else if (choice === 'clear') {
          const { error: deleteErr } = await supabase
            .from('user_permissions')
            .delete()
            .eq('user_id', user.id)
          if (deleteErr) return { ok: false, error: deleteErr.message }
        }
        // choice === 'keep' touches no permission rows.

        const { error: roleErr } = await supabase
          .from('profiles')
          .upsert({ id: user.id, role: newRole, updated_at: new Date().toISOString() })
        if (roleErr) return { ok: false, error: roleErr.message }

        const successCopy =
          choice === 'reset'
            ? `Role changed and permissions reset to ${ROLE_LABEL[newRole]} default`
            : choice === 'clear'
              ? 'Made admin and cleared saved permissions'
              : 'Role updated'
        setRoleChange(null)
        showToast(successCopy)
        await loadData()
        return { ok: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Role change failed'
        return { ok: false, error: message }
      }
    },
    [loadData, roleChange, showToast, supabase, user],
  )

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

        <PermissionsSection
          user={user}
          permissionsMap={permissionsMap}
          savingFeature={savingFeature}
          onLevelChange={handleLevelChange}
        />
      </div>

      {editInfoOpen && (
        <EditInfoModal
          user={user}
          onClose={() => setEditInfoOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}

      {roleChange && (
        <RoleChangeDialog
          request={roleChange}
          onCancel={() => setRoleChange(null)}
          onChoose={handleRoleChangeChoice}
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

function PermissionsSection({
  user,
  permissionsMap,
  savingFeature,
  onLevelChange,
}: {
  user: UserRow
  permissionsMap: Map<FeatureKey, AccessLevel>
  savingFeature: FeatureKey | null
  onLevelChange: (feature: FeatureKey, next: AccessLevel) => void
}) {
  if (user.role === 'admin') {
    return (
      <section>
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Permissions
        </h2>
        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Admin has full access to all features.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            To restrict this user, change their role from Admin first.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Permissions
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden">
        {CATEGORY_ORDER.map((category, ci) => (
          <div key={category} className={ci > 0 ? 'border-t border-gray-100 dark:border-[#2a2a2a]' : ''}>
            <div className="px-4 py-2 bg-gray-50 dark:bg-[#1f1f1f] text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {CATEGORY_LABEL[category]}
            </div>
            {FEATURES_BY_CATEGORY[category].map((feature) => {
              const current = permissionsMap.get(feature.feature) ?? 'off'
              return (
                <div
                  key={feature.feature}
                  className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-[#2a2a2a] gap-3"
                >
                  <span className="text-sm text-gray-900 dark:text-white truncate">
                    {feature.displayName}
                  </span>
                  <AccessLevelSelect
                    value={current}
                    disabled={savingFeature === feature.feature}
                    onChange={(next) => onLevelChange(feature.feature, next)}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function AccessLevelSelect({
  value,
  disabled,
  onChange,
}: {
  value: AccessLevel
  disabled: boolean
  onChange: (next: AccessLevel) => void
}) {
  const option = ACCESS_OPTIONS.find((o) => o.value === value) ?? ACCESS_OPTIONS[3]
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AccessLevel)}
        className={`appearance-none pl-3 pr-7 py-1 rounded-md border text-xs font-medium transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${option.activeColor} ${disabled ? 'opacity-50 cursor-wait' : ''}`}
      >
        {ACCESS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-gray-900 bg-white">
            {opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-white/90">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

function EditInfoModal({
  user,
  onClose,
  onSubmit,
}: {
  user: UserRow
  onClose: () => void
  /** Returns { ok: true } on success — the parent owns closing the modal
   *  for non-role saves and for opening the role-change dialog when role
   *  changes. On error, the modal stays open and surfaces the message. */
  onSubmit: (payload: {
    displayName: string
    avatarUrl: string | null
    role: UserRole
  }) => Promise<{ ok: true } | { ok: false; error: string }>
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
    const result = await onSubmit({ displayName, avatarUrl, role })
    if (!result.ok) {
      setErr(result.error)
      setSaving(false)
    }
    // On success the parent closes the modal (or opens the role-change
    // dialog), so we leave `saving` set — the modal will unmount.
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

// 4-case role-change dialog. Renders 2 primary options + Cancel.
// The parent owns the actual save; this component exposes the choice and
// surfaces inline errors when the save fails.
function RoleChangeDialog({
  request,
  onCancel,
  onChoose,
}: {
  request: RoleChangeRequest
  onCancel: () => void
  onChoose: (choice: 'keep' | 'reset' | 'clear') => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const { oldRole, newRole, displayName, existingPermissionCount } = request
  const oldLabel = ROLE_LABEL[oldRole]
  const newLabel = ROLE_LABEL[newRole]

  const [pending, setPending] = useState<'keep' | 'reset' | 'clear' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const isToAdmin = oldRole !== 'admin' && newRole === 'admin'
  const isFromAdmin = oldRole === 'admin' && newRole !== 'admin'

  let title: string
  let body: string
  let primary1: { value: 'keep'; label: string; warning?: string }
  let primary2: { value: 'reset' | 'clear'; label: string }

  if (isToAdmin) {
    title = `Make ${displayName} an admin?`
    body =
      'Admins have full access to all features. Their current per-feature permissions will no longer apply while they are admin. What should happen to their saved permissions?'
    primary1 = { value: 'keep', label: 'Make admin (keep permissions on file)' }
    primary2 = { value: 'clear', label: 'Make admin and clear permissions' }
  } else if (isFromAdmin) {
    title = 'Remove admin access?'
    body = `${displayName} is becoming ${newLabel}. What should happen to their permissions?`
    primary1 = {
      value: 'keep',
      label: 'Keep current permissions (if any)',
      warning:
        existingPermissionCount === 0
          ? 'This user has no saved permissions. Keeping current permissions will leave them with no access until you set permissions manually.'
          : undefined,
    }
    primary2 = { value: 'reset', label: `Reset to ${newLabel} default` }
  } else {
    title = 'Change role?'
    body = `${displayName} is changing from ${oldLabel} to ${newLabel}. What should happen to their permissions?`
    primary1 = { value: 'keep', label: 'Keep current permissions' }
    primary2 = { value: 'reset', label: `Reset to ${newLabel} default` }
  }

  async function pickChoice(choice: 'keep' | 'reset' | 'clear') {
    setPending(choice)
    setErr(null)
    const result = await onChoose(choice)
    if (!result.ok) {
      setErr(result.error)
      setPending(null)
    }
    // On success the parent closes the dialog.
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && pending == null) onCancel()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => {
          if (pending == null) onCancel()
        }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-sm text-gray-600 mt-1.5">{body}</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => pickChoice(primary1.value)}
                disabled={pending != null}
                className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 hover:border-amber-300 hover:bg-amber-50 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <span className="inline-flex items-center gap-2">
                  {primary1.label}
                  {pending === primary1.value && <Spinner />}
                </span>
                {primary1.warning && (
                  <p className="text-xs text-amber-700 mt-1.5">{primary1.warning}</p>
                )}
              </button>
              <button
                onClick={() => pickChoice(primary2.value)}
                disabled={pending != null}
                className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 hover:border-amber-300 hover:bg-amber-50 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <span className="inline-flex items-center gap-2">
                  {primary2.label}
                  {pending === primary2.value && <Spinner />}
                </span>
              </button>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>

          <div
            className="flex-none flex justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={() => {
                if (pending == null) onCancel()
              }}
              disabled={pending != null}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
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
