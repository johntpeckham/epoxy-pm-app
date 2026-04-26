'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  XIcon,
  FileTextIcon,
  Loader2Icon,
  AlertTriangleIcon,
  UploadIcon,
  PlusIcon,
  Trash2Icon,
  GripVerticalIcon,
  LockIcon,
  BuildingIcon,
} from 'lucide-react'
import Image from 'next/image'
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
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ProposalFormSettingsEditorProps {
  onClose: () => void
}

type SectionType = 'system' | 'text' | 'line_items' | 'notes'

interface SectionConfig {
  id: string
  name: string
  visible: boolean
  required: boolean
  system: boolean
  type: SectionType
  content?: string
}

interface UserOption {
  id: string
  display_name: string | null
  email: string | null
}

interface ProposalFormSettings {
  id: string
  company_name: string | null
  company_address: string | null
  company_phone: string | null
  company_website: string | null
  company_logo_url: string | null
  default_terms: string | null
  default_notes: string | null
  default_tax_rate: number
  default_salesperson_id: string | null
  sections_config: SectionConfig[]
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  {
    id: 'project_info',
    name: 'Project Info',
    visible: true,
    required: false,
    system: true,
    type: 'system',
  },
  {
    id: 'line_items',
    name: 'Line Items',
    visible: true,
    required: true,
    system: true,
    type: 'system',
  },
  {
    id: 'material_systems',
    name: 'Material Systems',
    visible: true,
    required: false,
    system: true,
    type: 'system',
  },
  {
    id: 'totals',
    name: 'Subtotal / Tax / Total',
    visible: true,
    required: true,
    system: true,
    type: 'system',
  },
  {
    id: 'change_orders',
    name: 'Change Orders',
    visible: true,
    required: false,
    system: true,
    type: 'system',
  },
  {
    id: 'terms',
    name: 'Terms & Conditions',
    visible: true,
    required: false,
    system: true,
    type: 'system',
  },
]

const CUSTOM_SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: 'text', label: 'Text block' },
  { value: 'notes', label: 'Notes' },
  { value: 'line_items', label: 'Line items' },
]

