'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import {
  ArrowLeftIcon,
  SlidersHorizontalIcon,
  LoaderIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  Trash2Icon,
  CheckIcon,
  GripVerticalIcon,
  TypeIcon,
  AlignLeftIcon,
  CheckSquareIcon,
  ListIcon,
  CalendarIcon,
  HashIcon,
  MinusIcon,
  PenToolIcon,
  XIcon,
} from 'lucide-react'
import type { FormTemplate, FormField, FormFieldType } from '@/types'

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'short_text', label: 'Short Text', icon: <TypeIcon className="w-3.5 h-3.5" /> },
  { value: 'long_text', label: 'Long Text', icon: <AlignLeftIcon className="w-3.5 h-3.5" /> },
  { value: 'checkbox', label: 'Checkbox', icon: <CheckSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'checkbox_group', label: 'Checkbox Group', icon: <CheckSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'dropdown', label: 'Dropdown', icon: <ListIcon className="w-3.5 h-3.5" /> },
  { value: 'date', label: 'Date', icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  { value: 'number', label: 'Number', icon: <HashIcon className="w-3.5 h-3.5" /> },
  { value: 'section_header', label: 'Section Header', icon: <MinusIcon className="w-3.5 h-3.5" /> },
  { value: 'signature', label: 'Signature', icon: <PenToolIcon className="w-3.5 h-3.5" /> },
]

const FIELD_TYPE_COLORS: Record<FormFieldType, string> = {
  short_text: 'bg-blue-50 text-blue-700 border-blue-200',
  long_text: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  checkbox: 'bg-green-50 text-green-700 border-green-200',
  checkbox_group: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dropdown: 'bg-purple-50 text-purple-700 border-purple-200',
  date: 'bg-amber-50 text-amber-700 border-amber-200',
  number: 'bg-orange-50 text-orange-700 border-orange-200',
  section_header: 'bg-gray-100 text-gray-600 border-gray-300',
  signature: 'bg-pink-50 text-pink-700 border-pink-200',
}

function generateId(): string {
  return crypto.randomUUID()
}

