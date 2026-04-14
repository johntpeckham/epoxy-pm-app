'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MasterKitGroup, MasterProduct, MasterSupplier, UnitType } from '@/types'

export interface MasterProductFormData {
  name: string
  unit: string
  price: number | null
  kit_group_id: string | null
  supplier_id: string | null
}

interface Props {
  product: MasterProduct | null
  supplierName: string
  suppliers: MasterSupplier[]
  kitGroups: MasterKitGroup[]
  kitGroupsBySupplier: Map<string, MasterKitGroup[]>
  unitTypes: UnitType[]
  initialSupplierId: string | null
  onClose: () => void
  onSave: (data: MasterProductFormData) => Promise<void> | void
}

export default function MasterProductModal({
  product,
  supplierName,
  suppliers,
  kitGroups,
  kitGroupsBySupplier,
  unitTypes,
  initialSupplierId,
  onClose,
  onSave,
}: Props) {
  const isEdit = !!product
  const autoSupplierId = !isEdit && suppliers.length === 1 ? suppliers[0].id : initialSupplierId
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(autoSupplierId ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState<string>(
    product?.price !== undefined && product?.price !== null
      ? String(product.price)
      : ''
  )
  const [unit, setUnit] = useState<string>(
    product?.unit ?? (unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal')
  )
  const [kitGroupId, setKitGroupId] = useState<string>(product?.kit_group_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // --- Searchable supplier dropdown state ---
  const [supplierQuery, setSupplierQuery] = useState<string>(() => {
    if (autoSupplierId) {
      const match = suppliers.find((s) => s.id === autoSupplierId)
      return match?.name ?? ''
    }
    return ''
  })
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const supplierInputRef = useRef<HTMLInputElement>(null)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierQuery.toLowerCase())
  )

  // Close supplier dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        supplierDropdownRef.current &&
        !supplierDropdownRef.current.contains(e.target as Node) &&
        supplierInputRef.current &&
        !supplierInputRef.current.contains(e.target as Node)
      ) {
        setSupplierDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // When the supplier changes in add mode, reset kit group since kits are per-supplier.
  const currentKitGroups = isEdit
    ? kitGroups
    : (kitGroupsBySupplier.get(selectedSupplierId) ?? [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSelectSupplier(supplier: MasterSupplier) {
    setSelectedSupplierId(supplier.id)
    setSupplierQuery(supplier.name)
    setSupplierDropdownOpen(false)
    setKitGroupId('')
  }

  function handleClearSupplier() {
    setSelectedSupplierId('')
    setSupplierQuery('')
    setKitGroupId('')
    supplierInputRef.current?.focus()
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
    let parsedPrice: number | null = null
    if (price.trim() !== '') {
      parsedPrice = parseFloat(price)
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        setError('Price must be a non-negative number.')
        return
      }
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        unit,
        price: parsedPrice,
        kit_group_id: kitGroupId || null,
        supplier_id: isEdit ? null : selectedSupplierId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.')
      setSaving(false)
    }
  }

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
            <div className="px-5 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Searchable supplier picker — only shown when adding a new product (not editing). */}
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
                    <div className="relative">
                      <div className="relative">
                        <input
                          ref={supplierInputRef}
                          type="text"
                          value={supplierQuery}
                          onChange={(e) => {
                            setSupplierQuery(e.target.value)
                            setSupplierDropdownOpen(true)
                            // If the user edits the text, clear the selection
                            if (selectedSupplierId) {
                              const match = suppliers.find((s) => s.id === selectedSupplierId)
                              if (match && e.target.value !== match.name) {
                                setSelectedSupplierId('')
                                setKitGroupId('')
                              }
                            }
                          }}
                          onFocus={() => setSupplierDropdownOpen(true)}
                          placeholder="Search suppliers…"
                          className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 pr-8 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                        />
                        {selectedSupplierId && (
                          <button
                            type="button"
                            onClick={handleClearSupplier}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white rounded transition-colors"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {supplierDropdownOpen && filteredSuppliers.length > 0 && (
                        <div
                          ref={supplierDropdownRef}
                          className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg shadow-lg"
                        >
                          {filteredSuppliers.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSelectSupplier(s)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                s.id === selectedSupplierId
                                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                  : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#3a3a3a]'
                              }`}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {supplierDropdownOpen && filteredSuppliers.length === 0 && supplierQuery.trim() !== '' && (
                        <div
                          ref={supplierDropdownRef}
                          className="absolute z-10 mt-1 w-full bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg shadow-lg px-3 py-2 text-sm text-gray-500 dark:text-[#6b6b6b]"
                        >
                          No suppliers match &ldquo;{supplierQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                    Price
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
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

              {/* Kit Group dropdown is only available when editing an
                  existing product. The add flow creates standalone products
                  only — kit creation has its own dedicated "Add Kit" modal
                  that handles kit + sub-items in one step. */}
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
