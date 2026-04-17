'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { InventoryKitGroup } from '@/types'

export interface KitGroupFormData {
  name: string
  full_kits: number
  full_kit_size: string | null
  partial_kits: number
  partial_kit_size: string | null
}

interface Props {
  kitGroup: InventoryKitGroup | null
  supplierName: string
  onClose: () => void
  onSave: (data: KitGroupFormData) => Promise<void> | void
}

export default function KitGroupModal({ kitGroup, supplierName, onClose, onSave }: Props) {
  const isEdit = !!kitGroup
  const [name, setName] = useState(kitGroup?.name ?? '')
  const [fullKits, setFullKits] = useState<string>(
    kitGroup?.full_kits != null ? String(kitGroup.full_kits) : '0'
  )
  const [fullKitSize, setFullKitSize] = useState(kitGroup?.full_kit_size ?? '')
  const [partialKits, setPartialKits] = useState<string>(
    kitGroup?.partial_kits != null ? String(kitGroup.partial_kits) : '0'
  )
  const [partialKitSize, setPartialKitSize] = useState(kitGroup?.partial_kit_size ?? '')
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
      setError('Group name is required.')
      return
    }
    const parsedFull = parseInt(fullKits, 10)
    const parsedPartial = parseInt(partialKits, 10)
    if (Number.isNaN(parsedFull) || parsedFull < 0) {
      setError('Full kits must be a non-negative whole number.')
      return
    }
    if (Number.isNaN(parsedPartial) || parsedPartial < 0) {
      setError('Partial kits must be a non-negative whole number.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        full_kits: parsedFull,
        full_kit_size: fullKitSize.trim() || null,
        partial_kits: parsedPartial,
        partial_kit_size: partialKitSize.trim() || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save kit group.')
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
                {isEdit ? 'Edit Kit Group' : 'Add Kit Group'}
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
                  Group Name *
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Polyurea Base Coat Kit"
                  className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Full Kits
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={fullKits}
                    onChange={(e) => setFullKits(e.target.value)}
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Full Kit Size
                  </label>
                  <input
                    type="text"
                    value={fullKitSize}
                    onChange={(e) => setFullKitSize(e.target.value)}
                    placeholder="e.g. 5 gal"
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Partial Kits
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={partialKits}
                    onChange={(e) => setPartialKits(e.target.value)}
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                    Partial Kit Size
                  </label>
                  <input
                    type="text"
                    value={partialKitSize}
                    onChange={(e) => setPartialKitSize(e.target.value)}
                    placeholder="e.g. 5 gal"
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                  />
                </div>
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
                disabled={saving || !name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
              >
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Kit Group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
