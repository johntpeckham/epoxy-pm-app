'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  GripVerticalIcon,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useTheme } from '@/components/theme/ThemeProvider'
import { moveToTrash } from '@/lib/trashBin'
import type { EmployeeProfile, EmployeeRole, EmployeeCustomFieldDefinition, EmployeeCertification, EmployeeCertificationAssignment, EmployeeOshaTraining, EmployeeOshaAssignment, Crew, SkillType, EmployeeCrew, EmployeeSkillType } from '@/types'

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
]

function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#1F2937' : '#FFFFFF'
}

/**
 * Dark-mode-aware pill style for the certification / OSHA pills, which use
 * raw hex colors from the database.  In light mode we keep the existing
 * full-saturation background + contrast text.  In dark mode we drop to a
 * 20%-opacity background of the same color and use a lightened version of
 * the color as text, so bright neon pills don't clash with dark cards.
 */
function pillStyle(hex: string, isDark: boolean): { backgroundColor: string; color: string } {
  if (!isDark) {
    return { backgroundColor: hex, color: contrastText(hex) }
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Lighten the text toward white so it reads well on the 20% translucent
  // version of itself sitting on a #242424 card.
  const lr = Math.round(r + (255 - r) * 0.4)
  const lg = Math.round(g + (255 - g) * 0.4)
  const lb = Math.round(b + (255 - b) * 0.4)
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.20)`,
    color: `rgb(${lr}, ${lg}, ${lb})`,
  }
}

function ColorPickerDropdown({
  color,
  onChange,
  open,
  onToggle,
}: {
  color: string
  onChange: (c: string) => void
  open: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onToggle])

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        className="w-7 h-7 rounded-full border-2 border-gray-200 hover:border-gray-400 transition flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52">
          <div className="grid grid-cols-5 gap-2 mb-3">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); onToggle() }}
                className={`w-7 h-7 rounded-full border-2 transition ${c === color ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-400'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Custom:</span>
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-6 border-0 p-0 cursor-pointer rounded"
            />
            <span className="text-xs text-gray-400 font-mono">{color}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableRoleRow({
  role,
  onRename,
  onDelete,
  deleting,
}: {
  role: EmployeeRole
  onRename: (role: EmployeeRole, newName: string) => void
  onDelete: (role: EmployeeRole) => void
  deleting: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role.id })
  const [localName, setLocalName] = useState(role.name)

  useEffect(() => {
    setLocalName(role.name)
  }, [role.name])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleBlur() {
    if (localName.trim() !== role.name) {
      onRename(role, localName)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-md bg-gray-50 ${isDragging ? 'z-50 opacity-80 shadow-lg ring-2 ring-amber-400' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent border border-transparent rounded px-2 py-0.5 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
      />
      <button
        onClick={() => onDelete(role)}
        disabled={deleting}
        className="text-gray-400 hover:text-red-500 transition disabled:opacity-50 flex-shrink-0"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

type ColoredItem = { id: string; name: string; color: string; sort_order: number; created_at: string }

function SortableCertRow<T extends ColoredItem>({
  cert,
  onRename,
  onDelete,
  onColorChange,
  deleting,
}: {
  cert: T
  onRename: (cert: T, newName: string) => void
  onDelete: (cert: T) => void
  onColorChange: (cert: T, color: string) => void
  deleting: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cert.id })
  const [localName, setLocalName] = useState(cert.name)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    setLocalName(cert.name)
  }, [cert.name])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleBlur() {
    if (localName.trim() !== cert.name) {
      onRename(cert, localName)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-md bg-gray-50 ${isDragging ? 'z-50 opacity-80 shadow-lg ring-2 ring-amber-400' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </div>
      <ColorPickerDropdown
        color={cert.color}
        onChange={(c) => onColorChange(cert, c)}
        open={pickerOpen}
        onToggle={() => setPickerOpen(!pickerOpen)}
      />
      <input
        type="text"
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent border border-transparent rounded px-2 py-0.5 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
      />
      <button
        onClick={() => onDelete(cert)}
        disabled={deleting}
        className="text-gray-400 hover:text-red-500 transition disabled:opacity-50 flex-shrink-0"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

type NamedItem = { id: string; name: string }

function SimpleNamedRow<T extends NamedItem>({
  item,
  onRename,
  onDelete,
  deleting,
}: {
  item: T
  onRename: (item: T, newName: string) => void
  onDelete: (item: T) => void
  deleting: boolean
}) {
  const [localName, setLocalName] = useState(item.name)
  const [lastSeenName, setLastSeenName] = useState(item.name)
  // Sync local edit buffer when the prop name changes (e.g. after rename)
  // without using useEffect — avoids cascading render warnings.
  if (item.name !== lastSeenName) {
    setLastSeenName(item.name)
    setLocalName(item.name)
  }

  function handleBlur() {
    if (localName.trim() !== item.name) {
      onRename(item, localName)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-gray-50">
      <input
        type="text"
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent border border-transparent rounded px-2 py-0.5 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
      />
      <button
        onClick={() => onDelete(item)}
        disabled={deleting}
        className="text-gray-400 hover:text-red-500 transition disabled:opacity-50 flex-shrink-0"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

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
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

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

  // Certifications
  const [certifications, setCertifications] = useState<EmployeeCertification[]>([])
  const [certAssignments, setCertAssignments] = useState<EmployeeCertificationAssignment[]>([])
  const [newCertName, setNewCertName] = useState('')
  const [newCertColor, setNewCertColor] = useState('#3B82F6')
  const [newCertPickerOpen, setNewCertPickerOpen] = useState(false)
  const [addingCert, setAddingCert] = useState(false)
  const [certError, setCertError] = useState<string | null>(null)
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null)

  // OSHA trainings
  const [oshaTrainings, setOshaTrainings] = useState<EmployeeOshaTraining[]>([])
  const [oshaAssignments, setOshaAssignments] = useState<EmployeeOshaAssignment[]>([])
  const [newOshaName, setNewOshaName] = useState('')
  const [newOshaColor, setNewOshaColor] = useState('#22C55E')
  const [newOshaPickerOpen, setNewOshaPickerOpen] = useState(false)
  const [addingOsha, setAddingOsha] = useState(false)
  const [oshaError, setOshaError] = useState<string | null>(null)
  const [deletingOshaId, setDeletingOshaId] = useState<string | null>(null)

  // Crews
  const [crews, setCrews] = useState<Crew[]>([])
  const [crewAssignments, setCrewAssignments] = useState<EmployeeCrew[]>([])
  const [newCrewName, setNewCrewName] = useState('')
  const [addingCrew, setAddingCrew] = useState(false)
  const [crewError, setCrewError] = useState<string | null>(null)
  const [confirmDeleteCrew, setConfirmDeleteCrew] = useState<Crew | null>(null)
  const [deletingCrewId, setDeletingCrewId] = useState<string | null>(null)

  // Skill Types
  const [skillTypes, setSkillTypes] = useState<SkillType[]>([])
  const [skillTypeAssignments, setSkillTypeAssignments] = useState<EmployeeSkillType[]>([])
  const [newSkillTypeName, setNewSkillTypeName] = useState('')
  const [addingSkillType, setAddingSkillType] = useState(false)
  const [skillTypeError, setSkillTypeError] = useState<string | null>(null)
  const [confirmDeleteSkillType, setConfirmDeleteSkillType] = useState<SkillType | null>(null)
  const [deletingSkillTypeId, setDeletingSkillTypeId] = useState<string | null>(null)

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | null>(null)
  const [formCustomFields, setFormCustomFields] = useState<Record<string, string>>({})
  const [formCertIds, setFormCertIds] = useState<Set<string>>(new Set())
  const [formOshaIds, setFormOshaIds] = useState<Set<string>>(new Set())
  const [formCrewIds, setFormCrewIds] = useState<Set<string>>(new Set())
  const [formSkillTypeIds, setFormSkillTypeIds] = useState<Set<string>>(new Set())
  // Pending crew selection awaiting user confirmation when employee is
  // already assigned to another crew. null = no pending confirmation.
  const [pendingCrewId, setPendingCrewId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false)

  // View mode: group employees by role (default), crew, or skill type
  const [viewMode, setViewMode] = useState<'all' | 'crew' | 'skill'>('all')

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
      .order('sort_order')
    setRoles((data as EmployeeRole[]) ?? [])
  }, [])

  const fetchCustomFields = useCallback(async () => {
    const { data } = await supabase
      .from('employee_custom_field_definitions')
      .select('*')
      .order('created_at')
    setCustomFields((data as EmployeeCustomFieldDefinition[]) ?? [])
  }, [])

  const fetchCertifications = useCallback(async () => {
    const { data } = await supabase
      .from('employee_certifications')
      .select('*')
      .order('sort_order')
    setCertifications((data as EmployeeCertification[]) ?? [])
  }, [])

  const fetchCertAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('employee_certification_assignments')
      .select('*')
    setCertAssignments((data as EmployeeCertificationAssignment[]) ?? [])
  }, [])

  const fetchOshaTrainings = useCallback(async () => {
    const { data } = await supabase
      .from('employee_osha_trainings')
      .select('*')
      .order('sort_order')
    setOshaTrainings((data as EmployeeOshaTraining[]) ?? [])
  }, [])

  const fetchOshaAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('employee_osha_assignments')
      .select('*')
    setOshaAssignments((data as EmployeeOshaAssignment[]) ?? [])
  }, [])

  const fetchCrews = useCallback(async () => {
    const { data } = await supabase
      .from('crews')
      .select('*')
      .order('name')
    setCrews((data as Crew[]) ?? [])
  }, [])

  const fetchCrewAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('employee_crews')
      .select('*')
    setCrewAssignments((data as EmployeeCrew[]) ?? [])
  }, [])

  const fetchSkillTypes = useCallback(async () => {
    const { data } = await supabase
      .from('skill_types')
      .select('*')
      .order('name')
    setSkillTypes((data as SkillType[]) ?? [])
  }, [])

  const fetchSkillTypeAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('employee_skill_types')
      .select('*')
    setSkillTypeAssignments((data as EmployeeSkillType[]) ?? [])
  }, [])

  useEffect(() => {
    fetchEmployees()
    fetchRoles()
    fetchCustomFields()
    fetchCertifications()
    fetchCertAssignments()
    fetchOshaTrainings()
    fetchOshaAssignments()
    fetchCrews()
    fetchCrewAssignments()
    fetchSkillTypes()
    fetchSkillTypeAssignments()
  }, [fetchEmployees, fetchRoles, fetchCustomFields, fetchCertifications, fetchCertAssignments, fetchOshaTrainings, fetchOshaAssignments, fetchCrews, fetchCrewAssignments, fetchSkillTypes, fetchSkillTypeAssignments])

  // ── Role Management ──

  async function handleAddRole() {
    if (!newRoleName.trim()) return
    setAddingRole(true)
    setRoleError(null)

    const nextOrder = roles.length > 0 ? Math.max(...roles.map(r => r.sort_order)) + 1 : 1

    const { error } = await supabase
      .from('employee_roles')
      .insert({ name: newRoleName.trim(), sort_order: nextOrder })

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

  async function handleRenameRole(role: EmployeeRole, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setRoleError('Role name cannot be empty')
      return
    }
    if (trimmed === role.name) return // no change

    // Check for duplicate name
    const duplicate = roles.find(r => r.id !== role.id && r.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setRoleError(`Role "${trimmed}" already exists`)
      return
    }

    setRoleError(null)
    const { error } = await supabase
      .from('employee_roles')
      .update({ name: trimmed })
      .eq('id', role.id)

    if (error) {
      setRoleError(error.message)
      return
    }

    // Update all employee_profiles that reference the old role name
    await supabase
      .from('employee_profiles')
      .update({ role: trimmed })
      .eq('role', role.name)

    await fetchRoles()
    await fetchEmployees()
  }

  async function handleRoleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = roles.findIndex(r => r.id === active.id)
    const newIdx = roles.findIndex(r => r.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...roles]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    // Optimistically update local state
    const updated = reordered.map((r, i) => ({ ...r, sort_order: i + 1 }))
    setRoles(updated)

    // Persist all sort_order values
    for (const r of updated) {
      await supabase
        .from('employee_roles')
        .update({ sort_order: r.sort_order })
        .eq('id', r.id)
    }
  }

  // ── Certification Management ──

  async function handleAddCert() {
    if (!newCertName.trim()) return
    setAddingCert(true)
    setCertError(null)

    const nextOrder = certifications.length > 0 ? Math.max(...certifications.map(c => c.sort_order)) + 1 : 1

    const { error } = await supabase
      .from('employee_certifications')
      .insert({ name: newCertName.trim(), color: newCertColor, sort_order: nextOrder })

    if (error) {
      setCertError(error.message)
    } else {
      setNewCertName('')
      setNewCertColor('#3B82F6')
      await fetchCertifications()
    }
    setAddingCert(false)
  }

  async function handleDeleteCert(cert: EmployeeCertification) {
    setDeletingCertId(cert.id)
    const { error } = await supabase
      .from('employee_certifications')
      .delete()
      .eq('id', cert.id)

    if (error) {
      setCertError(error.message)
    } else {
      setCertError(null)
      await fetchCertifications()
      await fetchCertAssignments()
    }
    setDeletingCertId(null)
  }

  async function handleRenameCert(cert: EmployeeCertification, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCertError('Certification name cannot be empty')
      return
    }
    if (trimmed === cert.name) return

    const duplicate = certifications.find(c => c.id !== cert.id && c.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setCertError(`Certification "${trimmed}" already exists`)
      return
    }

    setCertError(null)
    const { error } = await supabase
      .from('employee_certifications')
      .update({ name: trimmed })
      .eq('id', cert.id)

    if (error) {
      setCertError(error.message)
    } else {
      await fetchCertifications()
    }
  }

  async function handleCertColorChange(cert: EmployeeCertification, color: string) {
    setCertError(null)
    const { error } = await supabase
      .from('employee_certifications')
      .update({ color })
      .eq('id', cert.id)

    if (error) {
      setCertError(error.message)
    } else {
      await fetchCertifications()
    }
  }

  async function handleCertDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = certifications.findIndex(c => c.id === active.id)
    const newIdx = certifications.findIndex(c => c.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...certifications]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    const updated = reordered.map((c, i) => ({ ...c, sort_order: i + 1 }))
    setCertifications(updated)

    for (const c of updated) {
      await supabase
        .from('employee_certifications')
        .update({ sort_order: c.sort_order })
        .eq('id', c.id)
    }
  }

  // ── OSHA Training Management ──

  async function handleAddOsha() {
    if (!newOshaName.trim()) return
    setAddingOsha(true)
    setOshaError(null)

    const nextOrder = oshaTrainings.length > 0 ? Math.max(...oshaTrainings.map(o => o.sort_order)) + 1 : 1

    const { error } = await supabase
      .from('employee_osha_trainings')
      .insert({ name: newOshaName.trim(), color: newOshaColor, sort_order: nextOrder })

    if (error) {
      setOshaError(error.message)
    } else {
      setNewOshaName('')
      setNewOshaColor('#22C55E')
      await fetchOshaTrainings()
    }
    setAddingOsha(false)
  }

  async function handleDeleteOsha(osha: EmployeeOshaTraining) {
    setDeletingOshaId(osha.id)
    const { error } = await supabase
      .from('employee_osha_trainings')
      .delete()
      .eq('id', osha.id)

    if (error) {
      setOshaError(error.message)
    } else {
      setOshaError(null)
      await fetchOshaTrainings()
      await fetchOshaAssignments()
    }
    setDeletingOshaId(null)
  }

  async function handleRenameOsha(osha: EmployeeOshaTraining, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setOshaError('Training name cannot be empty')
      return
    }
    if (trimmed === osha.name) return

    const duplicate = oshaTrainings.find(o => o.id !== osha.id && o.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setOshaError(`Training "${trimmed}" already exists`)
      return
    }

    setOshaError(null)
    const { error } = await supabase
      .from('employee_osha_trainings')
      .update({ name: trimmed })
      .eq('id', osha.id)

    if (error) {
      setOshaError(error.message)
    } else {
      await fetchOshaTrainings()
    }
  }

  async function handleOshaColorChange(osha: EmployeeOshaTraining, color: string) {
    setOshaError(null)
    const { error } = await supabase
      .from('employee_osha_trainings')
      .update({ color })
      .eq('id', osha.id)

    if (error) {
      setOshaError(error.message)
    } else {
      await fetchOshaTrainings()
    }
  }

  async function handleOshaDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = oshaTrainings.findIndex(o => o.id === active.id)
    const newIdx = oshaTrainings.findIndex(o => o.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...oshaTrainings]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    const updated = reordered.map((o, i) => ({ ...o, sort_order: i + 1 }))
    setOshaTrainings(updated)

    for (const o of updated) {
      await supabase
        .from('employee_osha_trainings')
        .update({ sort_order: o.sort_order })
        .eq('id', o.id)
    }
  }

  // ── Crew Management ──

  async function handleAddCrew() {
    if (!newCrewName.trim()) return
    setAddingCrew(true)
    setCrewError(null)

    const trimmed = newCrewName.trim()
    const duplicate = crews.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setCrewError(`Crew "${trimmed}" already exists`)
      setAddingCrew(false)
      return
    }

    const { error } = await supabase
      .from('crews')
      .insert({ name: trimmed })

    if (error) {
      setCrewError(error.message)
    } else {
      setNewCrewName('')
      await fetchCrews()
    }
    setAddingCrew(false)
  }

  async function handleRenameCrew(crew: Crew, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCrewError('Crew name cannot be empty')
      return
    }
    if (trimmed === crew.name) return

    const duplicate = crews.find(c => c.id !== crew.id && c.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setCrewError(`Crew "${trimmed}" already exists`)
      return
    }

    setCrewError(null)
    const { error } = await supabase
      .from('crews')
      .update({ name: trimmed })
      .eq('id', crew.id)

    if (error) {
      setCrewError(error.message)
    } else {
      await fetchCrews()
    }
  }

  async function handleDeleteCrew(crew: Crew) {
    setDeletingCrewId(crew.id)
    const { error } = await supabase
      .from('crews')
      .delete()
      .eq('id', crew.id)

    if (error) {
      setCrewError(error.message)
    } else {
      setCrewError(null)
      setConfirmDeleteCrew(null)
      await fetchCrews()
    }
    setDeletingCrewId(null)
  }

  // ── Skill Type Management ──

  async function handleAddSkillType() {
    if (!newSkillTypeName.trim()) return
    setAddingSkillType(true)
    setSkillTypeError(null)

    const trimmed = newSkillTypeName.trim()
    const duplicate = skillTypes.find(s => s.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setSkillTypeError(`Skill type "${trimmed}" already exists`)
      setAddingSkillType(false)
      return
    }

    const { error } = await supabase
      .from('skill_types')
      .insert({ name: trimmed })

    if (error) {
      setSkillTypeError(error.message)
    } else {
      setNewSkillTypeName('')
      await fetchSkillTypes()
    }
    setAddingSkillType(false)
  }

  async function handleRenameSkillType(skillType: SkillType, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setSkillTypeError('Skill type name cannot be empty')
      return
    }
    if (trimmed === skillType.name) return

    const duplicate = skillTypes.find(s => s.id !== skillType.id && s.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setSkillTypeError(`Skill type "${trimmed}" already exists`)
      return
    }

    setSkillTypeError(null)
    const { error } = await supabase
      .from('skill_types')
      .update({ name: trimmed })
      .eq('id', skillType.id)

    if (error) {
      setSkillTypeError(error.message)
    } else {
      await fetchSkillTypes()
    }
  }

  async function handleDeleteSkillType(skillType: SkillType) {
    setDeletingSkillTypeId(skillType.id)
    const { error } = await supabase
      .from('skill_types')
      .delete()
      .eq('id', skillType.id)

    if (error) {
      setSkillTypeError(error.message)
    } else {
      setSkillTypeError(null)
      setConfirmDeleteSkillType(null)
      await fetchSkillTypes()
    }
    setDeletingSkillTypeId(null)
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
    setFormCertIds(new Set())
    setFormOshaIds(new Set())
    setFormCrewIds(new Set())
    setFormSkillTypeIds(new Set())
    setPendingCrewId(null)
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
      const { data: inserted, error } = await supabase.from('employee_profiles').insert(payload).select('id').single()
      if (error) throw error

      // Sync certification assignments
      const certRows = Array.from(formCertIds).map(certId => ({
        employee_id: inserted.id,
        certification_id: certId,
      }))
      if (certRows.length > 0) {
        await supabase.from('employee_certification_assignments').insert(certRows)
      }

      // Sync OSHA assignments
      const oshaRows = Array.from(formOshaIds).map(oshaId => ({
        employee_id: inserted.id,
        osha_training_id: oshaId,
      }))
      if (oshaRows.length > 0) {
        await supabase.from('employee_osha_assignments').insert(oshaRows)
      }

      // Sync crew assignments
      const crewRows = Array.from(formCrewIds).map(crewId => ({
        employee_id: inserted.id,
        crew_id: crewId,
      }))
      if (crewRows.length > 0) {
        await supabase.from('employee_crews').insert(crewRows)
      }

      // Sync skill type assignments
      const skillTypeRows = Array.from(formSkillTypeIds).map(skillTypeId => ({
        employee_id: inserted.id,
        skill_type_id: skillTypeId,
      }))
      if (skillTypeRows.length > 0) {
        await supabase.from('employee_skill_types').insert(skillTypeRows)
      }

      await fetchEmployees()
      await fetchCertAssignments()
      await fetchOshaAssignments()
      await fetchCrewAssignments()
      await fetchSkillTypeAssignments()
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
    const empCertIds = certAssignments
      .filter(a => a.employee_id === emp.id)
      .map(a => a.certification_id)
    setFormCertIds(new Set(empCertIds))
    const empOshaIds = oshaAssignments
      .filter(a => a.employee_id === emp.id)
      .map(a => a.osha_training_id)
    setFormOshaIds(new Set(empOshaIds))
    const empCrewIds = crewAssignments
      .filter(a => a.employee_id === emp.id)
      .map(a => a.crew_id)
    setFormCrewIds(new Set(empCrewIds))
    const empSkillTypeIds = skillTypeAssignments
      .filter(a => a.employee_id === emp.id)
      .map(a => a.skill_type_id)
    setFormSkillTypeIds(new Set(empSkillTypeIds))
    setPendingCrewId(null)
    setModalError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingEmployee(null)
    setModalError(null)
  }

  // ── Crew / Skill Type selection on the employee form ──

  /**
   * Toggles a crew selection on the employee form. If the user is trying
   * to ADD a new crew and the employee already has at least one other
   * crew assigned, show a confirmation dialog first.
   */
  function toggleFormCrew(crewId: string) {
    if (formCrewIds.has(crewId)) {
      // Removing an existing selection — no confirmation needed.
      setFormCrewIds(prev => {
        const next = new Set(prev)
        next.delete(crewId)
        return next
      })
      return
    }
    // Adding a new crew. If any other crew is already selected, ask.
    if (formCrewIds.size > 0) {
      setPendingCrewId(crewId)
      return
    }
    setFormCrewIds(prev => {
      const next = new Set(prev)
      next.add(crewId)
      return next
    })
  }

  function confirmPendingCrew() {
    if (!pendingCrewId) return
    const id = pendingCrewId
    setFormCrewIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setPendingCrewId(null)
  }

  function toggleFormSkillType(skillTypeId: string) {
    setFormSkillTypeIds(prev => {
      const next = new Set(prev)
      if (next.has(skillTypeId)) {
        next.delete(skillTypeId)
      } else {
        next.add(skillTypeId)
      }
      return next
    })
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
      let employeeId: string
      if (editingEmployee) {
        const { error } = await supabase
          .from('employee_profiles')
          .update(payload)
          .eq('id', editingEmployee.id)
        if (error) throw error
        employeeId = editingEmployee.id
      } else {
        const { data: inserted, error } = await supabase
          .from('employee_profiles')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        employeeId = inserted.id
      }

      // Sync certification assignments
      await supabase
        .from('employee_certification_assignments')
        .delete()
        .eq('employee_id', employeeId)
      const certRows = Array.from(formCertIds).map(certId => ({
        employee_id: employeeId,
        certification_id: certId,
      }))
      if (certRows.length > 0) {
        await supabase
          .from('employee_certification_assignments')
          .insert(certRows)
      }

      // Sync OSHA assignments
      await supabase
        .from('employee_osha_assignments')
        .delete()
        .eq('employee_id', employeeId)
      const oshaRows = Array.from(formOshaIds).map(oshaId => ({
        employee_id: employeeId,
        osha_training_id: oshaId,
      }))
      if (oshaRows.length > 0) {
        await supabase
          .from('employee_osha_assignments')
          .insert(oshaRows)
      }

      // Sync crew assignments — compute diff so unchanged rows are left alone
      const existingCrewIds = new Set(
        crewAssignments
          .filter(a => a.employee_id === employeeId)
          .map(a => a.crew_id)
      )
      const crewIdsToAdd = Array.from(formCrewIds).filter(id => !existingCrewIds.has(id))
      const crewIdsToRemove = Array.from(existingCrewIds).filter(id => !formCrewIds.has(id))
      if (crewIdsToRemove.length > 0) {
        await supabase
          .from('employee_crews')
          .delete()
          .eq('employee_id', employeeId)
          .in('crew_id', crewIdsToRemove)
      }
      if (crewIdsToAdd.length > 0) {
        await supabase
          .from('employee_crews')
          .insert(crewIdsToAdd.map(crewId => ({ employee_id: employeeId, crew_id: crewId })))
      }

      // Sync skill type assignments — compute diff so unchanged rows are left alone
      const existingSkillTypeIds = new Set(
        skillTypeAssignments
          .filter(a => a.employee_id === employeeId)
          .map(a => a.skill_type_id)
      )
      const skillTypeIdsToAdd = Array.from(formSkillTypeIds).filter(id => !existingSkillTypeIds.has(id))
      const skillTypeIdsToRemove = Array.from(existingSkillTypeIds).filter(id => !formSkillTypeIds.has(id))
      if (skillTypeIdsToRemove.length > 0) {
        await supabase
          .from('employee_skill_types')
          .delete()
          .eq('employee_id', employeeId)
          .in('skill_type_id', skillTypeIdsToRemove)
      }
      if (skillTypeIdsToAdd.length > 0) {
        await supabase
          .from('employee_skill_types')
          .insert(skillTypeIdsToAdd.map(skillTypeId => ({ employee_id: employeeId, skill_type_id: skillTypeId })))
      }

      await fetchEmployees()
      await fetchCertAssignments()
      await fetchOshaAssignments()
      await fetchCrewAssignments()
      await fetchSkillTypeAssignments()
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

  // Group employees for the current view mode.
  //  - 'all':   group by role, following employee_roles sort_order
  //  - 'crew':  group by crew assignment (one group per crew, duplicates allowed
  //             if an employee belongs to multiple crews)
  //  - 'skill': same as 'crew' but by skill type
  const groupedEmployees = useMemo(() => {
    if (viewMode === 'all') {
      const groups: { roleName: string; employees: EmployeeProfile[] }[] = []
      const assignedIds = new Set<string>()

      for (const role of roles) {
        const matched = employees.filter(emp => emp.role === role.name)
        if (matched.length > 0) {
          groups.push({ roleName: role.name, employees: matched })
          matched.forEach(emp => assignedIds.add(emp.id))
        }
      }

      // Employees with no role or an unrecognized role
      const unassigned = employees.filter(emp => !assignedIds.has(emp.id))
      if (unassigned.length > 0) {
        groups.push({ roleName: 'Unassigned', employees: unassigned })
      }

      return groups
    }

    // By Crew / By Skill: build a map of group-name → employees. An
    // employee appears under EACH group they belong to.
    const empById = new Map(employees.map(e => [e.id, e] as const))
    const groups: { roleName: string; employees: EmployeeProfile[] }[] = []
    const assignedIds = new Set<string>()

    if (viewMode === 'crew') {
      for (const crew of crews) {
        const members = crewAssignments
          .filter(a => a.crew_id === crew.id)
          .map(a => empById.get(a.employee_id))
          .filter((e): e is EmployeeProfile => !!e)
        if (members.length > 0) {
          groups.push({ roleName: crew.name, employees: members })
          members.forEach(e => assignedIds.add(e.id))
        }
      }
    } else {
      for (const st of skillTypes) {
        const members = skillTypeAssignments
          .filter(a => a.skill_type_id === st.id)
          .map(a => empById.get(a.employee_id))
          .filter((e): e is EmployeeProfile => !!e)
        if (members.length > 0) {
          groups.push({ roleName: st.name, employees: members })
          members.forEach(e => assignedIds.add(e.id))
        }
      }
    }

    const unassigned = employees.filter(emp => !assignedIds.has(emp.id))
    if (unassigned.length > 0) {
      groups.push({ roleName: 'Unassigned', employees: unassigned })
    }

    return groups
  }, [employees, roles, viewMode, crews, crewAssignments, skillTypes, skillTypeAssignments])

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
              {settingsOpen ? (
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mr-2"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Employee Management
                </button>
              ) : (
                isInline && onBack && (
                  <button
                    onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mr-2"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Office
                  </button>
                )
              )}
              {settingsOpen ? (
                <>
                  <Settings2Icon className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">Employee Settings</h2>
                </>
              ) : (
                <>
                  <UsersIcon className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">Employee Management</h2>
                </>
              )}
            </div>
            {!settingsOpen && (
              <div className="flex items-center gap-2">
                {/* View mode toggle: All / By Crew / By Skill */}
                <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-[#3a3a3a] bg-white dark:bg-[#242424] p-0.5">
                  {(['all', 'crew', 'skill'] as const).map((mode) => {
                    const label = mode === 'all' ? 'All' : mode === 'crew' ? 'By Crew' : 'By Skill'
                    const active = viewMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                          active
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-[#a0a0a0] dark:hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-700 text-xs font-medium rounded-lg transition"
                  title="Employee Settings"
                >
                  <Settings2Icon className="w-3.5 h-3.5" />
                  Settings
                </button>
                <button
                  onClick={openOnboarding}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium rounded-lg transition"
                >
                  <UserPlusIcon className="w-3.5 h-3.5" />
                  +Onboarding
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
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0 relative">

      {/* Employee Grid — grouped by role */}
      {loadingEmployees ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No employees added yet.</p>
      ) : (
        <div className="mb-6">
          {groupedEmployees.map((group, idx) => (
            <div key={`${viewMode}:${group.roleName}`}>
              {/* Role divider */}
              <div className={`flex items-center gap-3 ${idx === 0 ? 'mb-4' : 'mt-6 mb-4'}`} aria-label={group.roleName}>
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a]" />
                <span className="text-xs font-medium text-gray-400 dark:text-[#4a4a4a] uppercase tracking-widest">
                  {group.roleName}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a]" />
              </div>
              {/* Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {group.employees.map((emp) => (
                  <div
                    key={`${group.roleName}:${emp.id}`}
                    className="rounded-lg border border-gray-200 dark:border-[#3a3a3a] overflow-hidden hover:border-gray-300 dark:hover:border-[#4a4a4a] hover:shadow-sm transition bg-white dark:bg-[#242424]! flex flex-col"
                  >
                    {/* Photo area — compact fixed height */}
                    <div className="w-full h-32 bg-gray-100 dark:bg-[#2e2e2e]! overflow-hidden">
                      {emp.photo_url ? (
                        <img
                          src={emp.photo_url}
                          alt=""
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <UserIcon className="w-5 h-5 text-gray-300 dark:text-[#4a4a4a]!" />
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
                    {/* Certification pills */}
                    {(() => {
                      const empCertIds = certAssignments.filter(a => a.employee_id === emp.id).map(a => a.certification_id)
                      const empCerts = certifications.filter(c => empCertIds.includes(c.id))
                      if (empCerts.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-0.5 px-1.5 pt-0.5">
                          {empCerts.map(c => (
                            <span
                              key={c.id}
                              className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-tight"
                              style={pillStyle(c.color, isDark)}
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                    {/* OSHA Training pills */}
                    {(() => {
                      const empOshaIds = oshaAssignments.filter(a => a.employee_id === emp.id).map(a => a.osha_training_id)
                      const empOsha = oshaTrainings.filter(o => empOshaIds.includes(o.id))
                      if (empOsha.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-0.5 px-1.5 pt-0.5">
                          {empOsha.map(o => (
                            <span
                              key={o.id}
                              className="inline-block px-1.5 py-0.5 rounded-md text-[9px] font-semibold leading-tight"
                              style={pillStyle(o.color, isDark)}
                            >
                              {o.name}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 px-1.5 pb-1.5 mt-auto">
                      <button
                        onClick={() => openEditModal(emp)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-[#6b6b6b]! hover:text-amber-700 dark:hover:text-[#a0a0a0]! hover:bg-amber-50 rounded transition"
                      >
                        <PencilIcon className="w-2.5 h-2.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteEmployee(emp)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:text-[#6b6b6b]! hover:text-red-600 dark:hover:text-[#a0a0a0]! hover:bg-red-50 rounded transition"
                      >
                        <Trash2Icon className="w-2.5 h-2.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Employee Settings — full-size panel */}
      {settingsOpen && (
        <div className="absolute inset-0 z-10 bg-white flex flex-col overflow-hidden">
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            <div className="max-w-3xl mx-auto space-y-8">
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRoleDragEnd}>
                  <SortableContext items={roles.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {roles.map((role) => (
                        <SortableRoleRow
                          key={role.id}
                          role={role}
                          onRename={handleRenameRole}
                          onDelete={handleDeleteRole}
                          deleting={deletingRoleId === role.id}
                        />
                      ))}
                      {roles.length === 0 && (
                        <p className="text-xs text-gray-400 py-2">No roles defined.</p>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Manage Certifications */}
              <div className="pt-6 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Manage Certifications
                </h4>
                {certError && <p className="text-xs text-red-500 mb-2">{certError}</p>}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCertName}
                    onChange={(e) => setNewCertName(e.target.value)}
                    placeholder="New certification name"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCert()}
                  />
                  <ColorPickerDropdown
                    color={newCertColor}
                    onChange={setNewCertColor}
                    open={newCertPickerOpen}
                    onToggle={() => setNewCertPickerOpen(!newCertPickerOpen)}
                  />
                  <button
                    onClick={handleAddCert}
                    disabled={addingCert || !newCertName.trim()}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {addingCert ? '...' : 'Add'}
                  </button>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCertDragEnd}>
                  <SortableContext items={certifications.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {certifications.map((cert) => (
                        <SortableCertRow
                          key={cert.id}
                          cert={cert}
                          onRename={handleRenameCert}
                          onDelete={handleDeleteCert}
                          onColorChange={handleCertColorChange}
                          deleting={deletingCertId === cert.id}
                        />
                      ))}
                      {certifications.length === 0 && (
                        <p className="text-xs text-gray-400 py-2">No certifications defined.</p>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Manage OSHA Training */}
              <div className="pt-6 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Manage OSHA Training
                </h4>
                {oshaError && <p className="text-xs text-red-500 mb-2">{oshaError}</p>}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newOshaName}
                    onChange={(e) => setNewOshaName(e.target.value)}
                    placeholder="New OSHA training name"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddOsha()}
                  />
                  <ColorPickerDropdown
                    color={newOshaColor}
                    onChange={setNewOshaColor}
                    open={newOshaPickerOpen}
                    onToggle={() => setNewOshaPickerOpen(!newOshaPickerOpen)}
                  />
                  <button
                    onClick={handleAddOsha}
                    disabled={addingOsha || !newOshaName.trim()}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {addingOsha ? '...' : 'Add'}
                  </button>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOshaDragEnd}>
                  <SortableContext items={oshaTrainings.map(o => o.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {oshaTrainings.map((osha) => (
                        <SortableCertRow
                          key={osha.id}
                          cert={osha}
                          onRename={handleRenameOsha}
                          onDelete={handleDeleteOsha}
                          onColorChange={handleOshaColorChange}
                          deleting={deletingOshaId === osha.id}
                        />
                      ))}
                      {oshaTrainings.length === 0 && (
                        <p className="text-xs text-gray-400 py-2">No OSHA trainings defined.</p>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Crews */}
              <div className="pt-6 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Crews
                </h4>
                <p className="text-xs text-gray-400 mb-3">Group employees into work crews</p>
                {crewError && <p className="text-xs text-red-500 mb-2">{crewError}</p>}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCrewName}
                    onChange={(e) => setNewCrewName(e.target.value)}
                    placeholder="New crew name"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCrew()}
                  />
                  <button
                    onClick={handleAddCrew}
                    disabled={addingCrew || !newCrewName.trim()}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {addingCrew ? '...' : 'Add'}
                  </button>
                </div>
                <div className="space-y-1">
                  {crews.map((crew) => (
                    <SimpleNamedRow
                      key={crew.id}
                      item={crew}
                      onRename={handleRenameCrew}
                      onDelete={(c) => setConfirmDeleteCrew(c)}
                      deleting={deletingCrewId === crew.id}
                    />
                  ))}
                  {crews.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">No crews defined.</p>
                  )}
                </div>
              </div>

              {/* Skill Types */}
              <div className="pt-6 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Skill Types
                </h4>
                <p className="text-xs text-gray-400 mb-3">Categorize employees by skill specialization</p>
                {skillTypeError && <p className="text-xs text-red-500 mb-2">{skillTypeError}</p>}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newSkillTypeName}
                    onChange={(e) => setNewSkillTypeName(e.target.value)}
                    placeholder="New skill type name"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSkillType()}
                  />
                  <button
                    onClick={handleAddSkillType}
                    disabled={addingSkillType || !newSkillTypeName.trim()}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {addingSkillType ? '...' : 'Add'}
                  </button>
                </div>
                <div className="space-y-1">
                  {skillTypes.map((skillType) => (
                    <SimpleNamedRow
                      key={skillType.id}
                      item={skillType}
                      onRename={handleRenameSkillType}
                      onDelete={(s) => setConfirmDeleteSkillType(s)}
                      deleting={deletingSkillTypeId === skillType.id}
                    />
                  ))}
                  {skillTypes.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">No skill types defined.</p>
                  )}
                </div>
              </div>

              {/* Custom Fields */}
              <div className="pt-6 border-t border-gray-100">
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

                  {/* Certifications */}
                  {certifications.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Certifications</label>
                      <div className="flex flex-wrap gap-2">
                        {certifications.map((cert) => {
                          const selected = formCertIds.has(cert.id)
                          return (
                            <button
                              key={cert.id}
                              type="button"
                              onClick={() => {
                                setFormCertIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(cert.id)) next.delete(cert.id)
                                  else next.add(cert.id)
                                  return next
                                })
                              }}
                              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                selected
                                  ? 'border-transparent shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                              }`}
                              style={selected ? { backgroundColor: cert.color, color: contrastText(cert.color) } : undefined}
                            >
                              {cert.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* OSHA Training */}
                  {oshaTrainings.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">OSHA Training</label>
                      <div className="flex flex-wrap gap-2">
                        {oshaTrainings.map((osha) => {
                          const selected = formOshaIds.has(osha.id)
                          return (
                            <button
                              key={osha.id}
                              type="button"
                              onClick={() => {
                                setFormOshaIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(osha.id)) next.delete(osha.id)
                                  else next.add(osha.id)
                                  return next
                                })
                              }}
                              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                selected
                                  ? 'border-transparent shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                              }`}
                              style={selected ? { backgroundColor: osha.color, color: contrastText(osha.color) } : undefined}
                            >
                              {osha.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Crew */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Crew</label>
                    {formCrewIds.size > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {Array.from(formCrewIds).map((id) => {
                          const crew = crews.find((c) => c.id === id)
                          if (!crew) return null
                          return (
                            <span
                              key={crew.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                            >
                              {crew.name}
                              <button
                                type="button"
                                onClick={() => toggleFormCrew(crew.id)}
                                className="rounded-full hover:bg-amber-200/70 transition p-0.5"
                                aria-label={`Remove ${crew.name}`}
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {crews.length === 0 ? (
                      <p className="text-xs text-gray-400">No crews defined. Add crews in Settings.</p>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          const id = e.target.value
                          if (id) toggleFormCrew(id)
                        }}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                      >
                        <option value="">Select crew...</option>
                        {crews
                          .filter((c) => !formCrewIds.has(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  {/* Skill Type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Skill Type</label>
                    {formSkillTypeIds.size > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {Array.from(formSkillTypeIds).map((id) => {
                          const st = skillTypes.find((s) => s.id === id)
                          if (!st) return null
                          return (
                            <span
                              key={st.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200"
                            >
                              {st.name}
                              <button
                                type="button"
                                onClick={() => toggleFormSkillType(st.id)}
                                className="rounded-full hover:bg-sky-200/70 transition p-0.5"
                                aria-label={`Remove ${st.name}`}
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {skillTypes.length === 0 ? (
                      <p className="text-xs text-gray-400">No skill types defined. Add skill types in Settings.</p>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          const id = e.target.value
                          if (id) toggleFormSkillType(id)
                        }}
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                      >
                        <option value="">Select skill type...</option>
                        {skillTypes
                          .filter((s) => !formSkillTypeIds.has(s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    )}
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
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a]" />
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

                    {/* Certifications */}
                    {certifications.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Certifications</label>
                        <div className="flex flex-wrap gap-2">
                          {certifications.map((cert) => {
                            const selected = formCertIds.has(cert.id)
                            return (
                              <button
                                key={cert.id}
                                type="button"
                                onClick={() => {
                                  setFormCertIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(cert.id)) next.delete(cert.id)
                                    else next.add(cert.id)
                                    return next
                                  })
                                }}
                                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                  selected
                                    ? 'border-transparent shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                                style={selected ? { backgroundColor: cert.color, color: contrastText(cert.color) } : undefined}
                              >
                                {cert.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* OSHA Training */}
                    {oshaTrainings.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">OSHA Training</label>
                        <div className="flex flex-wrap gap-2">
                          {oshaTrainings.map((osha) => {
                            const selected = formOshaIds.has(osha.id)
                            return (
                              <button
                                key={osha.id}
                                type="button"
                                onClick={() => {
                                  setFormOshaIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(osha.id)) next.delete(osha.id)
                                    else next.add(osha.id)
                                    return next
                                  })
                                }}
                                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                                  selected
                                    ? 'border-transparent shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                                style={selected ? { backgroundColor: osha.color, color: contrastText(osha.color) } : undefined}
                              >
                                {osha.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Crew */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Crew</label>
                      {formCrewIds.size > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {Array.from(formCrewIds).map((id) => {
                            const crew = crews.find((c) => c.id === id)
                            if (!crew) return null
                            return (
                              <span
                                key={crew.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                              >
                                {crew.name}
                                <button
                                  type="button"
                                  onClick={() => toggleFormCrew(crew.id)}
                                  className="rounded-full hover:bg-amber-200/70 transition p-0.5"
                                  aria-label={`Remove ${crew.name}`}
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {crews.length === 0 ? (
                        <p className="text-xs text-gray-400">No crews defined. Add crews in Settings.</p>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value
                            if (id) toggleFormCrew(id)
                          }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                        >
                          <option value="">Select crew...</option>
                          {crews
                            .filter((c) => !formCrewIds.has(c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>

                    {/* Skill Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Skill Type</label>
                      {formSkillTypeIds.size > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {Array.from(formSkillTypeIds).map((id) => {
                            const st = skillTypes.find((s) => s.id === id)
                            if (!st) return null
                            return (
                              <span
                                key={st.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200"
                              >
                                {st.name}
                                <button
                                  type="button"
                                  onClick={() => toggleFormSkillType(st.id)}
                                  className="rounded-full hover:bg-sky-200/70 transition p-0.5"
                                  aria-label={`Remove ${st.name}`}
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {skillTypes.length === 0 ? (
                        <p className="text-xs text-gray-400">No skill types defined. Add skill types in Settings.</p>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value
                            if (id) toggleFormSkillType(id)
                          }}
                          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                        >
                          <option value="">Select skill type...</option>
                          {skillTypes
                            .filter((s) => !formSkillTypeIds.has(s.id))
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
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

      {/* Confirm Add Second Crew */}
      {pendingCrewId && (() => {
        const pendingCrew = crews.find(c => c.id === pendingCrewId)
        const existingCrewNames = Array.from(formCrewIds)
          .map(id => crews.find(c => c.id === id)?.name)
          .filter((n): n is string => !!n)
        const existingLabel = existingCrewNames.length === 1
          ? existingCrewNames[0]
          : existingCrewNames.join(', ')
        return (
          <ConfirmDialog
            title="Already Assigned to a Crew"
            message={`This employee is already assigned to ${existingLabel}. Add to ${pendingCrew?.name ?? 'this crew'} as well?`}
            confirmLabel="Add Crew"
            variant="default"
            onConfirm={confirmPendingCrew}
            onCancel={() => setPendingCrewId(null)}
          />
        )
      })()}

      {/* Confirm Delete Crew */}
      {confirmDeleteCrew && (
        <ConfirmDialog
          title="Delete Crew"
          message={`Are you sure you want to delete "${confirmDeleteCrew.name}"? All employees assigned to this crew will be unassigned.`}
          confirmLabel="Delete Crew"
          onConfirm={() => handleDeleteCrew(confirmDeleteCrew)}
          onCancel={() => setConfirmDeleteCrew(null)}
          loading={deletingCrewId === confirmDeleteCrew.id}
        />
      )}

      {/* Confirm Delete Skill Type */}
      {confirmDeleteSkillType && (
        <ConfirmDialog
          title="Delete Skill Type"
          message={`Are you sure you want to delete "${confirmDeleteSkillType.name}"? All employees assigned to this skill type will be unassigned.`}
          confirmLabel="Delete Skill Type"
          onConfirm={() => handleDeleteSkillType(confirmDeleteSkillType)}
          onCancel={() => setConfirmDeleteSkillType(null)}
          loading={deletingSkillTypeId === confirmDeleteSkillType.id}
        />
      )}
          </div>
        </>
      )
      if (isInline) {
        return (
          <div className="w-full h-full min-h-0 flex flex-col bg-gray-50 dark:bg-[#1a1a1a]! overflow-hidden">
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
