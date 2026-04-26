'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useMaterialSystems } from '@/lib/useMaterialSystems'
import type { MaterialSystemInput } from '@/lib/useMaterialSystems'
import type { MasterProduct } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SearchableDropdown from '@/components/ui/SearchableDropdown'

interface ItemRow {
  material_name: string
  master_product_id: string | null
  thickness: string
  coverage_rate: string
  item_notes: string
}

const emptyItem: ItemRow = { material_name: '', master_product_id: null, thickness: '', coverage_rate: '', item_notes: '' }

interface FormState {
  name: string
  notes: string
  items: ItemRow[]
}

const emptyForm: FormState = {
  name: '',
  notes: '',
  items: [{ ...emptyItem }],
}

function formToInput(form: FormState): MaterialSystemInput {
  return {
    name: form.name,
    notes: form.notes,
    items: form.items.map((i, idx) => ({
      material_name: i.material_name,
      master_product_id: i.master_product_id,
      thickness: i.thickness,
      coverage_rate: i.coverage_rate,
      item_notes: i.item_notes,
      sort_order: idx,
    })),
  }
}

interface MaterialSystemsClientProps {
  embedded?: boolean  // Skip page wrapper and header when embedded in another page
}

export default function MaterialSystemsClient({ embedded }: MaterialSystemsClientProps = {}) {
  const { systems, loading, addSystem, updateSystem, deleteSystem } = useMaterialSystems()

  // Fetch master products for searchable dropdown
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([])
  useEffect(() => {
    const supabase = createClient()
    supabase.from('master_products').select('*').order('sort_order').order('name')
      .then(({ data }) => setMasterProducts((data as MasterProduct[]) ?? []))
  }, [])

  const productNames = useMemo(() => {
    return [...new Set(masterProducts.map((p) => p.name))].sort((a, b) => a.localeCompare(b))
  }, [masterProducts])

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
    const items = form.items

    function updateItem(idx: number, updates: Partial<ItemRow>) {
      const updated = [...items]
      updated[idx] = { ...updated[idx], ...updates }
      setForm({ ...form, items: updated })
    }

    function removeItem(idx: number) {
      setForm({ ...form, items: items.filter((_, i) => i !== idx) })
    }

    function addItem() {
      setForm({ ...form, items: [...items, { ...emptyItem }] })
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
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>

        {/* Materials */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Materials</label>
          {/* Column headers */}
          <div className="flex items-start gap-2 mb-1">
            <div className="grid grid-cols-3 gap-2 flex-1">
              <span className="text-[10px] font-medium text-gray-500 px-1">Material Name</span>
              <span className="text-[10px] font-medium text-gray-500 px-1">Thickness</span>
              <span className="text-[10px] font-medium text-gray-500 px-1">Coverage Rate</span>
            </div>
            <div className="w-[26px]" />
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx}>
                <div className="flex items-start gap-2">
                  <div className="grid grid-cols-3 gap-2 flex-1">
                    {productNames.length > 0 ? (
                      <SearchableDropdown
                        value={item.material_name}
                        onChange={(val) => {
                          const match = masterProducts.find((p) => p.name === val)
                          updateItem(idx, { material_name: val, master_product_id: match?.id ?? null })
                        }}
                        options={productNames}
                        placeholder="Material Name"
                      />
                    ) : (
                      <input
                        type="text"
                        value={item.material_name}
                        onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                        placeholder="Material Name"
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    )}
                    <input
                      type="text"
                      value={item.thickness}
                      onChange={(e) => updateItem(idx, { thickness: e.target.value })}
                      placeholder="Thickness"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                    <input
                      type="text"
                      value={item.coverage_rate}
                      onChange={(e) => updateItem(idx, { coverage_rate: e.target.value })}
                      placeholder="Coverage Rate"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition mt-0.5"
                    title="Remove material"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                {/* Per-material notes */}
                <div className="ml-0 mr-[34px] mt-1">
                  <textarea
                    value={item.item_notes}
                    onChange={(e) => updateItem(idx, { item_notes: e.target.value })}
                    placeholder="Add material notes..."
                    rows={1}
                    className="w-full border border-gray-100 rounded px-2 py-1 text-xs text-gray-500 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 resize-y"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
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
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
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

  const contentBlock = (
    <>
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
                <PlusIcon className="w-4 h-4" />
                Add Material System
              </button>
            )}
          </div>

          {/* Add new form */}
          {adding && (
            <div className="px-6 py-4 border-b border-gray-100">
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
                    <div className="-mx-6 -my-3 px-6 py-4">
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
                          <div className="mt-0.5">
                            {ms.items.map((item) => (
                              <div key={item.id} className="text-xs text-gray-400">
                                {item.material_name}
                                {item.thickness && <span className="ml-2 text-gray-300">({item.thickness})</span>}
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
                                ? ms.items.map((i) => {
                                    // Resolve material name from master FK, fall back to saved text
                                    let materialName = i.material_name
                                    if (i.master_product_id) {
                                      const mp = masterProducts.find((p) => p.id === i.master_product_id)
                                      if (mp) materialName = mp.name
                                    }
                                    return {
                                      material_name: materialName,
                                      master_product_id: i.master_product_id ?? null,
                                      thickness: i.thickness ?? '',
                                      coverage_rate: i.coverage_rate ?? '',
                                      item_notes: i.item_notes ?? '',
                                    }
                                  })
                                : [{ ...emptyItem }],
                            })
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-amber-600 transition-all"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteSystem(ms.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                          title="Delete"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

    </>
  )

  if (embedded) return contentBlock

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/profile" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <LayersIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Material System Management</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-500 mb-6">Manage the master list of material systems used in Project Reports and Proposals.</p>
        {contentBlock}
      </div>
    </div>
  )
}
