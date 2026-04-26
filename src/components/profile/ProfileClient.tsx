'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { CameraIcon, CheckIcon, ArrowLeftIcon, UploadIcon, BuildingIcon, Building2Icon, SlidersHorizontalIcon, UsersIcon, DownloadIcon, ClipboardCheckIcon, Trash2Icon, ShieldCheckIcon, PencilIcon, PlusIcon, XIcon, ScrollTextIcon, MoonIcon, FileTextIcon, PackageIcon, TargetIcon, BellIcon, TableIcon, CalculatorIcon, HashIcon, BarChart3Icon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { Profile, CslbLicense } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useTheme } from '@/components/theme/ThemeProvider'
import EmployeeManagement from './EmployeeManagement'
import ReminderRulesEditor from './ReminderRulesEditor'
import ProjectNumbersEditor from './ProjectNumbersEditor'
import ProposalFormSettingsEditor from './ProposalFormSettingsEditor'
import TakeoffTemplatesEditor from './TakeoffTemplatesEditor'
import TakeoffDefaultsEditor from './TakeoffDefaultsEditor'
import VendorManagementModal from '@/components/ui/VendorManagementModal'
import WarrantyManagement from '@/components/warranty/WarrantyManagement'
import PreLienManagement from '@/components/prelien/PreLienManagement'

interface ProfileClientProps {
  userId: string
  userEmail: string
  initialProfile: Profile
}

