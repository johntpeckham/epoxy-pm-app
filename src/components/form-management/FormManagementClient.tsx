'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  ChevronRightIcon,
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
  XIcon,
  PencilIcon,
  ArrowUpDownIcon,
  ClipboardCheckIcon,
  PackageIcon,
  BookOpenIcon,
  Undo2Icon,
  Redo2Icon,
  ImageIcon,
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
  checklist_placeholder: 'bg-teal-50 text-teal-700 border-teal-200',
  material_system_placeholder: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  field_guide_placeholder: 'bg-amber-50 text-amber-700 border-amber-200',
  picture_upload: 'bg-violet-50 text-violet-700 border-violet-200',
}

/* ── Material system & checklist constants ── */
const MATERIAL_SYSTEM_SECTION_ID = 'pr-48'
const MATERIAL_SYSTEM_SKIP_IDS = new Set(['pr-49', 'pr-50', 'pr-51', 'pr-52', 'pr-53', 'pr-54', 'pr-55'])
const MATERIAL_SYSTEM_SKIP_LABELS = /^Material (System|Quantities) \d$/

interface ChecklistTemplate {
  id: string
  name: string
  items: { id: string; text: string; sort_order: number }[]
}

function isChecklistField(field: FormField): boolean {
  return field.id.startsWith('checklist-')
}

function getChecklistIdFromField(field: FormField): string {
  return field.id.replace('checklist-', '')
}

