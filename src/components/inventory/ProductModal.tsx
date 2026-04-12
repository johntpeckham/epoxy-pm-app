'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { InventoryKitGroup, InventoryProduct, InventoryUnit } from '@/types'

export interface ProductFormData {
  name: string
  quantity: number
  unit: InventoryUnit
  kit_group_id: string | null
}

interface Props {
  product: InventoryProduct | null
  supplierName: string
  /** Kit groups belonging to the current supplier — used to populate the dropdown. */
  kitGroups: InventoryKitGroup[]
  onClose: () => void
  onSave: (data: ProductFormData) => Promise<void> | void
}

export default function ProductModal({
  product,
  supplierName,
  kitGroups,
  onClose,
  onSave,
}: Props) {
  const isEdit = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [quantity, setQuantity] = useState<string>(
    product?.quantity !== undefined && product?.quantity !== null
      ? String(product.quantity)
      : '0'
  )
  const [unit, setUnit] = useState<InventoryUnit>(
    (product?.unit as InventoryUnit) ?? 'gallons'
  )
  const [kitGroupId, setKitGroupId] = useState<string>(product?.kit_group_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
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
    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        quantity: parsedQty,
        unit,
        kit_group_id: kitGroupId || null,
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
              {supplierName && (
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
                    onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                  >
                    <option value="gallons">Gallons</option>
                    <option value="parts">Parts</option>
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
                    {kitGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {kitGroups.length === 0 && (
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
                disabled={saving || !name.trim()}
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
