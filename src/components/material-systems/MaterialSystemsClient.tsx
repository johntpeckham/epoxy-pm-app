'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon, XIcon, ChevronDownIcon, ChevronRightIcon, FactoryIcon } from 'lucide-react'
import { useMaterialSystems } from '@/lib/useMaterialSystems'
import type { MaterialSystemInput } from '@/lib/useMaterialSystems'
import { useManufacturers } from '@/lib/useManufacturers'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ItemRow {
  material_name: string
  thickness: string
  coverage_rate: string
  item_notes: string
}

const emptyItem: ItemRow = { material_name: '', thickness: '', coverage_rate: '', item_notes: '' }

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
      thickness: i.thickness,
      coverage_rate: i.coverage_rate,
      item_notes: i.item_notes,
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
                    <input
                      type="text"
                      value={item.material_name}
                      onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                      placeholder="Material Name"
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={item.thickness}
                      onChange={(e) => updateItem(idx, { thickness: e.target.value })}
                      placeholder="Thickness"
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
            rows={4}
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
                                ? ms.items.map((i) => ({
                                    material_name: i.material_name,
                                    thickness: i.thickness ?? '',
                                    coverage_rate: i.coverage_rate ?? '',
                                    item_notes: i.item_notes ?? '',
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

        {/* ── Manufacturers & Products ──────────────────────────── */}
        <ManufacturersSection />
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   Manufacturers & Products Section
   ════════════════════════════════════════════════════════════════ */

function ManufacturersSection() {
  const {
    manufacturers,
    loading,
    addManufacturer,
    updateManufacturer,
    deleteManufacturer,
    addProduct,
    updateProduct,
    deleteProduct,
  } = useManufacturers()

  const [addingMfr, setAddingMfr] = useState(false)
  const [addMfrName, setAddMfrName] = useState('')
  const [addMfrError, setAddMfrError] = useState('')
  const [savingMfr, setSavingMfr] = useState(false)

  const [expandedMfrs, setExpandedMfrs] = useState<Set<string>>(new Set())
  const [editingMfrId, setEditingMfrId] = useState<string | null>(null)
  const [editMfrName, setEditMfrName] = useState('')
  const [editMfrError, setEditMfrError] = useState('')

  const [deletingMfr, setDeletingMfr] = useState<{ id: string; name: string; productCount: number } | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<{ id: string; manufacturerId: string; name: string } | null>(null)

  const [addingProductMfrId, setAddingProductMfrId] = useState<string | null>(null)
  const [addProductName, setAddProductName] = useState('')
  const [addProductError, setAddProductError] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)

  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editProductName, setEditProductName] = useState('')
  const [editProductError, setEditProductError] = useState('')

  const addMfrInputRef = useRef<HTMLInputElement>(null)
  const addProductInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingMfr) addMfrInputRef.current?.focus()
  }, [addingMfr])

  useEffect(() => {
    if (addingProductMfrId) addProductInputRef.current?.focus()
  }, [addingProductMfrId])

  const toggleExpanded = (id: string) => {
    setExpandedMfrs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAddMfr = async () => {
    if (!addMfrName.trim()) return
    setSavingMfr(true)
    setAddMfrError('')
    const result = await addManufacturer(addMfrName)
    if (typeof result === 'string') {
      setAddMfrError(result)
      setSavingMfr(false)
      return
    }
    // Auto-expand newly added manufacturer
    setExpandedMfrs((prev) => new Set(prev).add(result.id))
    setAddMfrName('')
    setAddingMfr(false)
    setSavingMfr(false)
  }

  const handleSaveEditMfr = async (id: string) => {
    if (!editMfrName.trim()) return
    setEditMfrError('')
    const result = await updateManufacturer(id, editMfrName)
    if (result !== true) {
      setEditMfrError(result)
      return
    }
    setEditingMfrId(null)
  }

  const handleAddProduct = async (manufacturerId: string) => {
    if (!addProductName.trim()) return
    setSavingProduct(true)
    setAddProductError('')
    const result = await addProduct(manufacturerId, addProductName)
    if (typeof result === 'string') {
      setAddProductError(result)
      setSavingProduct(false)
      return
    }
    setAddProductName('')
    setAddingProductMfrId(null)
    setSavingProduct(false)
  }

  const handleSaveEditProduct = async (productId: string, manufacturerId: string) => {
    if (!editProductName.trim()) return
    setEditProductError('')
    const result = await updateProduct(productId, manufacturerId, editProductName)
    if (result !== true) {
      setEditProductError(result)
      return
    }
    setEditingProductId(null)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Manufacturers &amp; Products ({manufacturers.length})
          </h2>
          {!addingMfr && (
            <button
              onClick={() => { setAddingMfr(true); setAddMfrName(''); setAddMfrError('') }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Manufacturer
            </button>
          )}
        </div>

        {/* Add manufacturer inline form */}
        {addingMfr && (
          <div className="px-6 py-4 border-b border-gray-100">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Manufacturer Name <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                ref={addMfrInputRef}
                type="text"
                value={addMfrName}
                onChange={(e) => setAddMfrName(e.target.value)}
                placeholder="e.g. Sika, Euclid, Dur-A-Flex..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddMfr()
                  if (e.key === 'Escape') { setAddingMfr(false); setAddMfrError('') }
                }}
              />
              <button
                onClick={handleAddMfr}
                disabled={!addMfrName.trim() || savingMfr}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {savingMfr ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setAddingMfr(false); setAddMfrError('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
            </div>
            {addMfrError && <p className="text-xs text-red-500 mt-1">{addMfrError}</p>}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
        ) : manufacturers.length === 0 && !addingMfr ? (
          <div className="px-6 py-12 text-center">
            <FactoryIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No manufacturers yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click &quot;Add Manufacturer&quot; to create your first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {manufacturers.map((mfr) => {
              const isExpanded = expandedMfrs.has(mfr.id)
              const isEditing = editingMfrId === mfr.id
              return (
                <div key={mfr.id} className="group">
                  {/* Manufacturer header */}
                  <div className="px-6 py-3 flex items-center gap-2 hover:bg-gray-50 transition">
                    <button
                      onClick={() => toggleExpanded(mfr.id)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      {isExpanded
                        ? <ChevronDownIcon className="w-4 h-4" />
                        : <ChevronRightIcon className="w-4 h-4" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div>
                          <input
                            type="text"
                            value={editMfrName}
                            onChange={(e) => setEditMfrName(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditMfr(mfr.id)
                              if (e.key === 'Escape') { setEditingMfrId(null); setEditMfrError('') }
                            }}
                            onBlur={() => {
                              if (editMfrName.trim() && editMfrName.trim() !== mfr.name) {
                                handleSaveEditMfr(mfr.id)
                              } else {
                                setEditingMfrId(null)
                                setEditMfrError('')
                              }
                            }}
                          />
                          {editMfrError && <p className="text-xs text-red-500 mt-0.5">{editMfrError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{mfr.name}</span>
                          <span className="text-xs text-gray-400">
                            {mfr.products.length} product{mfr.products.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingMfrId(mfr.id); setEditMfrName(mfr.name); setEditMfrError('') }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-amber-600 transition-all"
                          title="Edit manufacturer"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingMfr({ id: mfr.id, name: mfr.name, productCount: mfr.products.length })}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                          title="Delete manufacturer"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded products */}
                  {isExpanded && (
                    <div className="pl-12 pr-6 pb-3">
                      {mfr.products.length === 0 && !addingProductMfrId ? (
                        <p className="text-xs text-gray-400 py-1">No products yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {mfr.products.map((product) => {
                            const isEditingProduct = editingProductId === product.id
                            return (
                              <div key={product.id} className="flex items-center gap-2 group/product py-0.5">
                                {isEditingProduct ? (
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      value={editProductName}
                                      onChange={(e) => setEditProductName(e.target.value)}
                                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEditProduct(product.id, mfr.id)
                                        if (e.key === 'Escape') { setEditingProductId(null); setEditProductError('') }
                                      }}
                                      onBlur={() => {
                                        if (editProductName.trim() && editProductName.trim() !== product.name) {
                                          handleSaveEditProduct(product.id, mfr.id)
                                        } else {
                                          setEditingProductId(null)
                                          setEditProductError('')
                                        }
                                      }}
                                    />
                                    {editProductError && <p className="text-xs text-red-500 mt-0.5">{editProductError}</p>}
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-sm text-gray-700 flex-1">{product.name}</span>
                                    <button
                                      onClick={() => { setEditingProductId(product.id); setEditProductName(product.name); setEditProductError('') }}
                                      className="opacity-0 group-hover/product:opacity-100 p-1 text-gray-400 hover:text-amber-600 transition-all"
                                      title="Edit product"
                                    >
                                      <PencilIcon className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => setDeletingProduct({ id: product.id, manufacturerId: mfr.id, name: product.name })}
                                      className="opacity-0 group-hover/product:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                                      title="Delete product"
                                    >
                                      <Trash2Icon className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Add product inline form */}
                      {addingProductMfrId === mfr.id ? (
                        <div className="mt-2">
                          <div className="flex gap-2">
                            <input
                              ref={addProductInputRef}
                              type="text"
                              value={addProductName}
                              onChange={(e) => setAddProductName(e.target.value)}
                              placeholder="Product name"
                              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddProduct(mfr.id)
                                if (e.key === 'Escape') { setAddingProductMfrId(null); setAddProductError('') }
                              }}
                            />
                            <button
                              onClick={() => handleAddProduct(mfr.id)}
                              disabled={!addProductName.trim() || savingProduct}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                            >
                              {savingProduct ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => { setAddingProductMfrId(null); setAddProductError('') }}
                              className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
                            >
                              Cancel
                            </button>
                          </div>
                          {addProductError && <p className="text-xs text-red-500 mt-1">{addProductError}</p>}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingProductMfrId(mfr.id); setAddProductName(''); setAddProductError('') }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          Add Product
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete manufacturer confirmation */}
      {deletingMfr && (
        <ConfirmDialog
          title="Delete Manufacturer"
          message={`Delete "${deletingMfr.name}" and all its ${deletingMfr.productCount} product${deletingMfr.productCount !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={async () => {
            await deleteManufacturer(deletingMfr.id)
            setDeletingMfr(null)
          }}
          onCancel={() => setDeletingMfr(null)}
        />
      )}

      {/* Delete product confirmation */}
      {deletingProduct && (
        <ConfirmDialog
          title="Delete Product"
          message={`Delete "${deletingProduct.name}"?`}
          onConfirm={async () => {
            await deleteProduct(deletingProduct.id, deletingProduct.manufacturerId)
            setDeletingProduct(null)
          }}
          onCancel={() => setDeletingProduct(null)}
        />
      )}
    </>
  )
}
