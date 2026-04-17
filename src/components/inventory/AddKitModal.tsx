'use client'

import { useEffect, useRef, useState } from 'react'
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type {
  InventoryUnit,
  MaterialSupplier,
  MasterKitGroup,
  MasterProduct,
  UnitType,
} from '@/types'

export interface AddKitSubItemFormData {
  name: string
  quantity: number
  unit: InventoryUnit
}

export interface AddKitFormData {
  name: string
  products: AddKitSubItemFormData[]
  supplier_id: string | null
  masterKitGroupId: string | null
}

interface Props {
  supplierName: string
  suppliers: MaterialSupplier[]
  unitTypes: UnitType[]
  masterKitGroups: MasterKitGroup[]
  masterProducts: MasterProduct[]
  initialSupplierId: string | null
  onClose: () => void
  onSave: (data: AddKitFormData) => Promise<void> | void
}

interface RowState {
  localId: string
  name: string
  quantity: string
  unit: InventoryUnit
}

let rowCounter = 0
function createEmptyRow(defaultUnit: InventoryUnit = 'gal'): RowState {
  rowCounter += 1
  return {
    localId: `row-${rowCounter}`,
    name: '',
    quantity: '0',
    unit: defaultUnit,
  }
}

export default function AddKitModal({
  supplierName,
  suppliers,
  unitTypes,
  masterKitGroups,
  masterProducts,
  initialSupplierId,
  onClose,
  onSave,
}: Props) {
  const defaultUnit = unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal'
  const autoSupplierId = suppliers.length === 1 ? suppliers[0].id : initialSupplierId
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(autoSupplierId ?? '')
  const [kitName, setKitName] = useState('')
  const [rows, setRows] = useState<RowState[]>(() => [createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Master kit group selection
  const [selectedMasterKitId, setSelectedMasterKitId] = useState<string | null>(null)
  const [addNewMode, setAddNewMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find the master_supplier_id for the currently selected inventory supplier
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId)
  const masterSupplierId = selectedSupplier?.master_supplier_id ?? null

  // Filter master kit groups to those belonging to the selected supplier's master supplier
  const availableMasterKitGroups = masterSupplierId
    ? masterKitGroups.filter((mkg) => mkg.supplier_id === masterSupplierId)
    : []

  const filteredMasterKitGroups = availableMasterKitGroups.filter((mkg) =>
    mkg.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

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

  // Reset kit selection when supplier changes
  useEffect(() => {
    setSelectedMasterKitId(null)
    setAddNewMode(false)
    setSearchQuery('')
    setKitName('')
    setRows([createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
  }, [selectedSupplierId, defaultUnit])

  function selectMasterKit(mkg: MasterKitGroup) {
    setSelectedMasterKitId(mkg.id)
    setKitName(mkg.name)
    setSearchQuery(mkg.name)
    setDropdownOpen(false)
    setAddNewMode(false)

    // Pre-populate sub-items from master products belonging to this kit group
    const kitProducts = masterProducts.filter((mp) => mp.kit_group_id === mkg.id)
    if (kitProducts.length > 0) {
      setRows(
        kitProducts.map((mp) => {
          rowCounter += 1
          return {
            localId: `row-${rowCounter}`,
            name: mp.name,
            quantity: '0',
            unit: mp.unit || defaultUnit,
          }
        })
      )
    } else {
      setRows([createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
    }
  }

  function handleAddNew() {
    setSelectedMasterKitId(null)
    setAddNewMode(true)
    setKitName(searchQuery)
    setDropdownOpen(false)
    setRows([createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
    setTimeout(() => nameInputRef.current?.focus(), 0)
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
    if (!selectedMasterKitId && !addNewMode) {
      setError('Please select a master kit group or choose "Add New".')
      return
    }
    const nonEmptyRows = rows.filter((r) => r.name.trim() !== '')
    if (nonEmptyRows.length === 0) {
      setError('Add at least one product to the kit.')
      return
    }
    const products: AddKitSubItemFormData[] = []
    for (const r of nonEmptyRows) {
      const parsed = parseFloat(r.quantity)
      if (Number.isNaN(parsed) || parsed < 0) {
        setError(`Quantity for "${r.name.trim()}" must be a non-negative number.`)
        return
      }
      products.push({
        name: r.name.trim(),
        quantity: parsed,
        unit: r.unit,
      })
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({ name: trimmedKitName, products, supplier_id: selectedSupplierId, masterKitGroupId: selectedMasterKitId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save kit.')
      setSaving(false)
    }
  }

  const showMasterSearch = !!selectedSupplierId && !addNewMode

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
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
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

              {/* Master kit group searchable dropdown */}
              {showMasterSearch && masterSupplierId && (
                <div ref={dropdownRef} className="relative">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Select from Master Catalog
                  </label>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-[#6b6b6b]" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setDropdownOpen(true)
                        setSelectedMasterKitId(null)
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder="Search master kit groups…"
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    />
                  </div>
                  {dropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#2e2e2e] border border-gray-200 dark:border-[#3a3a3a] rounded-lg shadow-lg">
                      {filteredMasterKitGroups.map((mkg) => (
                        <button
                          key={mkg.id}
                          type="button"
                          onClick={() => selectMasterKit(mkg)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors ${
                            selectedMasterKitId === mkg.id
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {mkg.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddNew}
                        className="w-full text-left px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium border-t border-gray-100 dark:border-[#3a3a3a] flex items-center gap-1.5"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add New Kit{searchQuery.trim() ? `: "${searchQuery.trim()}"` : ''}
                      </button>
                    </div>
                  )}
                  {selectedMasterKitId && !dropdownOpen && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Linked to master kit group: {masterKitGroups.find((m) => m.id === selectedMasterKitId)?.name}
                    </p>
                  )}
                </div>
              )}

              {/* Auto-switch to addNewMode if no master supplier link */}
              {showMasterSearch && !masterSupplierId && (() => { if (!addNewMode) setTimeout(() => setAddNewMode(true), 0); return null })()}

              {/* Add new mode header */}
              {addNewMode && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Creating New Kit
                  </span>
                  {masterSupplierId && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddNewMode(false)
                        setKitName('')
                        setSearchQuery('')
                        setRows([createEmptyRow(defaultUnit), createEmptyRow(defaultUnit)])
                      }}
                      className="text-xs text-gray-500 dark:text-[#6b6b6b] hover:text-gray-700 dark:hover:text-white transition-colors"
                    >
                      Back to search
                    </button>
                  )}
                </div>
              )}

              {/* Kit name — shown when master kit is selected, addNewMode, or no master supplier link */}
              {(selectedMasterKitId || addNewMode) && (
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
                    readOnly={!!selectedMasterKitId}
                    className={`w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${
                      selectedMasterKitId ? 'bg-gray-50 dark:bg-[#1a1a1a]' : 'bg-white dark:bg-[#2e2e2e]'
                    }`}
                  />
                </div>
              )}

              {/* Product rows — shown when master kit is selected or in addNew mode */}
              {(selectedMasterKitId || addNewMode) && (
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
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.localId, { quantity: e.target.value })}
                          aria-label="Quantity"
                          className="w-16 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
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
