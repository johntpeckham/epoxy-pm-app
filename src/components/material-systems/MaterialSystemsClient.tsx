'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useMaterialSystems, getItemsByVersion, getColumnsByVersion } from '@/lib/useMaterialSystems'
import type { MaterialSystemInput, MaterialSystemVersion, MaterialSystemItemInput } from '@/lib/useMaterialSystems'
import UnitSizeSelect from '@/components/ui/UnitSizeSelect'

interface ItemRow {
  material_name: string
  unit_size: string
  coverage_rate: string
  custom_column_values: Record<string, string>
}

interface ColumnDef {
  column_name: string
  sort_order: number
}

const emptyItem: ItemRow = { material_name: '', unit_size: '', coverage_rate: '', custom_column_values: {} }

interface FormState {
  name: string
  notes: string
  internal_items: ItemRow[]
  client_items: ItemRow[]
  internal_columns: ColumnDef[]
  client_columns: ColumnDef[]
}

type VersionTab = 'internal' | 'client'

const emptyForm: FormState = {
  name: '',
  notes: '',
  internal_items: [{ ...emptyItem }],
  client_items: [{ ...emptyItem }],
  internal_columns: [],
  client_columns: [],
}

function formToInput(form: FormState): MaterialSystemInput {
  return {
    name: form.name,
    notes: form.notes,
    internal_items: form.internal_items.map((i, idx) => ({
      material_name: i.material_name,
      unit_size: i.unit_size,
      coverage_rate: i.coverage_rate,
      sort_order: idx,
      custom_column_values: i.custom_column_values,
    })),
    client_items: form.client_items.map((i, idx) => ({
      material_name: i.material_name,
      unit_size: i.unit_size,
      coverage_rate: i.coverage_rate,
      sort_order: idx,
      custom_column_values: i.custom_column_values,
    })),
    internal_columns: form.internal_columns.map((c, idx) => ({
      column_name: c.column_name,
      sort_order: idx,
    })),
    client_columns: form.client_columns.map((c, idx) => ({
      column_name: c.column_name,
      sort_order: idx,
    })),
  }
}

