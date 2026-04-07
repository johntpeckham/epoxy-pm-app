'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  UsersIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  Settings2Icon,
  CameraIcon,
  UserIcon,
  Loader2Icon,
  XIcon,
  UserPlusIcon,
  ClipboardCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { moveToTrash } from '@/lib/trashBin'
import type { EmployeeProfile, EmployeeRole, EmployeeCustomFieldDefinition } from '@/types'

interface EmployeeManagementProps {
  /** Hide the built-in collapsed "Manage Employees" trigger card. */
  hideTrigger?: boolean
  /** Controlled main modal open state. When provided, parent controls open/close. */
  open?: boolean
  /** Called when the main modal open state should change. */
  onOpenChange?: (open: boolean) => void
  /** Render mode. "modal" = existing Portal overlay (Settings). "inline" = fills parent (Office work area). */
  mode?: 'modal' | 'inline'
  /** When in inline mode, rendered as a back button in the header. */
  onBack?: () => void
}

export default function EmployeeManagement({
  hideTrigger = false,
  open: openProp,
  onOpenChange,
  mode = 'modal',
  onBack,
}: EmployeeManagementProps = {}) {
  const isInline = mode === 'inline'
  const supabase = createClient()

  // Main modal open state — controlled when `open` prop is provided, else internal
  const [internalMainOpen, setInternalMainOpen] = useState(false)
  const isControlled = openProp !== undefined
  const mainOpen = isControlled ? (openProp as boolean) : internalMainOpen
  const setMainOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalMainOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  // Onboarding flow state
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1)

  // Employees
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)

  // Roles
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [addingRole, setAddingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)

  // Custom fields
  const [customFields, setCustomFields] = useState<EmployeeCustomFieldDefinition[]>([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [addingField, setAddingField] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null)
  const [confirmDeleteField, setConfirmDeleteField] = useState<EmployeeCustomFieldDefinition | null>(null)

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | null>(null)
  const [formCustomFields, setFormCustomFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Delete employee
  const [confirmDeleteEmployee, setConfirmDeleteEmployee] = useState<EmployeeProfile | null>(null)
  const [deletingEmployee, setDeletingEmployee] = useState(false)

  // Fetch all data
  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employee_profiles')
      .select('*')
      .order('name')
    setEmployees((data as EmployeeProfile[]) ?? [])
    setLoadingEmployees(false)
  }, [])

  const fetchRoles = useCallback(async () => {
    const { data } = await supabase
      .from('employee_roles')
      .select('*')
      .order('name')
    setRoles((data as EmployeeRole[]) ?? [])
  }, [])

  const fetchCustomFields = useCallback(async () => {
    const { data } = await supabase
      .from('employee_custom_field_definitions')
      .select('*')
      .order('created_at')
    setCustomFields((data as EmployeeCustomFieldDefinition[]) ?? [])
  }, [])

  useEffect(() => {
    fetchEmployees()
    fetchRoles()
    fetchCustomFields()
  }, [fetchEmployees, fetchRoles, fetchCustomFields])

  // ── Role Management ──

  async function handleAddRole() {
    if (!newRoleName.trim()) return
    setAddingRole(true)
    setRoleError(null)

    const { error } = await supabase
      .from('employee_roles')
      .insert({ name: newRoleName.trim() })

    if (error) {
      setRoleError(error.message.includes('duplicate') ? 'Role already exists' : error.message)
    } else {
      setNewRoleName('')
      await fetchRoles()
    }
    setAddingRole(false)
  }

  async function handleDeleteRole(role: EmployeeRole) {
    // Check if any employees are assigned to this role
    const { data: assigned } = await supabase
      .from('employee_profiles')
      .select('id')
      .eq('role', role.name)
      .limit(1)

    if (assigned && assigned.length > 0) {
      setRoleError(`Cannot delete "${role.name}" — employees are assigned to this role`)
      return
    }

    setDeletingRoleId(role.id)
    const { error } = await supabase
      .from('employee_roles')
      .delete()
      .eq('id', role.id)

    if (error) {
      setRoleError(error.message)
    } else {
      setRoleError(null)
      await fetchRoles()
    }
    setDeletingRoleId(null)
  }

  // ── Custom Field Management ──

  async function handleAddField() {
    if (!newFieldLabel.trim()) return
    setAddingField(true)
    setFieldError(null)

    const { error } = await supabase
      .from('employee_custom_field_definitions')
      .insert({ label: newFieldLabel.trim() })

    if (error) {
      setFieldError(error.message)
    } else {
      setNewFieldLabel('')
      await fetchCustomFields()
    }
    setAddingField(false)
  }

  async function handleDeleteField(field: EmployeeCustomFieldDefinition) {
    setDeletingFieldId(field.id)
    const { error } = await supabase
      .from('employee_custom_field_definitions')
      .delete()
      .eq('id', field.id)

    if (error) {
      setFieldError(error.message)
    } else {
      setFieldError(null)
      setConfirmDeleteField(null)
      await fetchCustomFields()
    }
    setDeletingFieldId(null)
  }

  // ── Employee Modal ──

  function resetEmployeeForm() {
    setEditingEmployee(null)
    setFormName('')
    setFormRole('')
    setFormNotes('')
    setFormPhotoUrl(null)
    setFormCustomFields({})
    setModalError(null)
  }

  function openAddModal() {
    resetEmployeeForm()
    setModalOpen(true)
  }

  function openOnboarding() {
    resetEmployeeForm()
    setOnboardingStep(1)
    setOnboardingOpen(true)
  }

  function closeOnboarding() {
    setOnboardingOpen(false)
    setOnboardingStep(1)
    setModalError(null)
  }

  async function handleOnboardingStep1Submit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setModalError('Name is required')
      return
    }

    setSaving(true)
    setModalError(null)

    const payload = {
      name: formName.trim(),
      photo_url: formPhotoUrl,
      role: formRole || null,
      notes: formNotes.trim() || null,
      custom_fields: Object.keys(formCustomFields).length > 0 ? formCustomFields : null,
      updated_at: new Date().toISOString(),
    }

    try {
      const { error } = await supabase.from('employee_profiles').insert(payload)
      if (error) throw error
      await fetchEmployees()
      setOnboardingStep(2)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  function openEditModal(emp: EmployeeProfile) {
    setEditingEmployee(emp)
    setFormName(emp.name)
    setFormRole(emp.role ?? '')
    setFormNotes(emp.notes ?? '')
    setFormPhotoUrl(emp.photo_url)
    setFormCustomFields(emp.custom_fields ?? {})
    setModalError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingEmployee(null)
    setModalError(null)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setModalError('Please upload a PNG, JPG, GIF, or WebP file')
      return
    }

    setPhotoUploading(true)
    setModalError(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `employees/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('employee-photos')
        .getPublicUrl(path)

      setFormPhotoUrl(urlData.publicUrl)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setModalError('Name is required')
      return
    }

    setSaving(true)
    setModalError(null)

    const payload = {
      name: formName.trim(),
      photo_url: formPhotoUrl,
      role: formRole || null,
      notes: formNotes.trim() || null,
      custom_fields: Object.keys(formCustomFields).length > 0 ? formCustomFields : null,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employee_profiles')
          .update(payload)
          .eq('id', editingEmployee.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('employee_profiles')
          .insert(payload)
        if (error) throw error
      }

      await fetchEmployees()
      closeModal()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteEmployee() {
    if (!confirmDeleteEmployee) return
    setDeletingEmployee(true)

    try {
      const { data: snapshot } = await supabase.from('employee_profiles').select('*').eq('id', confirmDeleteEmployee.id).single()
      if (!snapshot) throw new Error('Employee not found')

      const { data: { user } } = await supabase.auth.getUser()
      const deletedBy = user?.id ?? 'unknown'

      const { error: trashError } = await moveToTrash(supabase, 'employee', confirmDeleteEmployee.id, confirmDeleteEmployee.name, deletedBy, snapshot as Record<string, unknown>)
      if (trashError) throw new Error(trashError)

      await fetchEmployees()
      setConfirmDeleteEmployee(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete employee')
    } finally {
      setDeletingEmployee(false)
    }
  }

  return (
    <>
      {/* Collapsed card — hidden when used as a standalone workspace (e.g. Office page) */}
      {!hideTrigger && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <UsersIcon className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">
              Employee Management
            </h2>
            <button
              onClick={() => setMainOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-700 text-xs font-medium rounded-lg transition"
            >
              <UsersIcon className="w-3.5 h-3.5" />
              Manage Employees
            </button>
          </div>
          <p className="text-xs text-gray-400">Manage employee profiles, roles, and custom fields.</p>
        </div>
      )}

      {/* Full modal (or inline workspace in Office page) */}
      {mainOpen && (() => {
      const mainContent = (
        <>
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-6 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <div className="flex items-center gap-2">
              {isInline && onBack && (
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mr-2"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Office
                </button>
              )}
              <UsersIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Employee Management</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                title="Employee Settings"
              >
                <Settings2Icon className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={openOnboarding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium rounded-lg transition"
              >
                <UserPlusIcon className="w-3.5 h-3.5" />
                +Employee Onboarding
              </button>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Employee
              </button>
              {!isInline && (
                <button
                  onClick={() => setMainOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">

      {/* Employee Grid */}
      {loadingEmployees ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No employees added yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-6">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-sm transition bg-white flex flex-col"
            >
              {/* Photo area — ~100px tall */}
              <div className="w-full aspect-square bg-gray-100 overflow-hidden">
                {emp.photo_url ? (
                  <img
                    src={emp.photo_url}
                    alt=""
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserIcon className="w-7 h-7 text-gray-300" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="px-2 pt-1.5 pb-0.5">
                <p className="text-xs font-bold text-gray-900 truncate leading-tight">{emp.name}</p>
                {emp.role && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-0.5 truncate leading-tight">{emp.role}</p>
                )}
              </div>
              {/* Actions */}
              <div className="flex items-center gap-0.5 px-1.5 pb-1.5 mt-auto">
                <button
                  onClick={() => openEditModal(emp)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded transition"
                >
                  <PencilIcon className="w-2.5 h-2.5" />
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDeleteEmployee(emp)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                >
                  <Trash2Icon className="w-2.5 h-2.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Employee Settings Modal */}
      {settingsOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                style={{ minHeight: '56px' }}
              >
                <h3 className="text-lg font-semibold text-gray-900">Employee Settings</h3>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 min-h-0">
                {/* Manage Roles */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Manage Roles
                  </h4>
                  {roleError && <p className="text-xs text-red-500 mb-2">{roleError}</p>}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="New role name"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                    />
                    <button
                      onClick={handleAddRole}
                      disabled={addingRole || !newRoleName.trim()}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                    >
                      {addingRole ? '...' : 'Add'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {roles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50"
                      >
                        <span className="text-sm text-gray-700">{role.name}</span>
                        <button
                          onClick={() => handleDeleteRole(role)}
                          disabled={deletingRoleId === role.id}
                          className="text-gray-400 hover:text-red-500 transition disabled:opacity-50"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {roles.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No roles defined.</p>
                    )}
                  </div>
                </div>

                {/* Custom Fields */}
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Custom Fields
                  </h4>
                  {fieldError && <p className="text-xs text-red-500 mb-2">{fieldError}</p>}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      placeholder="Field label"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
                    />
                    <button
                      onClick={handleAddField}
                      disabled={addingField || !newFieldLabel.trim()}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                    >
                      {addingField ? '...' : 'Add'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {customFields.map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50"
                      >
                        <span className="text-sm text-gray-700">{field.label}</span>
                        <button
                          onClick={() => setConfirmDeleteField(field)}
                          disabled={deletingFieldId === field.id}
                          className="text-gray-400 hover:text-red-500 transition disabled:opacity-50"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {customFields.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No custom fields defined.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Add/Edit Employee Modal */}
      {modalOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={closeModal}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                style={{ minHeight: '56px' }}
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <form
                className="flex-1 flex flex-col overflow-hidden min-h-0"
                onSubmit={handleSaveEmployee}
              >
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
                  {modalError && <p className="text-xs text-red-500">{modalError}</p>}

                  {/* Photo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Photo</label>
                    <div className="flex items-center gap-4">
                      <div className="relative group">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                          {formPhotoUrl ? (
                            <img
                              src={formPhotoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserIcon className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={photoUploading}
                          className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                        >
                          <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={photoUploading}
                          className="text-sm font-medium text-amber-600 hover:text-amber-700 transition"
                        >
                          {photoUploading ? 'Uploading...' : 'Upload photo'}
                        </button>
                        <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF, or WebP</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label
                      htmlFor="emp-name"
                      className="block text-xs font-medium text-gray-500 mb-1"
                    >
                      Name *
                    </label>
                    <input
                      id="emp-name"
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Employee name"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label
                      htmlFor="emp-role"
                      className="block text-xs font-medium text-gray-500 mb-1"
                    >
                      Role
                    </label>
                    <select
                      id="emp-role"
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                    >
                      <option value="">No role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label
                      htmlFor="emp-notes"
                      className="block text-xs font-medium text-gray-500 mb-1"
                    >
                      Notes
                    </label>
                    <textarea
                      id="emp-notes"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Optional notes"
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition resize-none"
                    />
                  </div>

                  {/* Dynamic Custom Fields */}
                  {customFields.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Custom Fields
                      </h4>
                      <div className="space-y-3">
                        {customFields.map((field) => (
                          <div key={field.id}>
                            <label
                              htmlFor={`custom-${field.id}`}
                              className="block text-xs font-medium text-gray-500 mb-1"
                            >
                              {field.label}
                            </label>
                            <input
                              id={`custom-${field.id}`}
                              type="text"
                              value={formCustomFields[field.id] ?? ''}
                              onChange={(e) =>
                                setFormCustomFields((prev) => ({
                                  ...prev,
                                  [field.id]: e.target.value,
                                }))
                              }
                              placeholder={field.label}
                              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex-none flex items-center justify-end gap-2 p-4 md:pb-6 border-t border-gray-200"
                  style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
                >
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {saving
                      ? 'Saving...'
                      : editingEmployee
                        ? 'Save Changes'
                        : 'Add Employee'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {/* Employee Onboarding Flow */}
      {onboardingOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={closeOnboarding}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                style={{ minHeight: '56px' }}
              >
                <div className="flex items-center gap-2">
                  <UserPlusIcon className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-gray-900">Employee Onboarding</h3>
                </div>
                <button
                  onClick={closeOnboarding}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Stepper */}
              <div className="flex-none flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className={`flex items-center gap-2 ${onboardingStep === 1 ? 'text-amber-700' : 'text-gray-500'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    onboardingStep === 1 ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {onboardingStep === 1 ? '1' : '✓'}
                  </div>
                  <span className="text-xs font-semibold">Employee Info</span>
                </div>
                <div className="flex-1 h-px bg-gray-200" />
                <div className={`flex items-center gap-2 ${onboardingStep === 2 ? 'text-amber-700' : 'text-gray-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    onboardingStep === 2 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    2
                  </div>
                  <span className="text-xs font-semibold">Paperwork</span>
                </div>
              </div>

              {onboardingStep === 1 ? (
                <form
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                  onSubmit={handleOnboardingStep1Submit}
                >
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
                    {modalError && <p className="text-xs text-red-500">{modalError}</p>}

                    {/* Photo */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Photo</label>
                      <div className="flex items-center gap-4">
                        <div className="relative group">
                          <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                            {formPhotoUrl ? (
                              <img src={formPhotoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon className="w-6 h-6 text-gray-400" />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={photoUploading}
                            className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                          >
                            <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={photoUploading}
                            className="text-sm font-medium text-amber-600 hover:text-amber-700 transition"
                          >
                            {photoUploading ? 'Uploading...' : 'Upload photo'}
                          </button>
                          <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, GIF, or WebP</p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                      </div>
                    </div>

                    {/* Name */}
                    <div>
                      <label htmlFor="onboard-name" className="block text-xs font-medium text-gray-500 mb-1">
                        Name *
                      </label>
                      <input
                        id="onboard-name"
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Employee name"
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                      />
                    </div>

                    {/* Role */}
                    <div>
                      <label htmlFor="onboard-role" className="block text-xs font-medium text-gray-500 mb-1">
                        Role
                      </label>
                      <select
                        id="onboard-role"
                        value={formRole}
                        onChange={(e) => setFormRole(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                      >
                        <option value="">No role</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Notes */}
                    <div>
                      <label htmlFor="onboard-notes" className="block text-xs font-medium text-gray-500 mb-1">
                        Notes
                      </label>
                      <textarea
                        id="onboard-notes"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Optional notes"
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition resize-none"
                      />
                    </div>

                    {/* Dynamic Custom Fields */}
                    {customFields.length > 0 && (
                      <div className="pt-3 border-t border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          Custom Fields
                        </h4>
                        <div className="space-y-3">
                          {customFields.map((field) => (
                            <div key={field.id}>
                              <label
                                htmlFor={`onboard-custom-${field.id}`}
                                className="block text-xs font-medium text-gray-500 mb-1"
                              >
                                {field.label}
                              </label>
                              <input
                                id={`onboard-custom-${field.id}`}
                                type="text"
                                value={formCustomFields[field.id] ?? ''}
                                onChange={(e) =>
                                  setFormCustomFields((prev) => ({
                                    ...prev,
                                    [field.id]: e.target.value,
                                  }))
                                }
                                placeholder={field.label}
                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div
                    className="flex-none flex items-center justify-end gap-2 p-4 md:pb-6 border-t border-gray-200"
                    style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
                  >
                    <button
                      type="button"
                      onClick={closeOnboarding}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                    >
                      {saving ? 'Saving...' : 'Save & Continue'}
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Step 2: Paperwork placeholder */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 min-h-0 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                      <ClipboardCheckIcon className="w-8 h-8 text-amber-500" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 mb-2">
                      Onboarding Paperwork
                    </h4>
                    <p className="text-sm text-gray-500 max-w-md mb-1">
                      Onboarding documents and digital signatures coming soon.
                    </p>
                    <p className="text-xs text-gray-400 max-w-md">
                      New hires will be able to complete forms and sign on an iPad.
                    </p>
                  </div>

                  {/* Footer */}
                  <div
                    className="flex-none flex items-center justify-between gap-2 p-4 md:pb-6 border-t border-gray-200"
                    style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
                  >
                    <button
                      type="button"
                      onClick={() => setOnboardingStep(1)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
                    >
                      <ChevronLeftIcon className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={closeOnboarding}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition"
                    >
                      Finish
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Portal>
      )}

      {/* Confirm Delete Employee */}
      {confirmDeleteEmployee && (
        <ConfirmDialog
          title="Delete Employee"
          message={`Are you sure you want to delete "${confirmDeleteEmployee.name}"? It will be moved to the trash bin and can be restored within 30 days.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteEmployee}
          onCancel={() => setConfirmDeleteEmployee(null)}
          loading={deletingEmployee}
        />
      )}

      {/* Confirm Delete Custom Field */}
      {confirmDeleteField && (
        <ConfirmDialog
          title="Delete Custom Field"
          message={`Are you sure you want to delete the "${confirmDeleteField.label}" field? Any data stored in this field for existing employees will be lost.`}
          confirmLabel="Delete Field"
          onConfirm={() => handleDeleteField(confirmDeleteField)}
          onCancel={() => setConfirmDeleteField(null)}
          loading={deletingFieldId === confirmDeleteField.id}
        />
      )}
          </div>
        </>
      )
      if (isInline) {
        return (
          <div className="w-full h-full min-h-0 flex flex-col bg-white overflow-hidden">
            {mainContent}
          </div>
        )
      }
      return (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={() => setMainOpen(false)}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:w-[90vw] md:max-w-[90vw] h-full md:h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {mainContent}
            </div>
          </div>
        </Portal>
      )
      })()}
    </>
  )
}
