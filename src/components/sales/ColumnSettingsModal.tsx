'use client'

import { useState } from 'react'
import {
  XIcon,
  GripVerticalIcon,
  Trash2Icon,
  PlusIcon,
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
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { CrmColumn, CustomColumn } from './crmColumns'

interface ColumnSettingsModalProps {
  allColumns: CrmColumn[]
  columnOrder: string[]
  onClose: () => void
  onColumnCreated: (col: {
    name: string
    column_type: 'text' | 'number' | 'date' | 'select'
    select_options: string[] | null
  }) => void
  onColumnDeleted: (dbId: string) => void
  onOrderSaved: (order: string[]) => void
}

function SortableRow({
  col,
  onDelete,
}: {
  col: CrmColumn
  onDelete?: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isCustom = col.type === 'custom'
  const typeLabel = isCustom
    ? (col as CustomColumn).columnType.charAt(0).toUpperCase() +
      (col as CustomColumn).columnType.slice(1)
    : 'Built-in'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-100 rounded-lg mb-1"
    >
      <button
        type="button"
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="w-4 h-4" />
      </button>
      <span className="flex-1 text-sm text-gray-800 truncate">{col.label}</span>
      <span
        className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
          isCustom
            ? 'bg-amber-50 text-amber-600'
            : 'bg-gray-50 text-gray-400'
        }`}
      >
        {typeLabel}
      </span>
      {isCustom && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
          title="Delete column"
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

export default function ColumnSettingsModal({
  allColumns,
  columnOrder,
  onClose,
  onColumnCreated,
  onColumnDeleted,
  onOrderSaved,
}: ColumnSettingsModalProps) {
  const supabase = createClient()

  const initialOrder =
    columnOrder.length > 0
      ? (() => {
          const orderMap = new Map(columnOrder.map((id, idx) => [id, idx]))
          return [...allColumns].sort((a, b) => {
            const ai = orderMap.get(a.id) ?? 9999
            const bi = orderMap.get(b.id) ?? 9999
            return ai - bi
          })
        })()
      : [...allColumns]

  const [orderedCols, setOrderedCols] = useState<CrmColumn[]>(initialOrder)
  const [saving, setSaving] = useState(false)

  // Add column form state
  const [colName, setColName] = useState('')
  const [colType, setColType] = useState<'text' | 'number' | 'date' | 'select'>('text')
  const [optionInput, setOptionInput] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<CrmColumn | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedCols((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id)
      const newIndex = prev.findIndex((c) => c.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function saveOrder() {
    const order = orderedCols.map((c) => c.id)
    setSaving(true)
    await supabase.from('crm_column_order').upsert(
      {
        company_id: '00000000-0000-0000-0000-000000000000',
        column_order: order,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    )
    setSaving(false)
    onOrderSaved(order)
  }

  function addOption() {
    const trimmed = optionInput.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setOptionInput('')
    }
  }

  async function handleCreateColumn() {
    if (!colName.trim()) return
    if (colType === 'select' && options.length === 0) return
    setCreating(true)
    await onColumnCreated({
      name: colName.trim(),
      column_type: colType,
      select_options: colType === 'select' ? options : null,
    })
    setColName('')
    setColType('text')
    setOptionInput('')
    setOptions([])
    setCreating(false)
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteTarget.type !== 'custom') return
    setDeleting(true)
    await onColumnDeleted((deleteTarget as CustomColumn).dbId)
    setOrderedCols((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
  }

  // Sync orderedCols when allColumns changes (new column added)
  const allIds = new Set(allColumns.map((c) => c.id))
  const orderedIds = new Set(orderedCols.map((c) => c.id))
  const newCols = allColumns.filter((c) => !orderedIds.has(c.id))
  const validOrdered = orderedCols.filter((c) => allIds.has(c.id))
  const displayCols = [...validOrdered, ...newCols]
  if (displayCols.length !== orderedCols.length || newCols.length > 0) {
    if (displayCols.map((c) => c.id).join(',') !== orderedCols.map((c) => c.id).join(',')) {
      // defer state update
      setTimeout(() => setOrderedCols(displayCols), 0)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <h3 className="text-base font-semibold text-gray-900">Column Settings</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1.5 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-6">
            {/* Section A: Column Order */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">Column Order</h4>
                <button
                  type="button"
                  onClick={saveOrder}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Order'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                Drag to reorder. This order applies to all users.
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedCols.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedCols.map((col) => (
                    <SortableRow
                      key={col.id}
                      col={col}
                      onDelete={
                        col.type === 'custom' ? () => setDeleteTarget(col) : undefined
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Section B: Add New Column */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Add New Column</h4>
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="e.g., Contract Value"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <select
                  value={colType}
                  onChange={(e) => setColType(e.target.value as typeof colType)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                </select>

                {colType === 'select' && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addOption()
                          }
                        }}
                        placeholder="Add option..."
                        className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={addOption}
                        disabled={!optionInput.trim()}
                        className="px-3 py-2 text-xs font-medium text-amber-600 border border-amber-200 rounded-md hover:bg-amber-50 disabled:opacity-40 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    {options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((opt) => (
                          <span
                            key={opt}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
                          >
                            {opt}
                            <button
                              type="button"
                              onClick={() => setOptions(options.filter((o) => o !== opt))}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateColumn}
                  disabled={
                    creating ||
                    !colName.trim() ||
                    (colType === 'select' && options.length === 0)
                  }
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md disabled:opacity-50 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  {creating ? 'Creating…' : 'Create Column'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-gray-900 mb-2">
              Delete column?
            </h4>
            <p className="text-sm text-gray-500 mb-4">
              Delete &ldquo;{deleteTarget.label}&rdquo;? All data in this column will be permanently lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Portal>
  )
}