export default function MaterialSystemsClient() {
  const router = useRouter()
  const { systems, loading, addSystem, updateSystem, deleteSystem } = useMaterialSystems()

  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<VersionTab>('internal')

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)

  const handleStartAdd = useCallback(() => {
    setEditId(null)
    setAddForm({ ...emptyForm, internal_items: [{ ...emptyItem }], client_items: [{ ...emptyItem }] })
    setAdding(true)
    setActiveTab('internal')
  }, [])

  async function handleAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    await addSystem(formToInput(addForm))
    setAddForm(emptyForm)
    setAdding(false)
    setSaving(false)
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name.trim()) return
    setSaving(true)
    await updateSystem(id, formToInput(editForm))
    setEditId(null)
    setSaving(false)
  }

  function renderFormFields(
    form: FormState,
    setForm: (f: FormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    submitLabel: string,
    isSaving: boolean,
  ) {
    const items = activeTab === 'internal' ? form.internal_items : form.client_items
    const columns = activeTab === 'internal' ? form.internal_columns : form.client_columns

    function setItems(newItems: ItemRow[]) {
      if (activeTab === 'internal') {
        setForm({ ...form, internal_items: newItems })
      } else {
        setForm({ ...form, client_items: newItems })
      }
    }

    function setColumns(newCols: ColumnDef[]) {
      if (activeTab === 'internal') {
        setForm({ ...form, internal_columns: newCols })
      } else {
        setForm({ ...form, client_columns: newCols })
      }
    }

    function updateItem(idx: number, updates: Partial<ItemRow>) {
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
      if (removed.column_name) {
        const cleaned = items.map((item) => {
          const vals = { ...item.custom_column_values }
          delete vals[removed.column_name]
          return { ...item, custom_column_values: vals }
        })
        setItems(cleaned)
      }
    }

    return (
      <div className="space-y-4">
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel()
            }}
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
                {tab === 'internal' ? 'Internal' : 'Client-Facing'}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 mb-2">
            {activeTab === 'internal'
              ? 'Materials shown in Project Reports (internal use).'
              : 'Materials shown in Estimates (client-facing).'}
          </p>

          {/* Materials Grid */}
          <label className="block text-xs font-medium text-gray-600 mb-2">Materials</label>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-0">
              {/* Header row */}
              <div
                className="grid gap-1.5 items-end mb-1"
                style={{ gridTemplateColumns: `repeat(${3 + columns.length}, minmax(0, 1fr)) 28px` }}
              >
                <span className="text-[10px] font-medium text-gray-500 px-1">Material Name</span>
                <span className="text-[10px] font-medium text-gray-500 px-1">Unit Size</span>
                <span className="text-[10px] font-medium text-gray-500 px-1">Coverage Rate</span>
                {columns.map((col, idx) => (
                  <div key={idx} className="flex items-end gap-0.5">
                    <input
                      type="text"
                      value={col.column_name}
                      onChange={(e) => updateColumn(idx, e.target.value)}
                      placeholder={`Column ${idx + 1}`}
                      className="min-w-0 flex-1 text-[10px] font-medium text-gray-500 bg-transparent border-b border-dashed border-gray-300 px-1 py-0 focus:outline-none focus:border-amber-400 placeholder-gray-300"
                    />
                    <button
                      onClick={() => removeColumn(idx)}
                      className="p-0 text-gray-300 hover:text-red-500 transition flex-shrink-0"
                    >
                      <XIcon className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                <span />
              </div>

              {/* Material rows */}
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid gap-1.5 items-start"
                    style={{ gridTemplateColumns: `repeat(${3 + columns.length}, minmax(0, 1fr)) 28px` }}
                  >
                    <input
                      type="text"
                      value={item.material_name}
                      onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                      placeholder="Material Name"
                      className="min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <UnitSizeSelect
                      value={item.unit_size}
                      onChange={(v) => updateItem(idx, { unit_size: v })}
                      className="min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white w-full text-left"
                    />
                    <input
                      type="text"
                      value={item.coverage_rate}
                      onChange={(e) => updateItem(idx, { coverage_rate: e.target.value })}
                      placeholder="Coverage Rate"
                      className="min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    {columns.map((col) => (
                      <input
                        key={col.column_name || col.sort_order}
                        type="text"
                        value={item.custom_column_values[col.column_name] ?? ''}
                        onChange={(e) => updateCustomValue(idx, col.column_name, e.target.value)}
                        placeholder={col.column_name || '—'}
                        className="min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    ))}
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition mt-0.5"
                      title="Remove material"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Material
            </button>
            {columns.length < 5 && (
              <button
                onClick={addColumn}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-amber-600 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                Add Column ({5 - columns.length} left)
              </button>
            )}
          </div>
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

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onSubmit}
            disabled={!form.name.trim() || isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {isSaving ? 'Saving...' : submitLabel}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <LayersIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Material System Management</h1>
            <p className="text-sm text-gray-500">Manage the master list of material systems used in Project Reports and Estimates.</p>
          </div>
        </div>

        {/* Content card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Material Systems ({systems.length})
            </h2>
            {!adding && !editId && (
              <button
                onClick={handleStartAdd}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Material System
              </button>
            )}
          </div>

          {/* Add new form */}
          {adding && (
            <div className="px-6 py-4 border-b border-gray-100 bg-amber-50/50">
              {renderFormFields(
                addForm,
                setAddForm,
                handleAdd,
                () => { setAdding(false); setAddForm(emptyForm) },
                'Save',
                saving,
              )}
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : systems.length === 0 && !adding ? (
            <div className="px-6 py-12 text-center">
              <LayersIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No material systems yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click &quot;Add Material System&quot; to create your first one.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {systems.map((ms) => {
                const internalItems = getItemsByVersion(ms, 'internal')
                const clientItems = getItemsByVersion(ms, 'client')
                return (
                <div key={ms.id} className="px-6 py-3 group hover:bg-gray-50 transition">
                  {editId === ms.id ? (
                    <div className="bg-amber-50/50 -mx-6 -my-3 px-6 py-4">
                      {renderFormFields(
                        editForm,
                        setEditForm,
                        () => handleSaveEdit(ms.id),
                        () => setEditId(null),
                        'Save',
                        saving,
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{ms.name}</span>
                        {/* Internal items */}
                        {internalItems.length > 0 && (
                          <div className="mt-0.5">
                            <span className="text-[10px] font-medium text-gray-400 uppercase">Internal</span>
                            {internalItems.map((item) => (
                              <div key={item.id} className="text-xs text-gray-400">
                                {item.material_name}
                                {item.unit_size && <span className="ml-2 text-gray-300">({item.unit_size})</span>}
                                {item.coverage_rate && <span className="ml-2 text-gray-300">{item.coverage_rate}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Client items */}
                        {clientItems.length > 0 && (
                          <div className="mt-0.5">
                            <span className="text-[10px] font-medium text-gray-400 uppercase">Client</span>
                            {clientItems.map((item) => (
                              <div key={item.id} className="text-xs text-gray-400">
                                {item.material_name}
                                {item.unit_size && <span className="ml-2 text-gray-300">({item.unit_size})</span>}
                                {item.coverage_rate && <span className="ml-2 text-gray-300">{item.coverage_rate}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {ms.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5">{ms.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 pt-0.5">
                        <button
                          onClick={() => {
                            setAdding(false)
                            setEditId(ms.id)
                            setActiveTab('internal')
                            const intItems = getItemsByVersion(ms, 'internal')
                            const cliItems = getItemsByVersion(ms, 'client')
                            const intCols = getColumnsByVersion(ms, 'internal')
                            const cliCols = getColumnsByVersion(ms, 'client')
                            setEditForm({
                              name: ms.name,
                              notes: ms.notes ?? '',
                              internal_items: intItems.length > 0
                                ? intItems.map((i) => ({
                                    material_name: i.material_name,
                                    unit_size: i.unit_size ?? '',
                                    coverage_rate: i.coverage_rate ?? '',
                                    custom_column_values: i.custom_column_values ?? {},
                                  }))
                                : [{ ...emptyItem }],
                              client_items: cliItems.length > 0
                                ? cliItems.map((i) => ({
                                    material_name: i.material_name,
                                    unit_size: i.unit_size ?? '',
                                    coverage_rate: i.coverage_rate ?? '',
                                    custom_column_values: i.custom_column_values ?? {},
                                  }))
                                : [{ ...emptyItem }],
                              internal_columns: intCols.map((c) => ({ column_name: c.column_name, sort_order: c.sort_order })),
                              client_columns: cliCols.map((c) => ({ column_name: c.column_name, sort_order: c.sort_order })),
                            })
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-amber-600 transition-all"
                          title="Edit"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteSystem(ms.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                          title="Delete"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
