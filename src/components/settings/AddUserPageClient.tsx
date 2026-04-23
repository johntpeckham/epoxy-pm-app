'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, CameraIcon, UserPlusIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  FEATURE_KEYS,
  FEATURE_METADATA,
  type FeatureCategory,
  type FeatureKey,
} from '@/lib/featureKeys'
import type { AccessLevel, UserRole } from '@/types'

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

function templateNameForRole(role: UserRole): string | null {
  if (role === 'admin') return null
  return `${ROLE_LABEL[role]} default`
}

interface TemplateRow {
  id: string
  name: string
}

interface TemplatePermRow {
  template_id: string
  feature: FeatureKey
  access_level: AccessLevel
}

export default function AddUserPageClient() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('crew')

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [permissionMode, setPermissionMode] = useState<'template' | 'custom'>('template')
  const [customPermissions, setCustomPermissions] = useState<Map<FeatureKey, AccessLevel>>(new Map())
  // Tracks whether the user has ever toggled into custom mode. If they have,
  // we preserve their edits across role changes; otherwise we keep
  // customPermissions synced to the matching role template.
  const customDirtyRef = useRef(false)

  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [templatePerms, setTemplatePerms] = useState<TemplatePermRow[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadTemplates() {
      const [tRes, tpRes] = await Promise.all([
        supabase.from('permission_templates').select('id, name'),
        supabase.from('template_permissions').select('template_id, feature, access_level'),
      ])
      if (cancelled) return
      setTemplates((tRes.data as TemplateRow[]) ?? [])
      setTemplatePerms((tpRes.data as TemplatePermRow[]) ?? [])
      setTemplatesLoading(false)
    }
    loadTemplates()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // Clean up avatar preview URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [avatarPreviewUrl])

  // Map the role → its system template rows for easy access.
  const templatePermsByRole = useMemo(() => {
    const byName = new Map<string, string>(templates.map((t) => [t.name, t.id]))
    const result = new Map<UserRole, Map<FeatureKey, AccessLevel>>()
    for (const role of ['crew', 'foreman', 'salesman', 'office_manager'] as UserRole[]) {
      const name = templateNameForRole(role)
      if (!name) continue
      const tplId = byName.get(name)
      if (!tplId) continue
      const map = new Map<FeatureKey, AccessLevel>()
      for (const row of templatePerms) {
        if (row.template_id === tplId) map.set(row.feature, row.access_level)
      }
      result.set(role, map)
    }
    return result
  }, [templates, templatePerms])

  // When the role changes (and the admin hasn't hand-edited custom values),
  // sync the customPermissions buffer to the new role's template so the
  // "Custom" editor starts from the right place if the admin switches tabs.
  useEffect(() => {
    if (customDirtyRef.current) return
    if (role === 'admin') {
      setCustomPermissions(new Map())
      return
    }
    const source = templatePermsByRole.get(role)
    if (source) setCustomPermissions(new Map(source))
  }, [role, templatePermsByRole])

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    setAvatarFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRoleChange(next: UserRole) {
    setRole(next)
    // If the admin hasn't customised anything yet, keep the custom buffer
    // tracking the role's template. If they have, preserve their edits.
    if (!customDirtyRef.current) {
      if (next === 'admin') {
        setCustomPermissions(new Map())
      } else {
        const source = templatePermsByRole.get(next)
        if (source) setCustomPermissions(new Map(source))
      }
    }
  }

  function handleCustomLevelChange(feature: FeatureKey, next: AccessLevel) {
    customDirtyRef.current = true
    setCustomPermissions((prev) => {
      const map = new Map(prev)
      map.set(feature, next)
      return map
    })
  }

  function validate(): string | null {
    if (!email.trim()) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (!displayName.trim()) return 'Display name is required'
    return null
  }

  async function handleCreate() {
    setError(null)
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)

    // 1. Create the user via /api/create-user. Returns the new user's id.
    let newUserId: string
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: displayName.trim(),
          role,
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to create user')
      newUserId = payload.user?.id
      if (!newUserId) throw new Error('Create succeeded but returned no user id')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
      setSaving(false)
      return
    }

    // From this point the user exists. Failures are surfaced as toasts and
    // we still navigate to the detail page so the admin can finish manually.
    const warnings: string[] = []

    // 2. Optional avatar upload — upsert under the new user's id.
    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop()
        const path = `${newUserId}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (uploadErr) throw uploadErr
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        const { error: updateErr } = await supabase
          .from('profiles')
          .upsert({
            id: newUserId,
            avatar_url: data.publicUrl,
            updated_at: new Date().toISOString(),
          })
        if (updateErr) throw updateErr
      } catch (err) {
        warnings.push(
          err instanceof Error
            ? `Avatar upload failed: ${err.message}`
            : 'Avatar upload failed',
        )
      }
    }

    // 3. Seed user_permissions. Admin skips entirely — access comes from
    //    the hook shortcut. Everyone else gets 35 rows from the chosen
    //    source (template or custom).
    if (role !== 'admin') {
      try {
        let sourceMap: Map<FeatureKey, AccessLevel>
        if (permissionMode === 'template') {
          const tpl = templatePermsByRole.get(role)
          if (!tpl) throw new Error(`Missing template for role "${role}"`)
          sourceMap = tpl
        } else {
          sourceMap = customPermissions
        }

        const now = new Date().toISOString()
        const insertRows = ORDERED_FEATURES.map((f) => ({
          user_id: newUserId,
          feature: f.feature,
          access_level: sourceMap.get(f.feature) ?? 'off',
          updated_at: now,
        }))
        const { error: insertErr } = await supabase.from('user_permissions').insert(insertRows)
        if (insertErr) throw insertErr
      } catch (err) {
        warnings.push(
          err instanceof Error
            ? `User was created but permissions couldn't be set: ${err.message}. Set them manually on the detail page.`
            : "User was created but permissions couldn't be set. Set them manually on the detail page.",
        )
      }
    }

    if (warnings.length > 0) showToast(warnings[0])
    router.push(`/settings/users/${newUserId}`)
  }

  const showPermissionsSection = role !== 'admin'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 min-w-0 mb-2">
          <Link href="/settings/users" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <UserPlusIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            Add user
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xl">
          Create an account and set initial permissions. Permissions can be changed later from the user&apos;s detail page.
        </p>

        <AccountInfoSection
          email={email}
          password={password}
          displayName={displayName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onDisplayNameChange={setDisplayName}
        />

        <RoleSection role={role} onRoleChange={handleRoleChange} />

        <AvatarSection
          previewUrl={avatarPreviewUrl}
          initials={getInitials(displayName, email)}
          onPick={() => fileInputRef.current?.click()}
          onClear={() => {
            if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
            setAvatarFile(null)
            setAvatarPreviewUrl(null)
          }}
          fileInputRef={fileInputRef}
          onFileChange={handleAvatarPick}
        />

        {showPermissionsSection ? (
          <PermissionsSection
            role={role}
            mode={permissionMode}
            onModeChange={setPermissionMode}
            templateName={templateNameForRole(role) ?? ''}
            customPermissions={customPermissions}
            onCustomLevelChange={handleCustomLevelChange}
            templatesLoading={templatesLoading}
          />
        ) : (
          <section className="mb-4">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Permissions
            </h2>
            <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Admins have full access to all features.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                No per-feature setup needed.
              </p>
            </div>
          </section>
        )}

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <Link
            href="/settings/users"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2a2a2a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2e2e2e] transition"
          >
            Cancel
          </Link>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {saving && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}
    </div>
  )
}