export default function ProfileClient({ userId, userEmail, initialProfile }: ProfileClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { theme, toggleTheme } = useTheme()
  const isDarkMode = theme === 'dark'
  // useUserRole is retained for the role badge at the top of the page and
  // for the crew-specific edit-profile layout — it is not used for any
  // permission gate below this line.
  const { role } = useUserRole()
  const isCrew = role === 'crew'
  const { canView } = usePermissions()

  // Vendor management modal
  const [showVendorManagement, setShowVendorManagement] = useState(false)
  // Warranty management modal
  const [showWarrantyManagement, setShowWarrantyManagement] = useState(false)
  // Pre-Lien management modal
  const [showPreLienManagement, setShowPreLienManagement] = useState(false)
  // Sales management modal
  const [showSalesManagement, setShowSalesManagement] = useState(false)
  // Employee management modal (controlled from tile)
  const [showEmployeeManagement, setShowEmployeeManagement] = useState(false)
  // Edit profile modal
  const [showEditProfile, setShowEditProfile] = useState(false)
  // Company info modal
  const [showCompanyInfo, setShowCompanyInfo] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const section = searchParams.get('section')
    const edit = searchParams.get('edit')
    if (edit === '1') setShowEditProfile(true)
    if (section === 'company-info') setShowCompanyInfo(true)
    if (section === 'employee-management') setShowEmployeeManagement(true)
    if (section === 'vendor-management') setShowVendorManagement(true)
    if (section || edit) {
      window.history.replaceState({}, '', '/profile')
    }
  }, [searchParams])

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

  // Company info state
  const [companyInfoEditing, setCompanyInfoEditing] = useState(false)
  const [companyInfoSaving, setCompanyInfoSaving] = useState(false)
  const [companyInfoSuccess, setCompanyInfoSuccess] = useState(false)
  const [companyInfoError, setCompanyInfoError] = useState<string | null>(null)
  const [ciLegalName, setCiLegalName] = useState('')
  const [ciDba, setCiDba] = useState('')
  const [ciAddress, setCiAddress] = useState('')
  const [ciMailing, setCiMailing] = useState('')
  const [ciPhone, setCiPhone] = useState('')
  const [ciEmail, setCiEmail] = useState('')
  const [ciLicenses, setCiLicenses] = useState<CslbLicense[]>([])

  // Sync company info state when settings load
  const companyInfoSynced = useRef(false)
  useEffect(() => {
    if (companySettings && !companyInfoSynced.current) {
      setCiLegalName(companySettings.legal_name ?? '')
      setCiDba(companySettings.dba ?? '')
      setCiAddress(companySettings.company_address ?? '')
      setCiMailing(companySettings.mailing_address ?? '')
      setCiPhone(companySettings.phone ?? '')
      setCiEmail(companySettings.email ?? '')
      setCiLicenses(companySettings.cslb_licenses ?? [])
      companyInfoSynced.current = true
    }
  }, [companySettings])

  function startEditCompanyInfo() {
    setCiLegalName(companySettings?.legal_name ?? '')
    setCiDba(companySettings?.dba ?? '')
    setCiAddress(companySettings?.company_address ?? '')
    setCiMailing(companySettings?.mailing_address ?? '')
    setCiPhone(companySettings?.phone ?? '')
    setCiEmail(companySettings?.email ?? '')
    setCiLicenses(companySettings?.cslb_licenses ?? [])
    setCompanyInfoEditing(true)
    setCompanyInfoError(null)
  }

  function cancelEditCompanyInfo() {
    setCompanyInfoEditing(false)
    setCompanyInfoError(null)
  }

  async function saveCompanyInfo() {
    setCompanyInfoSaving(true)
    setCompanyInfoError(null)
    try {
      const payload = {
        legal_name: ciLegalName.trim() || null,
        dba: ciDba.trim() || null,
        company_address: ciAddress.trim() || null,
        mailing_address: ciMailing.trim() || null,
        phone: ciPhone.trim() || null,
        email: ciEmail.trim() || null,
        cslb_licenses: ciLicenses.filter((l) => l.number.trim()),
        updated_at: new Date().toISOString(),
      }
      if (companySettings?.id) {
        const { error } = await supabase
          .from('company_settings')
          .update(payload)
          .eq('id', companySettings.id)
        if (error) throw error
      } else {
        // Check if a row exists that the hook hasn't loaded yet
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existing) {
          const { error } = await supabase
            .from('company_settings')
            .update(payload)
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('company_settings')
            .insert(payload)
          if (error) throw error
        }
      }
      await refetchCompanySettings()
      companyInfoSynced.current = false
      setCompanyInfoEditing(false)
      setCompanyInfoSuccess(true)
      setTimeout(() => setCompanyInfoSuccess(false), 2000)
    } catch (err) {
      setCompanyInfoError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setCompanyInfoSaving(false)
    }
  }

  function addLicense() {
    setCiLicenses((prev) => [...prev, { id: crypto.randomUUID(), number: '', classification: '' }])
  }

  function removeLicense(id: string) {
    setCiLicenses((prev) => prev.filter((l) => l.id !== id))
  }

  function updateLicense(id: string, field: 'number' | 'classification', value: string) {
    setCiLicenses((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

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
      const logoPayload = { logo_url: logoUrl, updated_at: new Date().toISOString() }
      if (companySettings?.id) {
        const { error: updateError } = await supabase
          .from('company_settings')
          .update(logoPayload)
          .eq('id', companySettings.id)
        if (updateError) throw updateError
      } else {
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existing) {
          const { error: updateError } = await supabase
            .from('company_settings')
            .update(logoPayload)
            .eq('id', existing.id)
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await supabase
            .from('company_settings')
            .insert(logoPayload)
          if (insertError) throw insertError
        }
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => router.back()} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
          <SlidersHorizontalIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Settings</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4 mb-3 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-white">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-[#e5e5e5] truncate">
              {displayName || userEmail.split('@')[0]}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#a0a0a0] truncate">{userEmail}</p>
            {role && (
              <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] uppercase tracking-wide mt-0.5">
                {role.replace('_', ' ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowEditProfile(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 hover:bg-amber-50 text-amber-600 hover:text-amber-700 text-xs font-medium rounded-md transition flex-shrink-0"
          >
            <PencilIcon className="w-4 h-4" />
            Edit profile
          </button>
        </div>

        {/* Dark mode toggle */}
        <div className="bg-white dark:bg-[#242424] rounded-md border border-gray-200 dark:border-[#2a2a2a] px-4 py-3 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MoonIcon className="w-4 h-4 text-gray-500 dark:text-[#a0a0a0]" />
            <span className="text-[13px] font-medium text-gray-900 dark:text-[#e5e5e5]">Dark mode</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDarkMode ? 'bg-amber-500' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Section: Company */}
        {(canView('company_info') || canView('user_management') || canView('employee_management')) && (
          <div className="mt-1 mb-5">
            <p className="text-[13px] font-medium text-gray-500 dark:text-[#a0a0a0] tracking-wide mb-2">Company</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {canView('company_info') && (
                <SettingsTile
                  icon={BuildingIcon}
                  title="Company info"
                  subtitle="Name, address, logo, appearance"
                  onClick={() => setShowCompanyInfo(true)}
                />
              )}
              {canView('user_management') && (
                <SettingsTile
                  icon={UsersIcon}
                  title="User management"
                  subtitle="Roles and team members"
                  onClick={() => router.push('/settings/users')}
                />
              )}
              {canView('employee_management') && (
                <SettingsTile
                  icon={UsersIcon}
                  title="Employee management"
                  subtitle="Profiles, roles, custom fields"
                  onClick={() => setShowEmployeeManagement(true)}
                />
              )}
            </div>
          </div>
        )}

        {/* Section: Sales */}
        {(canView('sales_management') || canView('vendor_management')) && (
          <div className="mb-5">
            <p className="text-[13px] font-medium text-gray-500 dark:text-[#a0a0a0] tracking-wide mb-2">Sales</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {canView('sales_management') && (
                <SettingsTile
                  icon={TargetIcon}
                  title="Sales management"
                  subtitle="Pipeline, estimates, notifications"
                  onClick={() => setShowSalesManagement(true)}
                />
              )}
              {canView('vendor_management') && (
                <SettingsTile
                  icon={Building2Icon}
                  title="Vendor management"
                  subtitle="Vendors and their contacts"
                  onClick={() => setShowVendorManagement(true)}
                />
              )}
            </div>
          </div>
        )}

        {/* Section: Operations */}
        {(
          canView('job_feed_forms') ||
          canView('job_reports') ||
          canView('checklist_templates') ||
          canView('warranty_management') ||
          canView('prelien_management') ||
          canView('material_management')
        ) && (
          <div className="mb-5">
            <p className="text-[13px] font-medium text-gray-500 dark:text-[#a0a0a0] tracking-wide mb-2">Operations</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {canView('job_feed_forms') && (
                <SettingsTile
                  icon={SlidersHorizontalIcon}
                  title="Job feed forms"
                  subtitle="Daily reports, JSA, expenses"
                  onClick={() => router.push('/form-management')}
                />
              )}
              {canView('job_reports') && (
                <SettingsTile
                  icon={FileTextIcon}
                  title="Job reports"
                  subtitle="Report editor and material systems"
                  onClick={() => router.push('/job-report-management')}
                />
              )}
              {canView('checklist_templates') && (
                <SettingsTile
                  icon={ClipboardCheckIcon}
                  title="Checklist templates"
                  subtitle="Reusable checklists for projects"
                  onClick={() => router.push('/checklist-templates')}
                />
              )}
              {canView('warranty_management') && (
                <SettingsTile
                  icon={ShieldCheckIcon}
                  title="Warranty management"
                  subtitle="Templates and manufacturer docs"
                  onClick={() => setShowWarrantyManagement(true)}
                />
              )}
              {canView('prelien_management') && (
                <SettingsTile
                  icon={ScrollTextIcon}
                  title="Pre-lien management"
                  subtitle="CA Civil Code compliance"
                  onClick={() => setShowPreLienManagement(true)}
                />
              )}
              {canView('material_management') && (
                <SettingsTile
                  icon={PackageIcon}
                  title="Material management"
                  subtitle="Suppliers, products, pricing"
                  onClick={() => router.push('/material-management')}
                />
              )}
            </div>
          </div>
        )}

        {/* Section: Data */}
        {(canView('data_export') || canView('reports') || canView('trash_bin')) && (
          <div className="mb-5">
            <p className="text-[13px] font-medium text-gray-500 dark:text-[#a0a0a0] tracking-wide mb-2">Data</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {canView('data_export') && (
                <SettingsTile
                  icon={DownloadIcon}
                  title="Data export"
                  subtitle="Reports, photos, project data"
                  onClick={() => router.push('/data-export')}
                />
              )}
              {canView('reports') && (
                <SettingsTile
                  icon={BarChart3Icon}
                  title="Reports"
                  subtitle="Timesheets, sales, expenses"
                  onClick={() => router.push('/reports')}
                />
              )}
              {canView('trash_bin') && (
                <SettingsTile
                  icon={Trash2Icon}
                  title="Trash bin"
                  subtitle="Restore or permanently delete"
                  onClick={() => router.push('/trash-bin')}
                />
              )}
            </div>
          </div>
        )}

        {/* Controlled EmployeeManagement (triggered from tile) */}
        {canView('employee_management') && (
          <EmployeeManagement
            hideTrigger
            open={showEmployeeManagement}
            onOpenChange={setShowEmployeeManagement}
          />
        )}

        {/* Customer / Sales / Vendor modals (rendered when open) */}
        {showSalesManagement && (
          <SalesManagementModal
            canEditAdminSettings={canView('user_management')}
            onClose={() => setShowSalesManagement(false)}
          />
        )}
        {showVendorManagement && (
          <VendorManagementModal
            open={showVendorManagement}
            userId={userId}
            onClose={() => setShowVendorManagement(false)}
          />
        )}
        {showWarrantyManagement && (
          <WarrantyManagement onClose={() => setShowWarrantyManagement(false)} />
        )}
        {showPreLienManagement && (
          <PreLienManagement onClose={() => setShowPreLienManagement(false)} />
        )}

        {/* Edit Profile Modal */}
        {showEditProfile && (
          <Portal>
            <div
              className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
              onClick={() => setShowEditProfile(false)}
            >
              <div
                className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                  style={{ minHeight: '56px' }}
                >
                  <h3 className="text-lg font-semibold text-gray-900">Edit profile</h3>
                  <button
                    onClick={() => setShowEditProfile(false)}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                  {/* Avatar */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Avatar</h4>
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

                  {/* Display Name */}
                  {!isCrew && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Display name</h4>
                      <p className="text-xs text-gray-400 mb-2">This name will appear in the chat feed instead of your email.</p>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={userEmail.split('@')[0]}
                          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
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

                  {/* Email (read-only) */}
                  {!isCrew && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Email</h4>
                      <p className="text-sm text-gray-900">{userEmail}</p>
                      <p className="text-xs text-gray-400 mt-1">Contact your administrator to change your email address.</p>
                    </div>
                  )}

                  {/* Change Password */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change password</h4>
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="new-password" className="block text-xs font-medium text-gray-500 mb-1">
                          New password
                        </label>
                        <input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          autoComplete="new-password"
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
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder="••••••••"
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
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
                          'Update password'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  className="flex-none flex justify-end p-4 border-t border-gray-200"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
                >
                  <button
                    type="button"
                    onClick={() => setShowEditProfile(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* Company Info Modal */}
        {showCompanyInfo && (
          <Portal>
            <div
              className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
              onClick={() => {
                if (companyInfoEditing) cancelEditCompanyInfo()
                setShowCompanyInfo(false)
              }}
            >
              <div
                className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                  style={{ minHeight: '56px' }}
                >
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="w-5 h-5 text-amber-500" />
                    <h3 className="text-lg font-semibold text-gray-900">Company info</h3>
                  </div>
                  <button
                    onClick={() => {
                      if (companyInfoEditing) cancelEditCompanyInfo()
                      setShowCompanyInfo(false)
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                  {/* Company Logo — requires edit on company_info */}
                  {canView('company_info') && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Company logo</h4>
                      <p className="text-xs text-gray-400 mb-3">This logo will appear in the sidebar and on printed reports.</p>
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

                  {/* Company details */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company information</h4>
                      {canView('company_info') && !companyInfoEditing && (
                        <button
                          onClick={startEditCompanyInfo}
                          className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                        >
                          <PencilIcon className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                    </div>

                    {canView('company_info') && companyInfoEditing ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Legal Company Name</label>
                          <input
                            value={ciLegalName}
                            onChange={(e) => setCiLegalName(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            placeholder="e.g., Peckham Coatings Inc."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">DBA (Doing Business As)</label>
                          <input
                            value={ciDba}
                            onChange={(e) => setCiDba(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            placeholder="e.g., Peckham Coatings"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Company Address</label>
                          <textarea
                            value={ciAddress}
                            onChange={(e) => setCiAddress(e.target.value)}
                            rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                            placeholder="123 Main St, City, State ZIP"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Mailing Address</label>
                          <textarea
                            value={ciMailing}
                            onChange={(e) => setCiMailing(e.target.value)}
                            rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                            placeholder="PO Box 123, City, State ZIP"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                            <input
                              value={ciPhone}
                              onChange={(e) => setCiPhone(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              placeholder="(555) 123-4567"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                            <input
                              type="email"
                              value={ciEmail}
                              onChange={(e) => setCiEmail(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              placeholder="info@company.com"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-2">CSLB License Numbers</label>
                          <div className="space-y-2">
                            {ciLicenses.map((license) => (
                              <div key={license.id} className="flex items-center gap-2">
                                <input
                                  value={license.number}
                                  onChange={(e) => updateLicense(license.id, 'number', e.target.value)}
                                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                  placeholder="License #"
                                />
                                <input
                                  value={license.classification}
                                  onChange={(e) => updateLicense(license.id, 'classification', e.target.value)}
                                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                  placeholder="Classification"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeLicense(license.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition flex-shrink-0"
                                >
                                  <XIcon className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={addLicense}
                            className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                          >
                            <PlusIcon className="w-4 h-4" />
                            Add License
                          </button>
                        </div>
                        {companyInfoError && <p className="text-xs text-red-500">{companyInfoError}</p>}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={saveCompanyInfo}
                            disabled={companyInfoSaving}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
                          >
                            {companyInfoSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditCompanyInfo}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm">
                        {companyInfoSuccess && <p className="text-xs text-green-600 mb-2">Company info saved successfully</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-gray-400">Legal Company Name</p>
                            <p className="text-gray-900">{companySettings?.legal_name || <span className="text-gray-300 italic">Not set</span>}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">DBA</p>
                            <p className="text-gray-900">{companySettings?.dba || <span className="text-gray-300 italic">Not set</span>}</p>
                          </div>
                          {canView('company_info') && (
                            <>
                              <div>
                                <p className="text-xs text-gray-400">Company Address</p>
                                <p className="text-gray-900 whitespace-pre-line">{companySettings?.company_address || <span className="text-gray-300 italic">Not set</span>}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">Mailing Address</p>
                                <p className="text-gray-900 whitespace-pre-line">{companySettings?.mailing_address || <span className="text-gray-300 italic">Not set</span>}</p>
                              </div>
                            </>
                          )}
                          <div>
                            <p className="text-xs text-gray-400">Phone</p>
                            <p className="text-gray-900">{companySettings?.phone || <span className="text-gray-300 italic">Not set</span>}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Email</p>
                            <p className="text-gray-900">{companySettings?.email || <span className="text-gray-300 italic">Not set</span>}</p>
                          </div>
                        </div>
                        {canView('company_info') && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">CSLB Licenses</p>
                            {companySettings?.cslb_licenses && companySettings.cslb_licenses.length > 0 ? (
                              <div className="space-y-0.5">
                                {companySettings.cslb_licenses.map((l, i) => (
                                  <p key={i} className="text-gray-900">License #{l.number} — {l.classification}</p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-300 italic">None</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className="flex-none flex justify-end p-4 border-t border-gray-200"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (companyInfoEditing) cancelEditCompanyInfo()
                      setShowCompanyInfo(false)
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </div>
    </div>
  )
}

function SalesManagementModal({
  canEditAdminSettings,
  onClose,
}: {
  /** Show admin-only cards like Project Numbers. Derived from
   *  `canView('user_management')` by the caller. */
  canEditAdminSettings: boolean
  onClose: () => void
}) {
  const [showRuleEditor, setShowRuleEditor] = useState(false)
  const [showProjectNumbersEditor, setShowProjectNumbersEditor] = useState(false)
  const [showProposalFormEditor, setShowProposalFormEditor] = useState(false)
  const [showTakeoffTemplatesEditor, setShowTakeoffTemplatesEditor] = useState(false)
  const [showTakeoffDefaultsEditor, setShowTakeoffDefaultsEditor] = useState(false)

  const cards: {
    icon: React.ReactNode
    title: string
    description: string
    onClick?: () => void
  }[] = [
    {
      icon: <FileTextIcon className="w-5 h-5" />,
      title: 'Edit Estimate Form',
      description: 'Customize the fields and layout shown on the estimate.',
      onClick: () => setShowProposalFormEditor(true),
    },
    {
      icon: <BellIcon className="w-5 h-5" />,
      title: 'Edit Notifications and Follow-ups',
      description: 'Configure reminders and follow-up cadences for leads.',
      onClick: () => setShowRuleEditor(true),
    },
    ...(canEditAdminSettings
      ? [
          {
            icon: <HashIcon className="w-5 h-5" />,
            title: 'Project Numbers',
            description: 'Configure auto-numbering formats per salesperson.',
            onClick: () => setShowProjectNumbersEditor(true),
          },
        ]
      : []),
    {
      icon: <TableIcon className="w-5 h-5" />,
      title: 'Takeoff Templates',
      description: 'Manage templates for takeoff sheets.',
      onClick: () => setShowTakeoffTemplatesEditor(true),
    },
    {
      icon: <SlidersHorizontalIcon className="w-5 h-5" />,
      title: 'Takeoff Defaults',
      description: 'Set default tax rate, overhead, profit, and mobilization cost.',
      onClick: () => setShowTakeoffDefaultsEditor(true),
    },
  ]

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <CalculatorIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">Sales Management</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <p className="text-sm text-gray-500 mb-4">
              Configure sales workflows and tools.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cards.map((c) => {
                const isActive = Boolean(c.onClick)
                const body = (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-amber-500">{c.icon}</span>
                      <h4 className="text-sm font-semibold text-gray-900 flex-1">
                        {c.title}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{c.description}</p>
                    {isActive ? (
                      <p className="text-[11px] font-medium text-amber-600 text-center py-4 bg-amber-50 rounded-lg">
                        Open editor
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
                        Coming soon
                      </p>
                    )}
                  </>
                )
                if (isActive) {
                  return (
                    <button
                      key={c.title}
                      type="button"
                      onClick={c.onClick}
                      className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-amber-300 hover:shadow-sm transition"
                    >
                      {body}
                    </button>
                  )
                }
                return (
                  <div
                    key={c.title}
                    className="bg-white rounded-xl border border-gray-200 p-4"
                  >
                    {body}
                  </div>
                )
              })}
            </div>
          </div>

          <div
            className="flex-none flex justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showRuleEditor && (
        <ReminderRulesEditor onClose={() => setShowRuleEditor(false)} />
      )}
      {showProjectNumbersEditor && (
        <ProjectNumbersEditor onClose={() => setShowProjectNumbersEditor(false)} />
      )}
      {showProposalFormEditor && (
        <ProposalFormSettingsEditor
          onClose={() => setShowProposalFormEditor(false)}
        />
      )}
      {showTakeoffTemplatesEditor && (
        <TakeoffTemplatesEditor
          onClose={() => setShowTakeoffTemplatesEditor(false)}
        />
      )}
      {showTakeoffDefaultsEditor && (
        <TakeoffDefaultsEditor
          onClose={() => setShowTakeoffDefaultsEditor(false)}
        />
      )}
    </Portal>
  )
}

interface SettingsTileProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  onClick: () => void
}

function SettingsTile({ icon: Icon, title, subtitle, onClick }: SettingsTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-md px-4 py-[14px] cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2e2e2e] hover:border-gray-300 dark:hover:border-[#3a3a3a] transition-all"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500 dark:text-[#a0a0a0] flex-shrink-0" />
        <span className="text-[13px] font-medium text-gray-900 dark:text-[#e5e5e5]">{title}</span>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] mt-1 ml-[22px]">{subtitle}</p>
    </button>
  )
}