/* ── Inline editable text ── */
function InlineEdit({
  value,
  onChange,
  className = '',
  placeholder = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-text hover:bg-amber-50 rounded px-1 -mx-1 transition ${className}`}
      >
        {value || <span className="text-gray-300 italic">{placeholder || 'Click to edit'}</span>}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onChange(draft); setEditing(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onChange(draft); setEditing(false) }
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={`bg-white border border-amber-400 rounded px-1 -mx-1 outline-none focus:ring-2 focus:ring-amber-500 ${className}`}
    />
  )
}

/* ── Field reorder and delete controls ── */
function FieldControls({
  fieldId,
  idx,
  total,
  onMove,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
}: {
  fieldId: string
  idx: number
  total: number
  onMove: (id: string, dir: 'up' | 'down') => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
}) {
  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
      <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-lg px-1 py-0.5">
        <button
          onClick={() => onMove(fieldId, 'up')}
          disabled={idx === 0}
          title="Move up"
          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded transition"
        >
          <ChevronUpIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMove(fieldId, 'down')}
          disabled={idx === total - 1}
          title="Move down"
          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 disabled:text-gray-300 disabled:hover:bg-transparent rounded transition"
        >
          <ChevronDownIcon className="w-4 h-4" />
        </button>
      </div>
      {deleteConfirm === fieldId ? (
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => onDelete(fieldId)}
            className="px-2 py-0.5 rounded bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 transition"
          >
            Delete
          </button>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-2 py-0.5 rounded border border-gray-200 text-gray-500 text-[11px] font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setDeleteConfirm(fieldId)}
          title="Delete field"
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

/* ── Sortable field row ── */
function SortableFieldRow({
  field,
  idx,
  total,
  onMove,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
  renderField,
}: {
  field: FormField
  idx: number
  total: number
  onMove: (id: string, dir: 'up' | 'down') => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
  renderField: (field: FormField) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative pl-8 pr-24 ${isDragging ? 'z-50 opacity-80 shadow-lg rounded-lg bg-white ring-2 ring-amber-400' : ''}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </div>
      {renderField(field)}
      <FieldControls
        fieldId={field.id}
        idx={idx}
        total={total}
        onMove={onMove}
        onDelete={onDelete}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
      />
    </div>
  )
}

/* ── Individual WYSIWYG field renderers ── */

function SectionHeaderField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div className="pt-2 pb-1">
      <InlineEdit
        value={field.label}
        onChange={(v) => onUpdate({ label: v })}
        className="text-xs font-bold text-gray-400 uppercase tracking-widest"
        placeholder="Section Title"
      />
      <div className="border-b border-gray-200 mt-2" />
    </div>
  )
}

function ShortTextField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <input
        type="text"
        readOnly
        placeholder={field.placeholder || 'Enter text...'}
        onClick={(e) => {
          e.preventDefault()
          const newPh = prompt('Edit placeholder:', field.placeholder)
          if (newPh !== null) onUpdate({ placeholder: newPh })
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-400 placeholder-gray-300 cursor-text focus:outline-none"
      />
    </div>
  )
}

function LongTextField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <textarea
        readOnly
        rows={3}
        placeholder={field.placeholder || 'Enter text...'}
        onClick={(e) => {
          e.preventDefault()
          const newPh = prompt('Edit placeholder:', field.placeholder)
          if (newPh !== null) onUpdate({ placeholder: newPh })
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-400 placeholder-gray-300 cursor-text resize-none focus:outline-none"
      />
    </div>
  )
}

function CheckboxField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-gray-300 rounded flex-shrink-0" />
      <InlineEdit
        value={field.label}
        onChange={(v) => onUpdate({ label: v })}
        className="text-sm text-gray-700"
        placeholder="Checkbox label"
      />
      <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
    </div>
  )
}

function CheckboxGroupField({
  field,
  onUpdate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: {
  field: FormField
  onUpdate: (u: Partial<FormField>) => void
  onAddOption: () => void
  onUpdateOption: (idx: number, val: string) => void
  onRemoveOption: (idx: number) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="space-y-2 ml-1">
        {field.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-3 group/opt">
            <div className="w-5 h-5 border-2 border-gray-300 rounded flex-shrink-0" />
            <InlineEdit
              value={opt}
              onChange={(v) => onUpdateOption(i, v)}
              className="text-sm text-gray-700"
              placeholder="Option label"
            />
            <button
              onClick={() => onRemoveOption(i)}
              className="opacity-0 group-hover/opt:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={onAddOption}
          className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium ml-8 transition"
        >
          <PlusIcon className="w-3 h-3" />
          Add option
        </button>
      </div>
    </div>
  )
}

function DropdownField({
  field,
  onUpdate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: {
  field: FormField
  onUpdate: (u: Partial<FormField>) => void
  onAddOption: () => void
  onUpdateOption: (idx: number, val: string) => void
  onRemoveOption: (idx: number) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 bg-white text-sm text-gray-400 flex items-center justify-between">
          <span>{field.options[0] || 'Select...'}</span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      <div className="mt-2 ml-1 space-y-1.5">
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Options</p>
        {field.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 group/opt">
            <span className="text-xs text-gray-300 w-4 text-right">{i + 1}.</span>
            <InlineEdit
              value={opt}
              onChange={(v) => onUpdateOption(i, v)}
              className="text-sm text-gray-700"
              placeholder="Option"
            />
            <button
              onClick={() => onRemoveOption(i)}
              className="opacity-0 group-hover/opt:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={onAddOption}
          className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium ml-6 transition"
        >
          <PlusIcon className="w-3 h-3" />
          Add option
        </button>
      </div>
    </div>
  )
}

function DateField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <input
        type="date"
        readOnly
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-400 cursor-default focus:outline-none"
      />
    </div>
  )
}

function NumberField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <input
        type="number"
        readOnly
        placeholder={field.placeholder || '0'}
        onClick={(e) => {
          e.preventDefault()
          const newPh = prompt('Edit placeholder:', field.placeholder)
          if (newPh !== null) onUpdate({ placeholder: newPh })
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-400 placeholder-gray-300 cursor-text focus:outline-none"
      />
    </div>
  )
}

function SignatureField({ field, onUpdate }: { field: FormField; onUpdate: (u: Partial<FormField>) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
          placeholder="Label"
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex flex-col items-center justify-end pb-2 bg-gray-50/50">
        <div className="w-4/5 border-b border-gray-400 mb-1" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">Sign here</span>
      </div>
    </div>
  )
}

function RequiredBadge({ required, onToggle }: { required: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
        required
          ? 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'
          : 'bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-500'
      }`}
    >
      {required ? 'Required' : 'Optional'}
    </button>
  )
}

/* ── Main component ── */

