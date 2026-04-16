'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { CameraIcon, CheckIcon, ArrowLeftIcon, UploadIcon, BuildingIcon, Building2Icon, SlidersHorizontalIcon, UsersIcon, LayersIcon, DownloadIcon, ClipboardCheckIcon, Trash2Icon, ShieldCheckIcon, PencilIcon, PlusIcon, XIcon, ScrollTextIcon, MoonIcon, FileTextIcon, PackageIcon, TargetIcon, GitBranchIcon, BellIcon, TableIcon, CalculatorIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { Profile, CslbLicense } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import { useTheme } from '@/components/theme/ThemeProvider'
import UserManagement from './UserManagement'
import EmployeeManagement from './EmployeeManagement'
import PipelineStagesEditor from './PipelineStagesEditor'
import ReminderRulesEditor from './ReminderRulesEditor'
import CustomerManagementModal from '@/components/ui/CustomerManagementModal'
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
  const { role } = useUserRole()
  const isAdmin = role === 'admin'
  const isOfficeManager = role === 'office_manager'
  const isCrew = role === 'crew'

  // Customer management modal
  const [showCustomerManagement, setShowCustomerManagement] = useState(false)
  // Vendor management modal
  const [showVendorManagement, setShowVendorManagement] = useState(false)
  // Warranty management modal
  const [showWarrantyManagement, setShowWarrantyManagement] = useState(false)
  // Pre-Lien management modal
  const [showPreLienManagement, setShowPreLienManagement] = useState(false)
  // Sales management modal
  const [showSalesManagement, setShowSalesManagement] = useState(false)
  const isSalesman = role === 'salesman'

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
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/jobs')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-[#e5e5e5] hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[#e5e5e5] flex-1">Profile Settings</h1>
        </div>

        {/* Appearance Section */}
        <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <MoonIcon className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide">Appearance</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-[#e5e5e5]">Dark mode</p>
              <p className="text-xs text-gray-400 dark:text-[#6b6b6b] mt-0.5">Switch to dark theme</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDarkMode ? 'bg-amber-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Company Information Section */}
        {(isAdmin || isOfficeManager) ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Company Information</h2>
              {!companyInfoEditing && (
                <button
                  onClick={startEditCompanyInfo}
                  className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>

            {companyInfoEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Legal Company Name</label>
                  <input
                    value={ciLegalName}
                    onChange={(e) => setCiLegalName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g., Peckham Coatings Inc."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">DBA (Doing Business As)</label>
                  <input
                    value={ciDba}
                    onChange={(e) => setCiDba(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={ciEmail}
                      onChange={(e) => setCiEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="info@company.com"
                    />
                  </div>
                </div>
                {/* CSLB Licenses */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">CSLB License Numbers</label>
                  <div className="space-y-2">
                    {ciLicenses.map((license) => (
                      <div key={license.id} className="flex items-center gap-2">
                        <input
                          value={license.number}
                          onChange={(e) => updateLicense(license.id, 'number', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="License #"
                        />
                        <input
                          value={license.classification}
                          onChange={(e) => updateLicense(license.id, 'classification', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    <PlusIcon className="w-3.5 h-3.5" />
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
                  <div>
                    <p className="text-xs text-gray-400">Company Address</p>
                    <p className="text-gray-900 whitespace-pre-line">{companySettings?.company_address || <span className="text-gray-300 italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Mailing Address</p>
                    <p className="text-gray-900 whitespace-pre-line">{companySettings?.mailing_address || <span className="text-gray-300 italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-gray-900">{companySettings?.phone || <span className="text-gray-300 italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-gray-900">{companySettings?.email || <span className="text-gray-300 italic">Not set</span>}</p>
                  </div>
                </div>
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
              </div>
            )}
          </div>
        ) : (
          /* Read-only view for non-admin/non-office-manager users */
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Company Information</h2>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Legal Company Name</p>
                  <p className="text-gray-900">{companySettings?.legal_name || <span className="text-gray-300 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">DBA</p>
                  <p className="text-gray-900">{companySettings?.dba || <span className="text-gray-300 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-gray-900">{companySettings?.phone || <span className="text-gray-300 italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-gray-900">{companySettings?.email || <span className="text-gray-300 italic">Not set</span>}</p>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* Job Feed Form Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontalIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Job Feed Form Management</h2>
              <button
                onClick={() => router.push('/form-management')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <SlidersHorizontalIcon className="w-3.5 h-3.5" />
                Manage Forms
              </button>
            </div>
            <p className="text-xs text-gray-400">Customize form fields and layout for Daily Reports, JSA, Expenses, and more.</p>
          </div>
        )}

        {/* Job Report Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <FileTextIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Job Report Management</h2>
              <button
                onClick={() => router.push('/job-report-management')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <FileTextIcon className="w-3.5 h-3.5" />
                Manage Job Reports
              </button>
            </div>
            <p className="text-xs text-gray-400">Report form editor, material systems, and checklists for job reports.</p>
          </div>
        )}

        {/* Checklist Templates — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheckIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Checklist Templates</h2>
              <button
                onClick={() => router.push('/checklist-templates')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <ClipboardCheckIcon className="w-3.5 h-3.5" />
                Manage Templates
              </button>
            </div>
            <p className="text-xs text-gray-400">Create reusable checklists that can be applied to projects from the Job Board.</p>
          </div>
        )}

        {/* Warranty Management — Admin, Office Manager, Salesman */}
        {(isAdmin || isOfficeManager || isSalesman) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Warranty Management</h2>
              <button
                onClick={() => setShowWarrantyManagement(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                Manage Warranties
              </button>
            </div>
            <p className="text-xs text-gray-400">Create warranty templates and upload manufacturer warranty documents.</p>
          </div>
        )}

        {/* Pre-Lien Management — Admin, Office Manager, Salesman */}
        {(isAdmin || isOfficeManager || isSalesman) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <ScrollTextIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Pre-Lien Management</h2>
              <button
                onClick={() => setShowPreLienManagement(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <ScrollTextIcon className="w-3.5 h-3.5" />
                Manage Pre-Liens
              </button>
            </div>
            <p className="text-xs text-gray-400">Create pre-lien notice templates for California Civil Code compliance.</p>
          </div>
        )}

        {/* Data Export — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <DownloadIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Data Export</h2>
              <button
                onClick={() => router.push('/data-export')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Manage Data Export
              </button>
            </div>
            <p className="text-xs text-gray-400">Download reports, photos, and project data for a selected date range.</p>
          </div>
        )}

        {/* Material Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <PackageIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Material Management</h2>
              <button
                onClick={() => router.push('/material-management')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <PackageIcon className="w-3.5 h-3.5" />
                Manage Materials
              </button>
            </div>
            <p className="text-xs text-gray-400">Manage master supplier and product catalog. Single source of truth for all material names and pricing.</p>
          </div>
        )}

        {/* Trash Bin — Admin only */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Trash2Icon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">Trash Bin</h2>
              <button
                onClick={() => router.push('/trash-bin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Manage Trash
              </button>
            </div>
            <p className="text-xs text-gray-400">View, restore, or permanently delete items that have been removed. Items expire after 1 year.</p>
          </div>
        )}

        {/* User Management — Admin only */}
        {isAdmin && <UserManagement currentUserId={userId} />}

        {/* Employee Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && <EmployeeManagement />}

        {/* Customer Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <UsersIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">
                Customer Management
              </h2>
              <button
                onClick={() => setShowCustomerManagement(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <UsersIcon className="w-3.5 h-3.5" />
                Manage Customers
              </button>
            </div>
            <p className="text-xs text-gray-400">Manage customers across jobs, estimates, and billing.</p>
          </div>
        )}
        {showCustomerManagement && (
          <CustomerManagementModal
            open={showCustomerManagement}
            userId={userId}
            onClose={() => setShowCustomerManagement(false)}
            onCustomersChanged={() => {}}
          />
        )}

        {/* Sales Management — Admin, Office Manager, Salesman */}
        {(isAdmin || isOfficeManager || isSalesman) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <TargetIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">
                Sales Management
              </h2>
              <button
                onClick={() => setShowSalesManagement(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <SlidersHorizontalIcon className="w-3.5 h-3.5" />
                Manage Sales
              </button>
            </div>
            <p className="text-xs text-gray-400">Configure the estimate form, pipeline, notifications, and takeoff tool.</p>
          </div>
        )}
        {showSalesManagement && (
          <SalesManagementModal onClose={() => setShowSalesManagement(false)} />
        )}

        {/* Vendor Management — Admin and Office Manager */}
        {(isAdmin || isOfficeManager) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Building2Icon className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">
                Vendor Management
              </h2>
              <button
                onClick={() => setShowVendorManagement(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
              >
                <Building2Icon className="w-3.5 h-3.5" />
                Manage Vendors
              </button>
            </div>
            <p className="text-xs text-gray-400">Manage vendors and their contacts — companies we buy from.</p>
          </div>
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
      </div>
    </div>
  )
}

function SalesManagementModal({ onClose }: { onClose: () => void }) {
  const [showPipelineEditor, setShowPipelineEditor] = useState(false)
  const [showRuleEditor, setShowRuleEditor] = useState(false)

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
    },
    {
      icon: <GitBranchIcon className="w-5 h-5" />,
      title: 'Edit Pipeline Visual',
      description: 'Rename or reorder stages shown on the sales pipeline.',
      onClick: () => setShowPipelineEditor(true),
    },
    {
      icon: <BellIcon className="w-5 h-5" />,
      title: 'Edit Notifications and Follow-ups',
      description: 'Configure reminders and follow-up cadences for leads.',
      onClick: () => setShowRuleEditor(true),
    },
    {
      icon: <TableIcon className="w-5 h-5" />,
      title: 'Edit Takeoff Tool',
      description: 'Adjust how measurement takeoffs are captured.',
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
              <h3 className="text-base font-bold text-gray-900">Sales Management</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
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

      {showPipelineEditor && (
        <PipelineStagesEditor onClose={() => setShowPipelineEditor(false)} />
      )}
      {showRuleEditor && (
        <ReminderRulesEditor onClose={() => setShowRuleEditor(false)} />
      )}
    </Portal>
  )
}
