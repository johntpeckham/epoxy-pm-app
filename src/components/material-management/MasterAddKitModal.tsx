'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MasterSupplier, UnitType } from '@/types'

export interface MasterAddKitSubItemFormData {
  name: string
  unit: string
}

export interface MasterAddKitFormData {
  name: string
  products: MasterAddKitSubItemFormData[]
  supplier_id: string | null
}

interface Props {
  suppliers: MasterSupplier[]
  unitTypes: UnitType[]
  initialSupplierId: string | null
  onClose: () => void
  onSave: (data: MasterAddKitFormData) => Promise<void> | void
}

interface RowState {
  localId: string
  name: string
  unit: string
}

let rowCounter = 0
function createEmptyRow(defaultUnit: string = 'gal'): RowState {
  rowCounter += 1
  return {
    localId: `master-row-${rowCounter}`,
    name: '',
    unit: defaultUnit,
  }
}

export default function MasterAddKitModal({ suppliers, unitTypes, initialSupplierId, onClose, onSave }: Props) {
  const defaultUnit = unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal'
  const autoSupplierId = suppliers.length === 1 ? suppliers[0].id : initialSupplierId
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(autoSupplierId ?? '')
  const [kitName, setKitName] = useState('')
  const [rows, setRows] = useState<RowState[]>(() => [createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Searchable supplier dropdown state
  const [supplierQuery, setSupplierQuery] = useState<string>(() => {
    if (autoSupplierId) {
      const found = suppliers.find((s) => s.id === autoSupplierId)
      return found ? found.name : ''
    }
    return ''
  })
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const supplierInputRef = useRef<HTMLInputElement>(null)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierQuery.toLowerCase())
  )

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

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
        // If the current query doesn't match the selected supplier, reset it
        if (selectedSupplierId) {
          const selected = suppliers.find((s) => s.id === selectedSupplierId)
          if (selected) setSupplierQuery(selected.name)
        } else {
          setSupplierQuery('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedSupplierId, suppliers])

  function selectSupplier(supplier: MasterSupplier) {
    setSelectedSupplierId(supplier.id)
    setSupplierQuery(supplier.name)
    setSupplierDropdownOpen(false)
  }

  function clearSupplier() {
    setSelectedSupplierId('')
    setSupplierQuery('')
    setSupplierDropdownOpen(false)
    supplierInputRef.current?.focus()
  }

  function updateRow(localId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(defaultUnit)])
  }

  function removeRow(localId: string) {
    setRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((r) => r.localId !== localId)
    })
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selectedSupplierId) {
      setError('Please select a supplier.')
      return
    }
    const trimmedKitName = kitName.trim()
    if (!trimmedKitName) {
      setError('Kit name is required.')
      return
    }
    // Drop rows without a name so users can leave trailing blanks harmlessly.
    const nonEmptyRows = rows.filter((r) => r.name.trim() !== '')
    if (nonEmptyRows.length === 0) {
      setError('Add at least one product to the kit.')
      return
    }
    const products: MasterAddKitSubItemFormData[] = nonEmptyRows.map((r) => ({
      name: r.name.trim(),
      unit: r.unit,
    }))
    setError(null)
    setSaving(true)
    try {
      await onSave({ name: trimmedKitName, products, supplier_id: selectedSupplierId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save kit.')
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-auto md:max-h-[85vh] bg-white dark:bg-[#242424] md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Kit</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Searchable supplier dropdown */}
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
                          // Clear selection if the user edits the text
                          if (selectedSupplierId) {
                            const selected = suppliers.find((s) => s.id === selectedSupplierId)
                            if (selected && e.target.value !== selected.name) {
                              setSelectedSupplierId('')
                            }
                          }
                        }}
                        onFocus={() => setSupplierDropdownOpen(true)}
                        placeholder="Search suppliers…"
                        className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 pr-8 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      />
                      {selectedSupplierId && (
                        <button
                          type="button"
                          onClick={clearSupplier}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white transition-colors"
                          aria-label="Clear supplier"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {supplierDropdownOpen && (
                      <div
                        ref={supplierDropdownRef}
                        className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg shadow-lg"
                      >
                        {filteredSuppliers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-[#6b6b6b] italic">
                            No matching suppliers
                          </div>
                        ) : (
                          filteredSuppliers.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => selectSupplier(s)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                s.id === selectedSupplierId
                                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                  : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#3a3a3a]'
                              }`}
                            >
                              {s.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                  Kit Name *
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={kitName}
                  onChange={(e) => setKitName(e.target.value)}
                  placeholder="e.g. Epoxy Kit"
                  className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-2">
                  Products *
                </label>
                <div className="space-y-2">
                  {rows.map((row, idx) => (
                    <div key={row.localId} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.localId, { name: e.target.value })}
                        placeholder={`Product ${idx + 1} name`}
                        className="flex-1 min-w-0 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      />
                      <select
                        value={row.unit}
                        onChange={(e) =>
                          updateRow(row.localId, { unit: e.target.value })
                        }
                        aria-label="Unit"
                        className="w-24 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      >
                        {unitTypes.length === 0 ? (
                          <option value="" disabled>No units</option>
                        ) : (
                          unitTypes.map((ut) => (
                            <option key={ut.id} value={ut.abbreviation}>
                              {ut.abbreviation}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        disabled={rows.length <= 1}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        title={
                          rows.length <= 1
                            ? 'At least one product is required'
                            : 'Remove product'
                        }
                        aria-label="Remove product"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Product
                </button>
              </div>
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
                disabled={saving || !kitName.trim() || suppliers.length === 0 || !selectedSupplierId}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
              >
                {saving ? 'Saving…' : 'Add Kit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