export default function ProposalFormSettingsEditor({
  onClose,
}: ProposalFormSettingsEditorProps) {
  const [settings, setSettings] = useState<ProposalFormSettings | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [confirmDeleteSection, setConfirmDeleteSection] =
    useState<SectionConfig | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      const { data: row } = await supabase
        .from('proposal_form_settings')
        .select('*')
        .limit(1)
        .maybeSingle()

      let loaded: ProposalFormSettings
      if (row) {
        const sections = Array.isArray(row.sections_config)
          ? (row.sections_config as SectionConfig[])
          : DEFAULT_SECTIONS
        loaded = {
          id: row.id,
          company_name: row.company_name,
          company_address: row.company_address,
          company_phone: row.company_phone,
          company_website: row.company_website,
          company_logo_url: row.company_logo_url,
          default_terms: row.default_terms,
          default_notes: row.default_notes,
          default_tax_rate: row.default_tax_rate ?? 0,
          default_salesperson_id: row.default_salesperson_id,
          sections_config: sections.length > 0 ? sections : DEFAULT_SECTIONS,
        }
      } else {
        loaded = {
          id: '',
          company_name: null,
          company_address: null,
          company_phone: null,
          company_website: null,
          company_logo_url: null,
          default_terms: null,
          default_notes: null,
          default_tax_rate: 0,
          default_salesperson_id: null,
          sections_config: DEFAULT_SECTIONS,
        }
      }
      setSettings(loaded)

      // Fetch users for salesperson dropdown
      try {
        const res = await fetch('/api/list-users')
        const result = await res.json()
        if (res.ok) {
          const eligible = ((result.users ?? []) as UserOption[]).filter(
            (u: UserOption & { role?: string }) =>
              ['admin', 'salesman', 'office_manager'].includes(
                (u as UserOption & { role?: string }).role ?? ''
              )
          )
          setUsers(eligible)
        }
      } catch (e) {
        console.warn('[ProposalFormSettingsEditor] list-users failed:', e)
      }
    } catch (err) {
      console.error('[ProposalFormSettingsEditor] fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  function update<K extends keyof ProposalFormSettings>(
    key: K,
    value: ProposalFormSettings[K]
  ) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateSection(id: string, patch: Partial<SectionConfig>) {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            sections_config: prev.sections_config.map((s) =>
              s.id === id ? { ...s, ...patch } : s
            ),
          }
        : prev
    )
  }

  function addCustomSection() {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            sections_config: [
              ...prev.sections_config,
              {
                id,
                name: 'New section',
                visible: true,
                required: false,
                system: false,
                type: 'text',
                content: '',
              },
            ],
          }
        : prev
    )
  }

  function requestDeleteSection(section: SectionConfig) {
    if (section.system) return
    setConfirmDeleteSection(section)
  }

  function confirmDeleteSectionNow() {
    if (!confirmDeleteSection) return
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            sections_config: prev.sections_config.filter(
              (s) => s.id !== confirmDeleteSection.id
            ),
          }
        : prev
    )
    setConfirmDeleteSection(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !settings) return
    const from = settings.sections_config.findIndex((s) => s.id === active.id)
    const to = settings.sections_config.findIndex((s) => s.id === over.id)
    if (from < 0 || to < 0) return
    update('sections_config', arrayMove(settings.sections_config, from, to))
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !settings) return
    const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a PNG, JPG, or SVG file.')
      return
    }

    setLogoUploading(true)
    setError(null)
    const supabase = createClient()

    try {
      const ext = file.name.split('.').pop()
      const path = `proposal-form-logos/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage
        .from('company-assets')
        .getPublicUrl(path)
      update('company_logo_url', urlData.publicUrl)
    } catch (err) {
      console.error('[ProposalFormSettingsEditor] logo upload failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload logo.')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      const payload = {
        company_name: settings.company_name?.trim() || null,
        company_address: settings.company_address?.trim() || null,
        company_phone: settings.company_phone?.trim() || null,
        company_website: settings.company_website?.trim() || null,
        company_logo_url: settings.company_logo_url || null,
        default_terms: settings.default_terms ?? null,
        default_notes: settings.default_notes ?? null,
        default_tax_rate: Number.isFinite(settings.default_tax_rate)
          ? settings.default_tax_rate
          : 0,
        default_salesperson_id: settings.default_salesperson_id || null,
        sections_config: settings.sections_config,
      }

      if (settings.id) {
        const { error: updErr } = await supabase
          .from('proposal_form_settings')
          .update(payload)
          .eq('id', settings.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('proposal_form_settings')
          .insert(payload)
        if (insErr) throw insErr
      }

      setSaving(false)
      onClose()
    } catch (err) {
      console.error('[ProposalFormSettingsEditor] save failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings.')
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <FileTextIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Proposal Form
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {loading || !settings ? (
              <div className="py-8 flex items-center justify-center text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                <CompanyHeaderSection
                  settings={settings}
                  logoUploading={logoUploading}
                  logoInputRef={logoInputRef}
                  onUpdate={update}
                  onLogoUpload={handleLogoUpload}
                />
                <DefaultsSection
                  settings={settings}
                  users={users}
                  onUpdate={update}
                />
                <SectionsEditor
                  sections={settings.sections_config}
                  onUpdateSection={updateSection}
                  onAddCustom={addCustomSection}
                  onDelete={requestDeleteSection}
                  onDragEnd={handleDragEnd}
                  sensors={sensors}
                />
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {confirmDeleteSection && (
        <ConfirmDialog
          title="Delete section?"
          message={`This will remove the "${confirmDeleteSection.name}" section from every future proposal.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={confirmDeleteSectionNow}
          onCancel={() => setConfirmDeleteSection(null)}
        />
      )}
    </Portal>
  )
}

