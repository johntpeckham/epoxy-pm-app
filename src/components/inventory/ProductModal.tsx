'use client'

import { useEffect, useRef, useState } from 'react'
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type {
  InventoryKitGroup,
  InventoryProduct,
  InventoryUnit,
  MaterialSupplier,
  MasterProduct,
  MasterSupplier,
  UnitType,
} from '@/types'

export interface ProductFormData {
  name: string
  quantity: number
  unit: InventoryUnit
  price: number | null
  kit_group_id: string | null
  supplier_id: string | null
  masterProductId: string | null
}

interface Props {
  product: InventoryProduct | null
  supplierName: string
  suppliers: MaterialSupplier[]
  kitGroups: InventoryKitGroup[]
  kitGroupsBySupplier: Map<string, InventoryKitGroup[]>
  unitTypes: UnitType[]
  masterProducts: MasterProduct[]
  masterSuppliers: MasterSupplier[]
  initialSupplierId: string | null
  onClose: () => void
  onSave: (data: ProductFormData) => Promise<void> | void
}

export default function ProductModal({
  product,
  supplierName,
  suppliers,
  kitGroups,
  kitGroupsBySupplier,
  unitTypes,
  masterProducts,
  masterSuppliers,
  initialSupplierId,
  onClose,
  onSave,
}: Props) {
  const isEdit = !!product
  const autoSupplierId = !isEdit && suppliers.length === 1 ? suppliers[0].id : initialSupplierId
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(autoSupplierId ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [quantity, setQuantity] = useState<string>(
    product?.quantity !== undefined && product?.quantity !== null
      ? String(product.quantity)
      : '0'
  )
  const [unit, setUnit] = useState<InventoryUnit>(
    product?.unit ?? (unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal')
  )
  const [kitGroupId, setKitGroupId] = useState<string>(product?.kit_group_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Master product selection (add mode only)
  const [selectedMasterProductId, setSelectedMasterProductId] = useState<string | null>(null)
  const [addNewMode, setAddNewMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find the master_supplier_id for the currently selected inventory supplier
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId)
  const masterSupplierId = selectedSupplier?.master_supplier_id ?? null

  // Filter master products to those belonging to the selected supplier's master supplier
  const availableMasterProducts = masterSupplierId
    ? masterProducts.filter((mp) => mp.supplier_id === masterSupplierId)
    : []

  const filteredMasterProducts = availableMasterProducts.filter((mp) =>
    mp.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const currentKitGroups = isEdit
    ? kitGroups
    : (kitGroupsBySupplier.get(selectedSupplierId) ?? [])

  useEffect(() => {
    if (isEdit) {
      inputRef.current?.focus()
    }
  }, [isEdit])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset product selection when supplier changes
  useEffect(() => {
    if (!isEdit) {
      setSelectedMasterProductId(null)
      setAddNewMode(false)
      setSearchQuery('')
      setName('')
      setKitGroupId('')
    }
  }, [selectedSupplierId, isEdit])

  function selectMasterProduct(mp: MasterProduct) {
    setSelectedMasterProductId(mp.id)
    setName(mp.name)
    setUnit(mp.unit || (unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal'))
    setSearchQuery(mp.name)
    setDropdownOpen(false)
    setAddNewMode(false)
  }

  function handleAddNew() {
    setSelectedMasterProductId(null)
    setAddNewMode(true)
    setName(searchQuery)
    setDropdownOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!isEdit && !selectedSupplierId) {
      setError('Please select a supplier.')
      return
    }
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Product name is required.')
      return
    }
    const parsedQty = parseFloat(quantity)
    if (Number.isNaN(parsedQty) || parsedQty < 0) {
      setError('Quantity must be a non-negative number.')
      return
    }
    if (!isEdit && !selectedMasterProductId && !addNewMode) {
      setError('Please select a master product or choose "Add New".')
      return
    }

    // Get price from the master product if one is selected
    let price: number | null = null
    if (selectedMasterProductId) {
      const mp = masterProducts.find((p) => p.id === selectedMasterProductId)
      price = mp?.price ?? null
    }

    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        quantity: parsedQty,
        unit,
        price,
        kit_group_id: kitGroupId || null,
        supplier_id: isEdit ? null : selectedSupplierId,
        masterProductId: selectedMasterProductId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.')
      setSaving(false)
    }
  }

  const showMasterSearch = !isEdit && !!selectedSupplierId && !addNewMode

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto md:max-h-[85vh] bg-white dark:bg-[#242424] md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {isEdit ? 'Edit Product' : 'Add Single Product'}
              </h2>
              {(isEdit && supplierName) && (
                <p className="text-xs text-gray-500 dark:text-[#a0a0a0] truncate">
                  {supplierName}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="px-5 py-5 space-y-4 overflow-y-auto max-h-[60vh]">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Supplier picker — only shown when adding a new product. */}
              {!isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Supplier *
                  </label>
                  {suppliers.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-[#a0a0a0] italic">
                      Create a supplier first.
                    </p>
                  ) : (
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        setSelectedSupplierId(e.target.value)
                        setKitGroupId('')
                      }}
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                    >
                      <option value="">Select a supplier…</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Master product searchable dropdown — shown when a supplier is selected and not in addNew mode */}
              {showMasterSearch && (
                <div ref={dropdownRef} className="relative">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    {masterSupplierId ? 'Select from Master Catalog' : 'Product Name *'}
                  </label>
                  {masterSupplierId ? (
                    <>
                      <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-[#6b6b6b]" />
                        <input
                          ref={searchRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setDropdownOpen(true)
                            setSelectedMasterProductId(null)
                          }}
                          onFocus={() => setDropdownOpen(true)}
                          placeholder="Search master products…"
                          className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                        />
                      </div>
                      {dropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#2e2e2e] border border-gray-200 dark:border-[#3a3a3a] rounded-lg shadow-lg">
                          {filteredMasterProducts.map((mp) => (
                            <button
                              key={mp.id}
                              type="button"
                              onClick={() => selectMasterProduct(mp)}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors ${
                                selectedMasterProductId === mp.id
                                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium'
                                  : 'text-gray-900 dark:text-white'
                              }`}
                            >
                              <span>{mp.name}</span>
                              {mp.unit && (
                                <span className="text-xs text-gray-400 dark:text-[#6b6b6b] ml-2">
                                  ({mp.unit})
                                </span>
                              )}
                              {mp.price != null && (
                                <span className="text-xs text-gray-400 dark:text-[#6b6b6b] ml-2">
                                  ${mp.price.toFixed(2)}
                                </span>
                              )}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={handleAddNew}
                            className="w-full text-left px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium border-t border-gray-100 dark:border-[#3a3a3a] flex items-center gap-1.5"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add New Product{searchQuery.trim() ? `: "${searchQuery.trim()}"` : ''}
                          </button>
                        </div>
                      )}
                      {selectedMasterProductId && !dropdownOpen && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Linked to master product: {masterProducts.find((m) => m.id === selectedMasterProductId)?.name}
                        </p>
                      )}
                    </>
                  ) : (
                    // Supplier not linked to master — fall back to direct entry with "Add New" behavior
                    <>
                      <p className="text-xs text-gray-400 dark:text-[#6b6b6b] mb-2">
                        This supplier is not linked to the master catalog. Enter product details manually.
                      </p>
                      {/* Auto-switch to addNewMode */}
                      {(() => { if (!addNewMode) setTimeout(() => setAddNewMode(true), 0); return null })()}
                    </>
                  )}
                </div>
              )}

              {/* Add new mode header */}
              {!isEdit && addNewMode && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Creating New Product
                  </span>
                  {masterSupplierId && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddNewMode(false)
                        setName('')
                        setSearchQuery('')
                      }}
                      className="text-xs text-gray-500 dark:text-[#6b6b6b] hover:text-gray-700 dark:hover:text-white transition-colors"
                    >
                      Back to search
                    </button>
                  )}
                </div>
              )}

              {/* Name / quantity / unit — shown when editing or in addNew mode */}
              {(isEdit || addNewMode) && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                      Product Name *
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Polyurea Base A"
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                        Unit *
                      </label>
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                      >
                        {unitTypes.length === 0 ? (
                          <option value="" disabled>No unit types — add them in Settings</option>
                        ) : (
                          unitTypes.map((ut) => (
                            <option key={ut.id} value={ut.abbreviation}>
                              {ut.name} ({ut.abbreviation})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Master product selected — show quantity/unit only (name from master) */}
              {!isEdit && selectedMasterProductId && !addNewMode && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={unit}
                      disabled
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-500 dark:text-[#6b6b6b] bg-gray-50 dark:bg-[#1a1a1a]"
                    />
                  </div>
                </div>
              )}

              {/* Kit Group dropdown — only for editing */}
              {isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Kit Group
                  </label>
                  <select
                    value={kitGroupId}
                    onChange={(e) => setKitGroupId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                  >
                    <option value="">None (standalone product)</option>
                    {currentKitGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {currentKitGroups.length === 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] mt-1">
                      No kit groups yet for this supplier.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-none flex gap-3 justify-end px-5 py-4 border-t border-gray-200 dark:border-[#3a3a3a]">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#3a3a3a] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim() || (!isEdit && suppliers.length === 0) || (!isEdit && !selectedSupplierId)}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
              >
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Single Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
