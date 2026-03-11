'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useMaterialSystems, MaterialSystemInput } from '@/lib/useMaterialSystems'

const emptyForm: MaterialSystemInput = { name: '', default_quantity: '', default_coverage_rate: '', default_notes: '' }

export default function MaterialSystemsClient() {
  const router = useRouter()
  const { systems, loading, addSystem, updateSystem, deleteSystem } = useMaterialSystems()

  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<MaterialSystemInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<MaterialSystemInput>(emptyForm)

  const handleStartAdd = useCallback(() => {
    setEditId(null)
    setAddForm(emptyForm)
    setAdding(true)
  }, [])

  async function handleAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    await addSystem(addForm)
    setAddForm(emptyForm)
    setAdding(false)
    setSaving(false)
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name.trim()) return
    await updateSystem(id, editForm)
    setEditId(null)
  }

  function renderFormFields(
    form: MaterialSystemInput,
    setForm: (f: MaterialSystemInput) => void,
    onSubmit: () => void,
    onCancel: () => void,
    submitLabel: string,
    isSaving: boolean,
  ) {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">System Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Epoxy Broadcast, Polyurea, MMA..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Quantity</label>
            <input
              type="text"
              value={form.default_quantity ?? ''}
              onChange={(e) => setForm({ ...form, default_quantity: e.target.value })}
              placeholder="e.g. 500 gallons"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Coverage Rate</label>
            <input
              type="text"
              value={form.default_coverage_rate ?? ''}
              onChange={(e) => setForm({ ...form, default_coverage_rate: e.target.value })}
              placeholder="e.g. 200 sq ft/gal"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default Notes</label>
          <input
            type="text"
            value={form.default_notes ?? ''}
            onChange={(e) => setForm({ ...form, default_notes: e.target.value })}
            placeholder="Optional notes..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
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
                        false,
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{ms.name}</span>
                        {(ms.default_quantity || ms.default_coverage_rate || ms.default_notes) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                            {ms.default_quantity && (
                              <span className="text-xs text-gray-400">Qty: {ms.default_quantity}</span>
                            )}
                            {ms.default_coverage_rate && (
                              <span className="text-xs text-gray-400">Coverage: {ms.default_coverage_rate}</span>
                            )}
                            {ms.default_notes && (
                              <span className="text-xs text-gray-400">{ms.default_notes}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 pt-0.5">
                        <button
                          onClick={() => {
                            setAdding(false)
                            setEditId(ms.id)
                            setEditForm({
                              name: ms.name,
                              default_quantity: ms.default_quantity ?? '',
                              default_coverage_rate: ms.default_coverage_rate ?? '',
                              default_notes: ms.default_notes ?? '',
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
