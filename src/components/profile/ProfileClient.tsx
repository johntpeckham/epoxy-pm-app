'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { CameraIcon, CheckIcon, ArrowLeftIcon, UploadIcon, BuildingIcon, ShieldIcon } from 'lucide-react'
import { Profile } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import UserManagement from './UserManagement'

interface ProfileClientProps {
  userId: string
  userEmail: string
  initialProfile: Profile
}

export default function ProfileClient({ userId, userEmail, initialProfile }: ProfileClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { role } = useUserRole()
  const isAdmin = role === 'admin'
  const isCrew = role === 'crew'

  // Display name state
  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Company logo state
  const { settings: companySettings, refetch: refetchCompanySettings } = useCompanySettings()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoSuccess, setLogoSuccess] = useState(false)

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'U'

  function getAvatarPublicUrl(path: string) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setLogoError('Please upload a PNG, JPG, or SVG file')
      return
    }

    setLogoUploading(true)
    setLogoError(null)
    setLogoSuccess(false)

    try {
      const ext = file.name.split('.').pop()
      const path = `logos/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path)
      const logoUrl = urlData.publicUrl

      // Upsert the single company_settings row
      if (companySettings?.id) {
        const { error: updateError } = await supabase
          .from('company_settings')
          .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
          .eq('id', companySettings.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('company_settings')
          .insert({ logo_url: logoUrl, updated_at: new Date().toISOString() })
        if (insertError) throw insertError
      }

      await refetchCompanySettings()
      setLogoSuccess(true)
      setTimeout(() => setLogoSuccess(false), 2000)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAvatarUploading(true)
    setAvatarError(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const publicUrl = getAvatarPublicUrl(path)

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: publicUrl, updated_at: new Date().toISOString() })

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveDisplayName() {
    setNameSaving(true)
    setNameError(null)
    setNameSuccess(false)

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: displayName.trim() || null, updated_at: new Date().toISOString() })

      if (error) throw error
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 2000)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update display name')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleChangePassword() {
    setPasswordSaving(true)
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      setPasswordSaving(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      setPasswordSaving(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 2000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/jobs')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex-1">Profile Settings</h1>
          {isAdmin && (
            <button
              onClick={() => router.push('/permissions')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-700 hover:text-amber-700 text-sm font-medium rounded-lg transition"
            >
              <ShieldIcon className="w-4 h-4" />
              Permissions
            </button>
          )}
        </div>

        {/* Company Logo Section — Admin only */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Company Logo</h2>
            <p className="text-xs text-gray-400 mb-4">This logo will appear in the sidebar and on printed reports.</p>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                {companySettings?.logo_url ? (
                  <Image
                    src={companySettings.logo_url}
                    alt="Company logo"
                    width={80}
                    height={80}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <BuildingIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 transition"
                >
                  <UploadIcon className="w-4 h-4" />
                  {logoUploading ? 'Uploading...' : 'Upload logo'}
                </button>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, or SVG.</p>
                {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
                {logoSuccess && <p className="text-xs text-green-600 mt-1">Logo updated successfully</p>}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>
          </div>
        )}

        {/* Avatar Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Avatar</h2>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Avatar"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-bold text-white">{initials}</span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
              >
                <CameraIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="text-sm font-medium text-amber-600 hover:text-amber-700 transition"
              >
                {avatarUploading ? 'Uploading...' : 'Upload photo'}
              </button>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, or GIF. Max 2MB.</p>
              {avatarError && <p className="text-xs text-red-500 mt-1">{avatarError}</p>}
            </div>
          </div>
        </div>

        {/* Display Name Section — hidden for Crew */}
        {!isCrew && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Display Name</h2>
            <p className="text-xs text-gray-400 mb-3">This name will appear in the chat feed instead of your email.</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={userEmail.split('@')[0]}
                className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              />
              <button
                onClick={handleSaveDisplayName}
                disabled={nameSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {nameSuccess ? (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    Saved
                  </>
                ) : nameSaving ? (
                  'Saving...'
                ) : (
                  'Save'
                )}
              </button>
            </div>
            {nameError && <p className="text-xs text-red-500 mt-2">{nameError}</p>}
          </div>
        )}

        {/* Email Section (read-only) — hidden for Crew */}
        {!isCrew && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Email</h2>
            <p className="text-sm text-gray-900">{userEmail}</p>
            <p className="text-xs text-gray-400 mt-1">Contact your administrator to change your email address.</p>
          </div>
        )}

        {/* Change Password Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Change Password</h2>
          <div className="space-y-3 max-w-sm">
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-gray-500 mb-1">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-500 mb-1">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              />
            </div>
            {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
            <button
              onClick={handleChangePassword}
              disabled={passwordSaving || !newPassword || !confirmPassword}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {passwordSuccess ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Updated
                </>
              ) : passwordSaving ? (
                'Updating...'
              ) : (
                'Update Password'
              )}
            </button>
          </div>
        </div>

        {/* User Management — Admin only */}
        {isAdmin && <UserManagement currentUserId={userId} />}
      </div>
    </div>
  )
}