function AccountInfoSection({
  email,
  password,
  displayName,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
}: {
  email: string
  password: string
  displayName: string
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onDisplayNameChange: (v: string) => void
}) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Account info
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5 space-y-4">
        <div>
          <label htmlFor="new-user-email" className="block text-xs font-medium text-gray-500 mb-1">
            Email
          </label>
          <input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="name@example.com"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
          />
        </div>
        <div>
          <label htmlFor="new-user-password" className="block text-xs font-medium text-gray-500 mb-1">
            Password
          </label>
          <input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Minimum 8 characters"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
          />
        </div>
        <div>
          <label htmlFor="new-user-name" className="block text-xs font-medium text-gray-500 mb-1">
            Display name
          </label>
          <input
            id="new-user-name"
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Display name"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
          />
        </div>
      </div>
    </section>
  )
}

function RoleSection({
  role,
  onRoleChange,
}: {
  role: UserRole
  onRoleChange: (next: UserRole) => void
}) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Role
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5">
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as UserRole)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition bg-white"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

function AvatarSection({
  previewUrl,
  initials,
  onPick,
  onClear,
  fileInputRef,
  onFileChange,
}: {
  previewUrl: string | null
  initials: string
  onPick: () => void
  onClear: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Avatar
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="relative group">
            {previewUrl ? (
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
                <Image
                  src={previewUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-700 text-white flex items-center justify-center">
                <span className="text-sm font-semibold">{initials}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onPick}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
            >
              <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onPick}
              className="text-sm font-medium text-amber-600 hover:text-amber-700 transition self-start"
            >
              {previewUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {previewUrl && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-gray-500 hover:text-gray-700 transition self-start"
              >
                Remove
              </button>
            )}
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, or GIF. Optional.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </div>
    </section>
  )
}

function PermissionsSection({
  role,
  mode,
  onModeChange,
  templateName,
  customPermissions,
  onCustomLevelChange,
  templatesLoading,
}: {
  role: UserRole
  mode: 'template' | 'custom'
  onModeChange: (next: 'template' | 'custom') => void
  templateName: string
  customPermissions: Map<FeatureKey, AccessLevel>
  onCustomLevelChange: (feature: FeatureKey, next: AccessLevel) => void
  templatesLoading: boolean
}) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Permissions
      </h2>
      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-gray-100 dark:border-[#2a2a2a]">
          <ModeButton active={mode === 'template'} onClick={() => onModeChange('template')}>
            Use template
          </ModeButton>
          <ModeButton active={mode === 'custom'} onClick={() => onModeChange('custom')}>
            Custom
          </ModeButton>
        </div>
        {mode === 'template' ? (
          <div className="p-5">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Start from the{' '}
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 align-middle">
                {templateName}
              </span>{' '}
              template.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              You can fine-tune individual permissions later from the user&apos;s detail page, or switch to Custom now to edit them here.
            </p>
            {templatesLoading && (
              <p className="text-xs text-gray-400 mt-2">Loading template defaults…</p>
            )}
          </div>
        ) : (
          <CustomPermissionsEditor
            role={role}
            customPermissions={customPermissions}
            onCustomLevelChange={onCustomLevelChange}
          />
        )}
      </div>
    </section>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
        active
          ? 'bg-amber-500 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2e2e2e]'
      }`}
    >
      {children}
    </button>
  )
}

function CustomPermissionsEditor({
  role,
  customPermissions,
  onCustomLevelChange,
}: {
  role: UserRole
  customPermissions: Map<FeatureKey, AccessLevel>
  onCustomLevelChange: (feature: FeatureKey, next: AccessLevel) => void
}) {
  // `role` is referenced in the label copy so admins understand the baseline
  // they're editing. Not used elsewhere.
  const baseline = templateNameForRole(role) ?? ''
  return (
    <div>
      <div className="px-4 py-2 bg-amber-50 dark:bg-[#2a2414] border-b border-amber-100 dark:border-[#3a3418] text-xs text-amber-800 dark:text-amber-300">
        Customising {baseline}. Changes apply only to this user.
      </div>
      {CATEGORY_ORDER.map((category, ci) => (
        <div key={category} className={ci > 0 ? 'border-t border-gray-100 dark:border-[#2a2a2a]' : ''}>
          <div className="px-4 py-2 bg-gray-50 dark:bg-[#1f1f1f] text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {CATEGORY_LABEL[category]}
          </div>
          {FEATURES_BY_CATEGORY[category].map((feature) => {
            const current = customPermissions.get(feature.feature) ?? 'off'
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
                  onChange={(next) => onCustomLevelChange(feature.feature, next)}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function AccessLevelSelect({
  value,
  onChange,
}: {
  value: AccessLevel
  onChange: (next: AccessLevel) => void
}) {
  const option = ACCESS_OPTIONS.find((o) => o.value === value) ?? ACCESS_OPTIONS[3]
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AccessLevel)}
        className={`appearance-none pl-3 pr-7 py-1 rounded-md border text-xs font-medium transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${option.activeColor}`}
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

function getInitials(displayName: string, email: string): string {
  const source = displayName.trim() || email.split('@')[0] || 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}
