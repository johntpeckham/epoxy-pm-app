'use client'

import { useState } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import UnitSizeSelect from './UnitSizeSelect'
import Portal from './Portal'

export interface FormItemRow {
  material_name: string
  unit_size: string
  coverage_rate: string
  custom_column_values: Record<string, string>
}

export interface FormColumnDef {
  column_name: string
  sort_order: number
}

export interface MaterialSystemFormState {
  name: string
  notes: string
  internal_items: FormItemRow[]
  client_items: FormItemRow[]
  internal_columns: FormColumnDef[]
  client_columns: FormColumnDef[]
}

const emptyItem: FormItemRow = { material_name: '', unit_size: '', coverage_rate: '', custom_column_values: {} }

type VersionTab = 'internal' | 'client'

interface MaterialSystemFormModalProps {
  title: string
  initial?: MaterialSystemFormState
  onSave: (form: MaterialSystemFormState) => Promise<void>
  onClose: () => void
}

const defaultInitial: MaterialSystemFormState = {
  name: '',
  notes: '',
  internal_items: [{ ...emptyItem }],
  client_items: [{ ...emptyItem }],
  internal_columns: [],
  client_columns: [],
}

export default function MaterialSystemFormModal({
  title,
  initial,
  onSave,
  onClose,
}: MaterialSystemFormModalProps) {
  const [form, setForm] = useState<MaterialSystemFormState>(initial ?? { ...defaultInitial })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<VersionTab>('internal')

  const items = activeTab === 'internal' ? form.internal_items : form.client_items
  const columns = activeTab === 'internal' ? form.internal_columns : form.client_columns

  function setItems(newItems: FormItemRow[]) {
    if (activeTab === 'internal') {
      setForm({ ...form, internal_items: newItems })
    } else {
      setForm({ ...form, client_items: newItems })
    }
  }

  function setColumns(newCols: FormColumnDef[]) {
    if (activeTab === 'internal') {
      setForm({ ...form, internal_columns: newCols })
    } else {
      setForm({ ...form, client_columns: newCols })
    }
  }

  function updateItem(idx: number, updates: Partial<FormItemRow>) {
    const updated = [...items]
    updated[idx] = { ...updated[idx], ...updates }
    setItems(updated)
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItems([...items, { ...emptyItem }])
  }

  function updateCustomValue(itemIdx: number, colName: string, value: string) {
    const updated = [...items]
    updated[itemIdx] = {
      ...updated[itemIdx],
      custom_column_values: { ...updated[itemIdx].custom_column_values, [colName]: value },
    }
    setItems(updated)
  }

  function addColumn() {
    if (columns.length >= 5) return
    setColumns([...columns, { column_name: '', sort_order: columns.length }])
  }

  function updateColumn(idx: number, name: string) {
    const updated = [...columns]
    updated[idx] = { ...updated[idx], column_name: name }
    setColumns(updated)
  }

  function removeColumn(idx: number) {
    const removed = columns[idx]
    setColumns(columns.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sort_order: i })))
    // Clean up custom column values from items
    if (removed.column_name) {
      const cleaned = items.map((item) => {
        const vals = { ...item.custom_column_values }
        delete vals[removed.column_name]
        return { ...item, custom_column_values: vals }
      })
      setItems(cleaned)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const tabLabel = (tab: VersionTab) => tab === 'internal' ? 'Internal' : 'Client-Facing'

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* System Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                System Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Epoxy Broadcast, Polyurea, MMA..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Version Tabs */}
            <div>
              <div className="flex border-b border-gray-200 mb-3">
                {(['internal', 'client'] as VersionTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-amber-500 text-amber-700'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-gray-400 mb-2">
                {activeTab === 'internal'
                  ? 'Materials shown in Project Reports (internal use).'
                  : 'Materials shown in Estimates (client-facing).'}
              </p>

              {/* Custom Columns */}
              {columns.length > 0 && (
                <div className="mb-3">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Custom Columns</label>
                  <div className="space-y-1">
                    {columns.map((col, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          type="text"
                          value={col.column_name}
                          onChange={(e) => updateColumn(idx, e.target.value)}
                          placeholder={`Column ${idx + 1}`}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          onClick={() => removeColumn(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 transition"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {columns.length < 5 && (
                <button
                  onClick={addColumn}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-amber-600 mb-3 transition-colors"
                >
                  <PlusIcon className="w-3 h-3" />
                  Add Custom Column ({5 - columns.length} remaining)
                </button>
              )}

              {/* Materials */}
              <label className="block text-xs font-medium text-gray-600 mb-2">Materials</label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-start gap-2">
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        <input
                          type="text"
                          value={item.material_name}
                          onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                          placeholder="Material Name"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <UnitSizeSelect
                          value={item.unit_size}
                          onChange={(v) => updateItem(idx, { unit_size: v })}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white w-full text-left"
                        />
                        <input
                          type="text"
                          value={item.coverage_rate}
                          onChange={(e) => updateItem(idx, { coverage_rate: e.target.value })}
                          placeholder="Coverage Rate"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                      <button
                        onClick={() => removeItem(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition mt-0.5"
                        title="Remove material"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Custom column values for this item */}
                    {columns.filter((c) => c.column_name.trim()).length > 0 && (
                      <div className="ml-0 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.filter((c) => c.column_name.trim()).length}, 1fr)` }}>
                        {columns.filter((c) => c.column_name.trim()).map((col) => (
                          <input
                            key={col.column_name}
                            type="text"
                            value={item.custom_column_values[col.column_name] ?? ''}
                            onChange={(e) => updateCustomValue(idx, col.column_name, e.target.value)}
                            placeholder={col.column_name}
                            className="border border-gray-100 rounded px-2 py-1 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Material
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes for this system..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
