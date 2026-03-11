'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useMaterialSystems } from '@/lib/useMaterialSystems'
import type { MaterialSystemInput } from '@/lib/useMaterialSystems'

interface ItemRow {
  material_name: string
  unit_size: string
  coverage_rate: string
}

const emptyItem: ItemRow = { material_name: '', unit_size: '', coverage_rate: '' }

interface FormState {
  name: string
  notes: string
  items: ItemRow[]
}

const emptyForm: FormState = { name: '', notes: '', items: [{ ...emptyItem }] }

function formToInput(form: FormState): MaterialSystemInput {
  return {
    name: form.name,
    notes: form.notes,
    items: form.items.map((i, idx) => ({
      material_name: i.material_name,
      unit_size: i.unit_size,
      coverage_rate: i.coverage_rate,
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

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)

  const handleStartAdd = useCallback(() => {
    setEditId(null)
    setAddForm({ ...emptyForm, items: [{ ...emptyItem }] })
    setAdding(true)
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
    function updateItem(idx: number, updates: Partial<ItemRow>) {
      const items = [...form.items]
      items[idx] = { ...items[idx], ...updates }
      setForm({ ...form, items })
    }

    function removeItem(idx: number) {
      setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
    }

    function addItem() {
      setForm({ ...form, items: [...form.items, { ...emptyItem }] })
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

        {/* Materials */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Materials</label>
          <div className="space-y-2">
            {form.items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <input
                    type="text"
                    value={item.material_name}
                    onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                    placeholder="Material Name"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={item.unit_size}
                    onChange={(e) => updateItem(idx, { unit_size: e.target.value })}
                    placeholder="Unit Size"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
              {systems.map((ms) => (
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
                        {ms.items.length > 0 && (
                          <div className="mt-0.5 space-y-0">
                            {ms.items.map((item) => (
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
                            setEditForm({
                              name: ms.name,
                              notes: ms.notes ?? '',
                              items: ms.items.length > 0
                                ? ms.items.map((i) => ({
                                    material_name: i.material_name,
                                    unit_size: i.unit_size ?? '',
                                    coverage_rate: i.coverage_rate ?? '',
                                  }))
                                : [{ ...emptyItem }],
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