function isSectionLikeField(field: FormField): boolean {
  return field.type === 'section_header'
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
  autoEdit = false,
  onEditDone,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  autoEdit?: boolean
  onEditDone?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (autoEdit && !editing) setEditing(true)
  }, [autoEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function finishEdit(save: boolean) {
    if (save) onChange(draft)
    else setDraft(value)
    setEditing(false)
    onEditDone?.()
  }

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
      onBlur={() => finishEdit(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finishEdit(true)
        if (e.key === 'Escape') finishEdit(false)
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
  noDelete,
}: {
  fieldId: string
  idx: number
  total: number
  onMove: (id: string, dir: 'up' | 'down') => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
  noDelete?: boolean
}) {
  return (
    <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 transition-opacity ${deleteConfirm === fieldId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <button
        onClick={() => onMove(fieldId, 'up')}
        disabled={idx === 0}
        title="Move up"
        className="p-1 text-gray-300 hover:text-amber-600 disabled:text-gray-200 disabled:hover:text-gray-200 rounded transition"
      >
        <ChevronUpIcon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onMove(fieldId, 'down')}
        disabled={idx === total - 1}
        title="Move down"
        className="p-1 text-gray-300 hover:text-amber-600 disabled:text-gray-200 disabled:hover:text-gray-200 rounded transition"
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {!noDelete && (
        deleteConfirm === fieldId ? (
          <div className="flex items-center gap-1 ml-0.5">
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
            className="p-1 text-gray-300 hover:text-red-500 rounded transition"
          >
            <Trash2Icon className="w-3 h-3" />
          </button>
        )
      )}
    </div>
  )
}

/* ── Section grouping helper ── */
interface FieldSection {
  headerId: string | null
  contentFields: FormField[]
  allFields: FormField[]
}

function groupFieldsIntoSections(fields: FormField[]): FieldSection[] {
  const sections: FieldSection[] = []
  let current: FieldSection | null = null
  for (const field of fields) {
    if (isSectionLikeField(field)) {
      current = { headerId: field.id, contentFields: [], allFields: [field] }
      sections.push(current)
    } else {
      if (!current) {
        current = { headerId: null, contentFields: [], allFields: [] }
        sections.push(current)
      }
      current.contentFields.push(field)
      current.allFields.push(field)
    }
  }
  return sections
}

/* ── Add Item dropdown options ── */
const ADD_ITEM_TYPE_OPTIONS: { value: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'section_header', label: 'Header', icon: <MinusIcon className="w-3.5 h-3.5" /> },
  { value: 'short_text', label: 'Text', icon: <TypeIcon className="w-3.5 h-3.5" /> },
  { value: 'long_text', label: 'Paragraph Text', icon: <AlignLeftIcon className="w-3.5 h-3.5" /> },
  { value: 'picture_upload', label: 'Picture Upload', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { value: 'date', label: 'Date', icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  { value: 'number', label: 'Number', icon: <HashIcon className="w-3.5 h-3.5" /> },
  { value: 'checkbox', label: 'Checkbox', icon: <CheckSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'dropdown', label: 'Select / Dropdown', icon: <ListIcon className="w-3.5 h-3.5" /> },
  { value: 'checklist_placeholder', label: 'Checklist', icon: <ClipboardCheckIcon className="w-3.5 h-3.5" /> },
  { value: 'material_system_placeholder', label: 'Material System', icon: <PackageIcon className="w-3.5 h-3.5" /> },
  { value: 'field_guide_placeholder', label: 'Field Guide', icon: <BookOpenIcon className="w-3.5 h-3.5" /> },
]

/* ── Add Item dropdown component ── */
function AddItemDropdown({
  onAdd,
  sections,
  excludeHeader,
  buttonStyle,
  isProjectReport,
}: {
  onAdd: (type: FormFieldType, sectionId?: string) => void
  sections?: { id: string; label: string }[]
  excludeHeader?: boolean
  buttonStyle: 'primary' | 'subtle'
  isProjectReport?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pendingType, setPendingType] = useState<FormFieldType | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPendingType(null)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const options = ADD_ITEM_TYPE_OPTIONS.filter((opt) => {
    if (excludeHeader && opt.value === 'section_header') return false
    if (!isProjectReport && (opt.value === 'checklist_placeholder' || opt.value === 'material_system_placeholder' || opt.value === 'field_guide_placeholder')) return false
    return true
  })

  function handleTypeSelect(type: FormFieldType) {
    if (type === 'section_header' || excludeHeader) {
      onAdd(type)
      setOpen(false)
      setPendingType(null)
      return
    }
    if (!sections || sections.length === 0) {
      onAdd(type)
      setOpen(false)
      setPendingType(null)
      return
    }
    setPendingType(type)
  }

  function handleSectionSelect(sectionId: string) {
    if (pendingType) onAdd(pendingType, sectionId)
    setOpen(false)
    setPendingType(null)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {buttonStyle === 'primary' ? (
        <button
          onClick={() => { setOpen(!open); setPendingType(null) }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-orange-400 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 dark:border-orange-500/60 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
        >
          <PlusIcon className="w-4 h-4" />
          Add Item
        </button>
      ) : (
        <button
          onClick={() => { setOpen(!open); setPendingType(null) }}
          className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-amber-500 dark:text-gray-500 dark:hover:text-amber-400 font-medium transition py-1"
        >
          <PlusIcon className="w-3 h-3" />
          Add Item
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[200px]">
          {pendingType === null ? (
            options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleTypeSelect(opt.value)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-400 transition"
              >
                {opt.icon}
                {opt.label}
              </button>
            ))
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                Add to section
              </div>
              {(sections ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSectionSelect(s.id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-400 transition"
                >
                  {s.label}
                </button>
              ))}
              <button
                onClick={() => setPendingType(null)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-t border-gray-100 dark:border-gray-700 transition"
              >
                ← Back
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Hover controls (edit + delete, shown when NOT in reorder mode) ── */
function HoverControls({
  fieldId,
  onEdit,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
  isSectionHeader,
  sectionFieldCount,
  noEdit,
  noDelete,
}: {
  fieldId: string
  onEdit: () => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
  isSectionHeader: boolean
  sectionFieldCount: number
  noEdit?: boolean
  noDelete?: boolean
}) {
  if (noEdit && noDelete) return null
  return (
    <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 transition-opacity ${deleteConfirm === fieldId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      {deleteConfirm === fieldId ? (
        <div className="flex items-center gap-1 ml-0.5">
          <span className="text-[11px] text-gray-500 mr-1 whitespace-nowrap">
            {isSectionHeader ? `Delete section & ${sectionFieldCount} field${sectionFieldCount !== 1 ? 's' : ''}?` : 'Delete?'}
          </span>
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
        <>
          {!noEdit && (
            <button
              onClick={onEdit}
              title="Edit name"
              className="p-1 text-gray-300 hover:text-amber-600 rounded transition"
            >
              <PencilIcon className="w-3 h-3" />
            </button>
          )}
          {!noDelete && (
            <button
              onClick={() => setDeleteConfirm(fieldId)}
              title={isSectionHeader ? 'Delete section' : 'Delete field'}
              className="p-1 text-gray-300 hover:text-red-500 rounded transition"
            >
              <Trash2Icon className="w-3 h-3" />
            </button>
          )}
        </>
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
  reorderMode,
  onEditField,
  sectionFieldCount,
  noDelete,
  noEdit,
}: {
  field: FormField
  idx: number
  total: number
  onMove: (id: string, dir: 'up' | 'down') => void
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
  renderField: (field: FormField) => React.ReactNode
  reorderMode: boolean
  onEditField: (id: string) => void
  sectionFieldCount: number
  noDelete?: boolean
  noEdit?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled: !reorderMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${reorderMode ? 'pl-7 pr-20' : 'pl-2 pr-16'} ${isDragging ? 'z-50 opacity-80 shadow-lg rounded-lg bg-white ring-2 ring-amber-400' : ''}`}
    >
      {/* Drag handle — only in reorder mode */}
      {reorderMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-1 text-gray-200 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVerticalIcon className="w-3.5 h-3.5" />
        </div>
      )}
      {renderField(field)}
      {reorderMode ? (
        <FieldControls
          fieldId={field.id}
          idx={idx}
          total={total}
          onMove={onMove}
          onDelete={onDelete}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          noDelete={noDelete}
        />
      ) : (
        <HoverControls
          fieldId={field.id}
          onEdit={() => onEditField(field.id)}
          onDelete={onDelete}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          isSectionHeader={isSectionLikeField(field)}
          sectionFieldCount={sectionFieldCount}
          noDelete={noDelete}
          noEdit={noEdit}
        />
      )}
    </div>
  )
}

/* ── Individual WYSIWYG field renderers ── */

function SectionHeaderField({ field, onUpdate, autoEdit, onEditDone, collapsed, onToggleCollapse }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void; collapsed?: boolean; onToggleCollapse?: () => void }) {
  return (
    <div className="pt-3 pb-1.5 border-b border-amber-100">
      <div className="flex items-center gap-1">
        {onToggleCollapse && (
          <button onClick={(e) => { e.stopPropagation(); onToggleCollapse() }} className="p-0.5 text-gray-400 hover:text-amber-600 transition flex-shrink-0">
            {collapsed ? <ChevronRightIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          </button>
        )}
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-semibold uppercase tracking-wide text-amber-700"
          placeholder="Section Title"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
      </div>
    </div>
  )
}

function ShortTextField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
        <InlineEdit
          value={field.placeholder || ''}
          onChange={(v) => onUpdate({ placeholder: v })}
          className="text-gray-400 w-full"
          placeholder="Enter text..."
        />
      </div>
    </div>
  )
}

function LongTextField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-h-[5rem]">
        <InlineEdit
          value={field.placeholder || ''}
          onChange={(v) => onUpdate({ placeholder: v })}
          className="text-gray-400 w-full"
          placeholder="Enter text..."
        />
      </div>
    </div>
  )
}

function CheckboxField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-0.5 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Checkbox label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <div className="w-5 h-5 border-2 border-gray-300 rounded flex-shrink-0" />
        <span className="text-sm text-gray-400">Checkbox</span>
      </div>
    </div>
  )
}

function CheckboxGroupField({
  field,
  onUpdate,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  autoEdit,
  onEditDone,
}: {
  field: FormField
  onUpdate: (u: Partial<FormField>) => void
  onAddOption: () => void
  onUpdateOption: (idx: number, val: string) => void
  onRemoveOption: (idx: number) => void
  autoEdit?: boolean
  onEditDone?: () => void
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-1 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="space-y-2">
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
  autoEdit,
  onEditDone,
}: {
  field: FormField
  onUpdate: (u: Partial<FormField>) => void
  onAddOption: () => void
  onUpdateOption: (idx: number, val: string) => void
  onRemoveOption: (idx: number) => void
  autoEdit?: boolean
  onEditDone?: () => void
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div>
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-white text-sm text-gray-400 flex items-center justify-between">
            <span>{field.options[0] || 'Select...'}</span>
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
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
    </div>
  )
}

function DateField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <input
        type="date"
        readOnly
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-400 cursor-default focus:outline-none"
      />
    </div>
  )
}

function NumberField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
        <InlineEdit
          value={field.placeholder || ''}
          onChange={(v) => onUpdate({ placeholder: v })}
          className="text-gray-400 w-full"
          placeholder="0"
        />
      </div>
    </div>
  )
}

function PictureUploadField({ field, onUpdate, autoEdit, onEditDone }: { field: FormField; onUpdate: (u: Partial<FormField>) => void; autoEdit?: boolean; onEditDone?: () => void }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end gap-0.5">
        <InlineEdit
          value={field.label}
          onChange={(v) => onUpdate({ label: v })}
          className="text-xs font-medium text-gray-600"
          placeholder="Label"
          autoEdit={autoEdit}
          onEditDone={onEditDone}
        />
        <RequiredBadge required={field.required} onToggle={() => onUpdate({ required: !field.required })} />
      </div>
      <div className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-4 bg-gray-50 dark:bg-gray-800/50 text-center">
        <ImageIcon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
        <span className="text-sm text-gray-400">Upload image</span>
      </div>
    </div>
  )
}

function ChecklistPlaceholderFieldRow({ field }: { field: FormField }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{field.label || 'Checklist'}</span>
      </div>
      <div className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800">
        <span className="text-gray-400 dark:text-gray-500 italic">Selected when filling out the job report</span>
      </div>
    </div>
  )
}

function MaterialSystemPlaceholderFieldRow({ field }: { field: FormField }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{field.label || 'Material System'}</span>
      </div>
      <div className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800">
        <span className="text-gray-400 dark:text-gray-500 italic">Selected when filling out the job report</span>
      </div>
    </div>
  )
}

function FieldGuidePlaceholderFieldRow({ field }: { field: FormField }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
      <div className="pt-2 flex flex-col items-end">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{field.label || 'Field Guide'}</span>
      </div>
      <div className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800">
        <span className="text-gray-400 dark:text-gray-500 italic">Attached when filling out the job report</span>
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

/* ── Special section renderers for the form editor ── */

function MaterialSystemEditorSection({ collapsed, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
  return (
    <div>
      <div className="pt-3 pb-1.5 border-b border-amber-100">
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button onClick={(e) => { e.stopPropagation(); onToggleCollapse() }} className="p-0.5 text-gray-400 hover:text-amber-600 transition flex-shrink-0">
              {collapsed ? <ChevronRightIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            </button>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Material Quantities
          </span>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="mt-3 border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50/50 flex items-center justify-center gap-2">
            <PackageIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">+ Add Material System</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 italic">Configured in Material System tab. Position can be reordered.</p>
        </>
      )}
    </div>
  )
}

function ChecklistEditorSection({ name, items, collapsed, onToggleCollapse }: { name: string; items: { id: string; text: string }[]; collapsed?: boolean; onToggleCollapse?: () => void }) {
  return (
    <div>
      <div className="pt-3 pb-1.5 border-b border-amber-100">
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button onClick={(e) => { e.stopPropagation(); onToggleCollapse() }} className="p-0.5 text-gray-400 hover:text-amber-600 transition flex-shrink-0">
              {collapsed ? <ChevronRightIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            </button>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {name}
          </span>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="mt-2 space-y-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-1.5 px-2">
                <div className="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0" />
                <span className="text-sm text-gray-600">{item.text}</span>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-xs text-gray-400 italic py-2 px-2">No items in this checklist</p>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 italic px-2">Items managed in Checklist Management tab.</p>
        </>
      )}
    </div>
  )
}

/* ── Main component ── */

interface FormManagementClientProps {
  filterFormKey?: string   // Only show this specific form key (auto-selects it)
  excludeFormKey?: string  // Exclude this form key from the list
  embedded?: boolean       // Skip page wrapper and header
}

export default function FormManagementClient({ filterFormKey, excludeFormKey, embedded }: FormManagementClientProps = {}) {
  const router = useRouter()
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(filterFormKey ?? null)
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([])
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Undo/Redo history
  const undoStackRef = useRef<FormField[][]>([])
  const redoStackRef = useRef<FormField[][]>([])
  const [historyCounter, setHistoryCounter] = useState(0)
  const fieldsRef = useRef<FormField[]>(fields)

  // Autosave
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initialLoadRef = useRef(true)
  const isDirtyRef = useRef(false)
  const isSavingRef = useRef(false)

  const selectedTemplate = templates.find((t) => t.form_key === selectedKey)
  const isProjectReport = selectedTemplate?.form_key === 'project_report'

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .order('form_name')
    if (error) console.error('[FormManagement] Fetch templates failed:', error)
    let result = (data as FormTemplate[]) ?? []
    if (filterFormKey) result = result.filter((t) => t.form_key === filterFormKey)
    if (excludeFormKey) result = result.filter((t) => t.form_key !== excludeFormKey)
    setTemplates(result)
    setLoading(false)
  }, [filterFormKey, excludeFormKey])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // Auto-select filtered form once templates are loaded
  useEffect(() => {
    if (filterFormKey && templates.length > 0 && !selectedKey) {
      setSelectedKey(filterFormKey)
    }
  }, [filterFormKey, templates, selectedKey])

  const loadedTemplateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedTemplate && loadedTemplateKeyRef.current !== selectedTemplate.form_key) {
      loadedTemplateKeyRef.current = selectedTemplate.form_key
      let sorted = [...selectedTemplate.fields].sort((a, b) => a.order - b.order)
      // For project_report: filter out legacy material system placeholder fields
      if (selectedTemplate.form_key === 'project_report') {
        sorted = sorted.filter(
          (f) =>
            !MATERIAL_SYSTEM_SKIP_IDS.has(f.id) &&
            !MATERIAL_SYSTEM_SKIP_LABELS.test(f.label) &&
            !(f.id === 'pr-52' || (f.type === 'section_header' && f.label === 'Material Quantities' && f.id !== MATERIAL_SYSTEM_SECTION_ID))
        )
        sorted = sorted.map((f, i) => ({ ...f, order: i + 1 }))
      }
      setFields(sorted)
    }
  }, [selectedTemplate])

  // Load checklist templates from DB when editing project_report
  useEffect(() => {
    if (filterFormKey === 'project_report' || selectedKey === 'project_report') {
      async function loadChecklists() {
        const supabase = createClient()
        const { data: cls } = await supabase.from('job_report_checklists').select('*').order('sort_order')
        const { data: items } = await supabase.from('job_report_checklist_items').select('*').order('sort_order')
        if (cls) {
          setChecklistTemplates(
            (cls as { id: string; name: string; sort_order: number }[]).map((cl) => ({
              id: cl.id,
              name: cl.name,
              items: ((items as { id: string; checklist_id: string; text: string; sort_order: number }[]) ?? [])
                .filter((i) => i.checklist_id === cl.id)
                .map((i) => ({ id: i.id, text: i.text, sort_order: i.sort_order })),
            }))
          )
        }
      }
      loadChecklists()
    }
  }, [filterFormKey, selectedKey])

  function selectForm(key: string) {
    loadedTemplateKeyRef.current = null
    setSelectedKey(key)
    setSaved(false)
    setDeleteConfirm(null)
    undoStackRef.current = []
    redoStackRef.current = []
    setHistoryCounter((c) => c + 1)
    isDirtyRef.current = false
  }

  const hasMaterialSystem = fields.some((f) => f.id === MATERIAL_SYSTEM_SECTION_ID)

  function toggleCollapse(sectionId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  // --- Undo/Redo ---
  useEffect(() => { fieldsRef.current = fields }, [fields])

  function recordHistory() {
    undoStackRef.current = [...undoStackRef.current, fieldsRef.current.map((f) => ({ ...f }))]
    redoStackRef.current = []
    setHistoryCounter((c) => c + 1)
    isDirtyRef.current = true
  }

  function undo() {
    if (undoStackRef.current.length === 0) return
    const snapshot = undoStackRef.current.pop()!
    redoStackRef.current.push(fieldsRef.current.map((f) => ({ ...f })))
    setFields(snapshot)
    setHistoryCounter((c) => c + 1)
    setSaved(false)
    isDirtyRef.current = true
  }

  function redo() {
    if (redoStackRef.current.length === 0) return
    const snapshot = redoStackRef.current.pop()!
    undoStackRef.current.push(fieldsRef.current.map((f) => ({ ...f })))
    setFields(snapshot)
    setHistoryCounter((c) => c + 1)
    setSaved(false)
    isDirtyRef.current = true
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hv = historyCounter
  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

  // --- Field operations ---

  function updateField(id: string, updates: Partial<FormField>) {
    recordHistory()
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
    setSaved(false)
  }

  function moveField(id: string, direction: 'up' | 'down') {
    recordHistory()
    setFields((prev) => {
      const field = prev.find((f) => f.id === id)
      if (!field) return prev

      // Section header: move entire section group
      if (isSectionLikeField(field)) {
        const sections = groupFieldsIntoSections(prev)
        const sIdx = sections.findIndex((s) => s.headerId === id)
        if (sIdx < 0) return prev
        const targetIdx = direction === 'up' ? sIdx - 1 : sIdx + 1
        if (targetIdx < 0 || targetIdx >= sections.length) return prev
        const next = [...sections]
        ;[next[sIdx], next[targetIdx]] = [next[targetIdx], next[sIdx]]
        return next.flatMap((s) => s.allFields).map((f, i) => ({ ...f, order: i + 1 }))
      }

      // Regular field: move within parent section only
      const idx = prev.findIndex((f) => f.id === id)
      if (idx < 0) return prev
      // Find parent section boundaries
      let sectionStart = 0
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i].type === 'section_header') { sectionStart = i + 1; break }
      }
      let sectionEnd = prev.length
      for (let i = idx + 1; i < prev.length; i++) {
        if (prev[i].type === 'section_header') { sectionEnd = i; break }
      }
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < sectionStart || newIdx >= sectionEnd) return prev
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
    isDirtyRef.current = true
  }

  function removeSectionWithFields(sectionHeaderId: string) {
    setFields((prev) => {
      const headerIdx = prev.findIndex((f) => f.id === sectionHeaderId)
      if (headerIdx === -1) return prev
      let endIdx = prev.length
      for (let i = headerIdx + 1; i < prev.length; i++) {
        if (isSectionLikeField(prev[i])) { endIdx = i; break }
      }
      const next = [...prev]
      next.splice(headerIdx, endIdx - headerIdx)
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
    setDeleteConfirm(null)
    setSaved(false)
    isDirtyRef.current = true
  }

  function handleDelete(id: string) {
    recordHistory()
    const field = fields.find((f) => f.id === id)
    if (!field) return
    if (field.type === 'checklist_placeholder' || field.type === 'material_system_placeholder' || field.type === 'field_guide_placeholder') {
      removeField(id)
    } else if (field.type === 'section_header') {
      if (isChecklistField(field)) {
        removeField(id)
      } else {
        removeSectionWithFields(id)
      }
    } else {
      removeField(id)
    }
  }

  /** Count content fields belonging to a section header */
  function getSectionFieldCount(sectionHeaderId: string): number {
    const headerIdx = fields.findIndex((f) => f.id === sectionHeaderId)
    if (headerIdx === -1) return 0
    let count = 0
    for (let i = headerIdx + 1; i < fields.length; i++) {
      if (isSectionLikeField(fields[i])) break
      count++
    }
    return count
  }

  /** Section headers list for the AddItemDropdown section picker */
  const sectionHeaders = useMemo(() => {
    return fields
      .filter((f) => f.type === 'section_header')
      .map((f) => ({ id: f.id, label: f.label }))
  }, [fields])

  function addFieldAtEndOfSection(newField: FormField, sectionId: string | null) {
    setFields((prev) => {
      if (sectionId === null) {
        return [...prev, newField].map((f, i) => ({ ...f, order: i + 1 }))
      }
      const headerIdx = prev.findIndex((f) => f.id === sectionId)
      if (headerIdx === -1) return [...prev, newField].map((f, i) => ({ ...f, order: i + 1 }))
      let insertIdx = prev.length
      for (let i = headerIdx + 1; i < prev.length; i++) {
        if (prev[i].type === 'section_header') { insertIdx = i; break }
      }
      const next = [...prev]
      next.splice(insertIdx, 0, newField)
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
    setSaved(false)
    isDirtyRef.current = true
  }

  function handleAddItem(type: FormFieldType, sectionId?: string) {
    recordHistory()

    if (type === 'section_header') {
      const id = generateId()
      const newSection: FormField = {
        id,
        type: 'section_header',
        label: 'New Section',
        placeholder: '',
        required: false,
        options: [],
        order: 0,
      }
      setFields((prev) => [newSection, ...prev].map((f, i) => ({ ...f, order: i + 1 })))
      setEditingFieldId(id)
      setSaved(false)
      return
    }

    const isPlaceholder = type === 'checklist_placeholder' || type === 'material_system_placeholder' || type === 'field_guide_placeholder'
    const id = isPlaceholder ? `${type}-${generateId()}` : generateId()
    const label = type === 'checklist_placeholder' ? 'Checklist'
      : type === 'material_system_placeholder' ? 'Material System'
      : type === 'field_guide_placeholder' ? 'Field Guide'
      : 'New Field'

    const newField: FormField = {
      id,
      type,
      label,
      placeholder: '',
      required: false,
      options: type === 'dropdown' || type === 'checkbox_group' ? ['Option 1'] : [],
      order: 0,
    }

    addFieldAtEndOfSection(newField, sectionId ?? null)
    if (!isPlaceholder) {
      setEditingFieldId(id)
    }
  }

  function addOption(fieldId: string) {
    recordHistory()
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
    recordHistory()
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
    recordHistory()
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

  async function handleSave(isAutosave = false) {
    if (!selectedTemplate) return
    if (isAutosave && isSavingRef.current) return
    isSavingRef.current = true
    setSaving(true)
    if (isAutosave) setAutosaveStatus('saving')
    const savedFields = fieldsRef.current
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('form_templates')
      .update({ fields: savedFields as unknown as Record<string, unknown>[], updated_at: now })
      .eq('id', selectedTemplate.id)
    if (error) {
      console.error('[FormManagement] Save template failed:', error)
      if (isAutosave) setAutosaveStatus('error')
    } else {
      isDirtyRef.current = false
      if (isAutosave) {
        setAutosaveStatus('saved')
        setTimeout(() => setAutosaveStatus('idle'), 2500)
      }
    }

    // Update the template in local state without triggering a field reload.
    // Use the same fields reference to avoid the selectedTemplate effect
    // from re-setting fields (which would cause an infinite loop).
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, fields: savedFields, updated_at: now } : t
      )
    )
    isSavingRef.current = false
    setSaving(false)
    setSaved(true)
    undoStackRef.current = []
    redoStackRef.current = []
    setHistoryCounter((c) => c + 1)
    setTimeout(() => setSaved(false), 2000)
  }

  // --- Autosave: debounced save after field changes ---
  useEffect(() => {
    // Skip the initial load when fields are set from the template
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    // Only autosave when the user has made actual changes
    if (!isDirtyRef.current) return
    // Don't autosave if no template is selected or fields are empty
    if (!selectedTemplate || fields.length === 0) return

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      if (isDirtyRef.current && !isSavingRef.current) {
        handleSave(true)
      }
    }, 3000)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields])

  // Reset initial load flag when template changes
  useEffect(() => {
    initialLoadRef.current = true
  }, [selectedKey])

  // --- Drag and drop ---

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const visibleFieldIds = useMemo(() => {
    const sections = groupFieldsIntoSections(fields)
    const ids: string[] = []
    for (const section of sections) {
      const isCollapsed = collapsedSections.has(section.headerId ?? '')
      for (const field of section.allFields) {
        if (isCollapsed && !isSectionLikeField(field)) continue
        ids.push(field.id)
      }
    }
    return ids
  }, [fields, collapsedSections])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    recordHistory()
    setFields((prev) => {
      const draggedField = prev.find((f) => f.id === active.id)
      if (!draggedField) return prev

      // Section header: move entire section group
      if (isSectionLikeField(draggedField)) {
        const sections = groupFieldsIntoSections(prev)
        const draggedIdx = sections.findIndex((s) => s.headerId === active.id)
        const targetIdx = sections.findIndex((s) =>
          s.allFields.some((f) => f.id === (over.id as string))
        )
        if (draggedIdx < 0 || targetIdx < 0 || draggedIdx === targetIdx) return prev
        const next = [...sections]
        const [moved] = next.splice(draggedIdx, 1)
        next.splice(targetIdx, 0, moved)
        return next.flatMap((s) => s.allFields).map((f, i) => ({ ...f, order: i + 1 }))
      }

      // Regular field: only allow reorder within same section
      const sections = groupFieldsIntoSections(prev)
      const fromSection = sections.find((s) => s.contentFields.some((f) => f.id === (active.id as string)))
      const overField = prev.find((f) => f.id === (over.id as string))
      if (!fromSection || !overField) return prev
      // Don't allow dropping on a section header
      if (overField.type === 'section_header') return prev
      // Don't allow cross-section moves
      const toSection = sections.find((s) => s.contentFields.some((f) => f.id === (over.id as string)))
      if (!toSection || fromSection.headerId !== toSection.headerId) return prev

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
    // Special: Material System section (project_report) — legacy format
    if (field.id === MATERIAL_SYSTEM_SECTION_ID) {
      return <MaterialSystemEditorSection collapsed={collapsedSections.has(field.id)} onToggleCollapse={() => toggleCollapse(field.id)} />
    }
    // Special: Checklist section — legacy format
    if (isChecklistField(field)) {
      const checklistId = getChecklistIdFromField(field)
      const template = checklistTemplates.find((c) => c.id === checklistId)
      return <ChecklistEditorSection name={template?.name ?? field.label} items={template?.items ?? []} collapsed={collapsedSections.has(field.id)} onToggleCollapse={() => toggleCollapse(field.id)} />
    }
    // Placeholder types — now rendered as regular field rows inside sections
    if (field.type === 'checklist_placeholder') {
      return <ChecklistPlaceholderFieldRow field={field} />
    }
    if (field.type === 'material_system_placeholder') {
      return <MaterialSystemPlaceholderFieldRow field={field} />
    }
    if (field.type === 'field_guide_placeholder') {
      return <FieldGuidePlaceholderFieldRow field={field} />
    }

    const onUpdate = (u: Partial<FormField>) => updateField(field.id, u)
    const autoEdit = editingFieldId === field.id
    const onEditDone = () => setEditingFieldId(null)

    switch (field.type) {
      case 'section_header':
        return <SectionHeaderField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} collapsed={collapsedSections.has(field.id)} onToggleCollapse={() => toggleCollapse(field.id)} />
      case 'short_text':
        return <ShortTextField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      case 'long_text':
        return <LongTextField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      case 'checkbox':
        return <CheckboxField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      case 'checkbox_group':
        return (
          <CheckboxGroupField
            field={field}
            onUpdate={onUpdate}
            onAddOption={() => addOption(field.id)}
            onUpdateOption={(idx, val) => updateOption(field.id, idx, val)}
            onRemoveOption={(idx) => removeOption(field.id, idx)}
            autoEdit={autoEdit}
            onEditDone={onEditDone}
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
            autoEdit={autoEdit}
            onEditDone={onEditDone}
          />
        )
      case 'date':
        return <DateField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      case 'number':
        return <NumberField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      case 'picture_upload':
        return <PictureUploadField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
      default:
        return <ShortTextField field={field} onUpdate={onUpdate} autoEdit={autoEdit} onEditDone={onEditDone} />
    }
  }

  const showLeftPanel = !filterFormKey
  const content = (
    <>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <div className={`flex flex-col ${showLeftPanel ? 'md:flex-row' : ''} gap-6`}>
            {/* Left Panel — Form List (hidden when filtering to single form) */}
            {showLeftPanel && (
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
                          ? 'bg-gray-50 text-gray-900 border-l-2 border-gray-400'
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
            )}

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
                    <div className="flex items-center gap-2 flex-wrap">
                      {!reorderMode && (
                        <AddItemDropdown
                          onAdd={(type, sectionId) => handleAddItem(type, sectionId)}
                          sections={sectionHeaders}
                          buttonStyle="primary"
                          isProjectReport={isProjectReport}
                        />
                      )}
                      <button
                        onClick={() => setReorderMode((v) => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          reorderMode
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300 dark:ring-amber-700'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                        title={reorderMode ? 'Exit reorder mode' : 'Reorder fields'}
                      >
                        <ArrowUpDownIcon className="w-4 h-4" />
                        Reorder
                      </button>
                      <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-600"
                        title="Undo"
                      >
                        <Undo2Icon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-600"
                        title="Redo"
                      >
                        <Redo2Icon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSave()}
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
                      {autosaveStatus !== 'idle' && (
                        <span className={`text-xs font-medium ${
                          autosaveStatus === 'saving' ? 'text-gray-400' :
                          autosaveStatus === 'saved' ? 'text-green-500' :
                          'text-red-500'
                        }`}>
                          {autosaveStatus === 'saving' ? 'Saving...' :
                           autosaveStatus === 'saved' ? 'All changes saved' :
                           'Save failed'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* WYSIWYG Form Card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={visibleFieldIds} strategy={verticalListSortingStrategy}>
                        <div className="p-4 md:p-6 space-y-3">
                          {(() => {
                            const sections = groupFieldsIntoSections(fields)

                            if (reorderMode) {
                              // Reorder mode: section headers AND fields are individually draggable
                              return sections.map((section, sIdx) => {
                                const headerField = section.allFields[0]
                                if (!headerField || section.headerId === null) {
                                  // Orphan fields — render individually sortable
                                  return (
                                    <div key={`__orphan_${sIdx}`}>
                                      {section.contentFields.map((field, fIdx) => (
                                        <div key={field.id} className="mb-3">
                                          <SortableFieldRow
                                            field={field}
                                            idx={fIdx}
                                            total={section.contentFields.length}
                                            onMove={moveField}
                                            onDelete={handleDelete}
                                            deleteConfirm={deleteConfirm}
                                            setDeleteConfirm={setDeleteConfirm}
                                            renderField={renderField}
                                            reorderMode={true}
                                            onEditField={(id) => setEditingFieldId(id)}
                                            sectionFieldCount={0}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )
                                }
                                const isSectionCollapsed = collapsedSections.has(section.headerId)
                                const isMaterialSection = section.headerId === MATERIAL_SYSTEM_SECTION_ID
                                const isChecklistSection = section.headerId.startsWith('checklist-')
                                const sectionsWithHeaders = sections.filter((s) => s.headerId !== null)
                                const sectionIdx = sectionsWithHeaders.findIndex((s) => s.headerId === section.headerId)
                                return (
                                  <div key={section.headerId} className="mb-3">
                                    {/* Section header — draggable, moves whole group */}
                                    <SortableFieldRow
                                      field={headerField}
                                      idx={sectionIdx}
                                      total={sectionsWithHeaders.length}
                                      onMove={moveField}
                                      onDelete={handleDelete}
                                      deleteConfirm={deleteConfirm}
                                      setDeleteConfirm={setDeleteConfirm}
                                      renderField={renderField}
                                      reorderMode={true}
                                      onEditField={(id) => setEditingFieldId(id)}
                                      sectionFieldCount={section.contentFields.length}
                                      noEdit={isMaterialSection || isChecklistSection}
                                    />
                                    {/* Content fields — individually draggable within section */}
                                    {!isSectionCollapsed && section.contentFields.map((cf, fIdx) => (
                                      <div key={cf.id} className="mb-3 mt-1">
                                        <SortableFieldRow
                                          field={cf}
                                          idx={fIdx}
                                          total={section.contentFields.length}
                                          onMove={moveField}
                                          onDelete={handleDelete}
                                          deleteConfirm={deleteConfirm}
                                          setDeleteConfirm={setDeleteConfirm}
                                          renderField={renderField}
                                          reorderMode={true}
                                          onEditField={(id) => setEditingFieldId(id)}
                                          sectionFieldCount={0}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )
                              })
                            }

                            // Normal mode: individual fields are sortable
                            return sections.map((section, sIdx) => {
                              const isMaterialSection = section.headerId === MATERIAL_SYSTEM_SECTION_ID
                              const isChecklistSection = section.headerId != null && section.headerId.startsWith('checklist-')
                              const isSpecialSection = isMaterialSection || isChecklistSection
                              const isSectionCollapsed = section.headerId ? collapsedSections.has(section.headerId) : false
                              return (
                              <div key={section.headerId ?? `__orphan_${sIdx}`}>
                                {section.allFields.map((field) => {
                                  // Hide content fields when section is collapsed
                                  if (isSectionCollapsed && !isSectionLikeField(field)) return null
                                  const globalIdx = fields.findIndex((f) => f.id === field.id)
                                  const fieldIsChecklist = isChecklistField(field)
                                  const fieldIsPlaceholder = field.type === 'checklist_placeholder' || field.type === 'material_system_placeholder' || field.type === 'field_guide_placeholder'
                                  return (
                                    <div key={field.id} className="mb-3 last:mb-0">
                                      <SortableFieldRow
                                        field={field}
                                        idx={globalIdx}
                                        total={fields.length}
                                        onMove={moveField}
                                        onDelete={handleDelete}
                                        deleteConfirm={deleteConfirm}
                                        setDeleteConfirm={setDeleteConfirm}
                                        renderField={renderField}
                                        reorderMode={reorderMode}
                                        onEditField={(id) => setEditingFieldId(id)}
                                        sectionFieldCount={isSectionLikeField(field) ? getSectionFieldCount(field.id) : 0}
                                        noEdit={isMaterialSection || fieldIsChecklist || fieldIsPlaceholder}
                                      />
                                    </div>
                                  )
                                })}
                                {/* Per-section Add Item — hide for special sections and collapsed sections */}
                                {!reorderMode && !isSpecialSection && !isSectionCollapsed && (
                                  <div className="pl-2 pt-1">
                                    <AddItemDropdown
                                      onAdd={(type) => handleAddItem(type, section.headerId ?? undefined)}
                                      excludeHeader
                                      buttonStyle="subtle"
                                      isProjectReport={isProjectReport}
                                    />
                                  </div>
                                )}
                              </div>
                            )})
                          })()}
                        </div>
                      </SortableContext>
                    </DndContext>

                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </>
  )

  if (embedded) return content

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
        {content}
      </div>
    </div>
  )
}