export default function FormManagementClient() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingFieldType, setAddingFieldType] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const selectedTemplate = templates.find((t) => t.form_key === selectedKey)

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('form_templates')
      .select('*')
      .order('form_name')
    setTemplates((data as FormTemplate[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  useEffect(() => {
    if (selectedTemplate) {
      const sorted = [...selectedTemplate.fields].sort((a, b) => a.order - b.order)
      setFields(sorted)
    }
  }, [selectedTemplate])

  function selectForm(key: string) {
    setSelectedKey(key)
    setSaved(false)
    setDeleteConfirm(null)
    setAddingFieldType(false)
  }

  // --- Field operations ---

  function updateField(id: string, updates: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
    setSaved(false)
  }

  function moveField(id: string, direction: 'up' | 'down') {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
    setSaved(false)
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i + 1 })))
    setDeleteConfirm(null)
    setSaved(false)
  }

  function addField(type: FormFieldType) {
    const newField: FormField = {
      id: generateId(),
      type,
      label: type === 'section_header' ? 'New Section' : 'New Field',
      placeholder: '',
      required: false,
      options: type === 'dropdown' || type === 'checkbox_group' ? ['Option 1'] : [],
      order: fields.length + 1,
    }
    setFields((prev) => [...prev, newField])
    setAddingFieldType(false)
    setSaved(false)
  }

  function addOption(fieldId: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: [...f.options, `Option ${f.options.length + 1}`] }
          : f
      )
    )
    setSaved(false)
  }

  function updateOption(fieldId: string, optIdx: number, value: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: f.options.map((o, i) => (i === optIdx ? value : o)) }
          : f
      )
    )
    setSaved(false)
  }

  function removeOption(fieldId: string, optIdx: number) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: f.options.filter((_, i) => i !== optIdx) }
          : f
      )
    )
    setSaved(false)
  }

  // --- Save ---

  async function handleSave() {
    if (!selectedTemplate) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('form_templates')
      .update({ fields: fields as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
      .eq('id', selectedTemplate.id)

    setTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, fields, updated_at: new Date().toISOString() } : t
      )
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // --- Drag and drop ---

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields((prev) => {
      const oldIdx = prev.findIndex((f) => f.id === active.id)
      const newIdx = prev.findIndex((f) => f.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(oldIdx, 1)
      next.splice(newIdx, 0, moved)
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
    setSaved(false)
  }

  // --- Render a field in WYSIWYG style ---

  function renderField(field: FormField) {
    const onUpdate = (u: Partial<FormField>) => updateField(field.id, u)

    switch (field.type) {
      case 'section_header':
        return <SectionHeaderField field={field} onUpdate={onUpdate} />
      case 'short_text':
        return <ShortTextField field={field} onUpdate={onUpdate} />
      case 'long_text':
        return <LongTextField field={field} onUpdate={onUpdate} />
      case 'checkbox':
        return <CheckboxField field={field} onUpdate={onUpdate} />
      case 'checkbox_group':
        return (
          <CheckboxGroupField
            field={field}
            onUpdate={onUpdate}
            onAddOption={() => addOption(field.id)}
            onUpdateOption={(idx, val) => updateOption(field.id, idx, val)}
            onRemoveOption={(idx) => removeOption(field.id, idx)}
          />
        )
      case 'dropdown':
        return (
          <DropdownField
            field={field}
            onUpdate={onUpdate}
            onAddOption={() => addOption(field.id)}
            onUpdateOption={(idx, val) => updateOption(field.id, idx, val)}
            onRemoveOption={(idx) => removeOption(field.id, idx)}
          />
        )
      case 'date':
        return <DateField field={field} onUpdate={onUpdate} />
      case 'number':
        return <NumberField field={field} onUpdate={onUpdate} />
      case 'signature':
        return <SignatureField field={field} onUpdate={onUpdate} />
      default:
        return <ShortTextField field={field} onUpdate={onUpdate} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <SlidersHorizontalIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Form Management</h1>
            <p className="text-sm text-gray-500">Customize form fields and layout for each app form.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Panel — Form List */}
            <div className="w-full md:w-64 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Forms</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {templates.map((t) => (
                    <button
                      key={t.form_key}
                      onClick={() => selectForm(t.form_key)}
                      className={`w-full text-left px-4 py-3 text-sm font-medium transition ${
                        selectedKey === t.form_key
                          ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t.form_name}
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel — WYSIWYG Form Editor */}
            <div className="flex-1 min-w-0">
              {!selectedTemplate ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <SlidersHorizontalIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Select a form from the left to edit its fields</p>
                  <p className="text-sm text-gray-400 mt-1">You can add, remove, and reorder fields for each form.</p>
                </div>
              ) : (
                <div>
                  {/* Save bar */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.form_name}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fields.length} field{fields.length !== 1 ? 's' : ''} &middot; Last updated{' '}
                        {new Date(selectedTemplate.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving || saved}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
                    >
                      {saved ? (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Saved
                        </>
                      ) : saving ? (
                        'Saving...'
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>

                  {/* WYSIWYG Form Card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="p-4 md:p-6 space-y-5">
                          {fields.map((field, idx) => (
                            <SortableFieldRow
                              key={field.id}
                              field={field}
                              idx={idx}
                              total={fields.length}
                              onMove={moveField}
                              onDelete={removeField}
                              deleteConfirm={deleteConfirm}
                              setDeleteConfirm={setDeleteConfirm}
                              renderField={renderField}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {/* Add Field Button */}
                    <div className="px-4 md:px-6 py-4 border-t border-gray-200">
                      {addingFieldType ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select field type</p>
                          <div className="flex flex-wrap gap-2">
                            {FIELD_TYPE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => addField(opt.value)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition hover:opacity-80 ${FIELD_TYPE_COLORS[opt.value]}`}
                              >
                                {opt.icon}
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setAddingFieldType(false)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingFieldType(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 border border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600 rounded-lg text-sm font-medium transition"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Add Field
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
