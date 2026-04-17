'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MasterSupplier } from '@/types'

const SUPPLIER_COLORS = [
  { key: 'amber', label: 'Amber', swatch: '#b45309' },
  { key: 'blue', label: 'Blue', swatch: '#2563a8' },
  { key: 'teal', label: 'Teal', swatch: '#1d6b4f' },
  { key: 'purple', label: 'Purple', swatch: '#7c3aed' },
  { key: 'coral', label: 'Coral', swatch: '#d85a30' },
  { key: 'pink', label: 'Pink', swatch: '#d4537e' },
  { key: 'green', label: 'Green', swatch: '#4a9e22' },
  { key: 'red', label: 'Red', swatch: '#c53030' },
  { key: 'gray', label: 'Gray', swatch: '#666666' },
  { key: 'navy', label: 'Navy', swatch: '#2d3a8c' },
  { key: 'olive', label: 'Olive', swatch: '#6b7c4a' },
  { key: 'cyan', label: 'Cyan', swatch: '#0891b2' },
] as const

interface Props {
  supplier: MasterSupplier | null
  onClose: () => void
  onSave: (name: string, color: string) => Promise<void> | void
}

export default function SupplierModal({ supplier, onClose, onSave }: Props) {
  const isEdit = !!supplier
  const [name, setName] = useState(supplier?.name ?? '')
  const [color, setColor] = useState(supplier?.color ?? 'amber')
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
      setError('Supplier name is required.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave(trimmed, color)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier.')
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
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
                  Supplier Name *
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Versaflex"
                  className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {SUPPLIER_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setColor(c.key)}
                      title={c.label}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        color === c.key
                          ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#242424] ring-white/80 dark:ring-white/60 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.swatch }}
                    />
                  ))}
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
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Supplier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