function CompanyHeaderSection({
  settings,
  logoUploading,
  logoInputRef,
  onUpdate,
  onLogoUpload,
}: {
  settings: ProposalFormSettings
  logoUploading: boolean
  logoInputRef: React.RefObject<HTMLInputElement | null>
  onUpdate: <K extends keyof ProposalFormSettings>(
    key: K,
    value: ProposalFormSettings[K]
  ) => void
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Company header
      </h4>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Logo
          </label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
              {settings.company_logo_url ? (
                <Image
                  src={settings.company_logo_url}
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
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 transition"
              >
                <UploadIcon className="w-4 h-4" />
                {logoUploading ? 'Uploading…' : 'Upload logo'}
              </button>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, or SVG.</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={onLogoUpload}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Company name"
            value={settings.company_name ?? ''}
            onChange={(v) => onUpdate('company_name', v)}
          />
          <TextField
            label="Phone"
            value={settings.company_phone ?? ''}
            onChange={(v) => onUpdate('company_phone', v)}
          />
          <TextField
            label="Address"
            value={settings.company_address ?? ''}
            onChange={(v) => onUpdate('company_address', v)}
          />
          <TextField
            label="Website"
            value={settings.company_website ?? ''}
            onChange={(v) => onUpdate('company_website', v)}
          />
        </div>
      </div>
    </section>
  )
}

function DefaultsSection({
  settings,
  users,
  onUpdate,
}: {
  settings: ProposalFormSettings
  users: UserOption[]
  onUpdate: <K extends keyof ProposalFormSettings>(
    key: K,
    value: ProposalFormSettings[K]
  ) => void
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Defaults for new proposals
      </h4>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Default terms &amp; conditions
          </label>
          <textarea
            value={settings.default_terms ?? ''}
            onChange={(e) => onUpdate('default_terms', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
            placeholder="Payment terms, warranty, etc…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Default notes
          </label>
          <textarea
            value={settings.default_notes ?? ''}
            onChange={(e) => onUpdate('default_notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
            placeholder="Notes that appear on every new proposal…"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Default tax rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={settings.default_tax_rate}
              onChange={(e) =>
                onUpdate(
                  'default_tax_rate',
                  parseFloat(e.target.value || '0') || 0
                )
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Default salesperson
            </label>
            <select
              value={settings.default_salesperson_id ?? ''}
              onChange={(e) =>
                onUpdate('default_salesperson_id', e.target.value || null)
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="">None</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.email || 'Unnamed'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionsEditor({
  sections,
  onUpdateSection,
  onAddCustom,
  onDelete,
  onDragEnd,
  sensors,
}: {
  sections: SectionConfig[]
  onUpdateSection: (id: string, patch: Partial<SectionConfig>) => void
  onAddCustom: () => void
  onDelete: (section: SectionConfig) => void
  onDragEnd: (event: DragEndEvent) => void
  sensors: ReturnType<typeof useSensors>
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Sections
      </h4>
      <p className="text-xs text-gray-500 mb-3">
        Drag to reorder. Required sections cannot be hidden. Custom sections can
        be deleted.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((s) => (
              <SortableSectionRow
                key={s.id}
                section={s}
                onUpdate={(patch) => onUpdateSection(s.id, patch)}
                onDelete={() => onDelete(s)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={onAddCustom}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
      >
        <PlusIcon className="w-4 h-4" />
        Add custom section
      </button>
    </section>
  )
}

function SortableSectionRow({
  section,
  onUpdate,
  onDelete,
}: {
  section: SectionConfig
  onUpdate: (patch: Partial<SectionConfig>) => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </button>
      <input
        type="text"
        value={section.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        disabled={section.system}
        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-500"
      />
      {!section.system && (
        <select
          value={section.type}
          onChange={(e) =>
            onUpdate({ type: e.target.value as SectionType })
          }
          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        >
          {CUSTOM_SECTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={section.visible}
          onChange={(e) => onUpdate({ visible: e.target.checked })}
          disabled={section.required}
          className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 disabled:opacity-50"
        />
        Visible
      </label>
      {section.system ? (
        <span
          title={
            section.required
              ? 'Required system section'
              : 'System section — cannot be deleted'
          }
          className="p-1.5 text-gray-300"
        >
          <LockIcon className="w-4 h-4" />
        </span>
      ) : (
        <button
          type="button"
          onClick={onDelete}
          title="Delete section"
          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
      />
    </div>
  )
}
