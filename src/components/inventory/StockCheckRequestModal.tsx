'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon, ClipboardListIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

export interface StockCheckProfileOption {
  id: string
  display_name: string | null
}

interface Props {
  productName: string
  supplierName: string
  profiles: StockCheckProfileOption[]
  onClose: () => void
  onSubmit: (assignedToId: string) => Promise<void> | void
}

export default function StockCheckRequestModal({
  productName,
  supplierName,
  profiles,
  onClose,
  onSubmit,
}: Props) {
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    selectRef.current?.focus()
  }, [])

  const sortedProfiles = [...profiles].sort((a, b) =>
    (a.display_name ?? '').localeCompare(b.display_name ?? '')
  )

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!assignedTo) {
      setError('Please choose someone to assign the stock check to.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSubmit(assignedTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request.')
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
            <div className="min-w-0 flex items-center gap-2">
              <ClipboardListIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  Request Stock Check
                </h2>
                <p className="text-xs text-gray-500 dark:text-[#a0a0a0] truncate">
                  {productName}
                  {supplierName ? ` — ${supplierName}` : ''}
                </p>
              </div>
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
                  Assign to *
                </label>
                <select
                  ref={selectRef}
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                >
                  <option value="">Select a user…</option>
                  {sortedProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || 'Unnamed user'}
                    </option>
                  ))}
                </select>
                {profiles.length === 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] mt-1">
                    No users available.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-[#a0a0a0] leading-relaxed">
                A task titled{' '}
                <span className="font-medium text-gray-700 dark:text-[#d0d0d0]">
                  &ldquo;Stock Check: {productName}
                  {supplierName ? ` (${supplierName})` : ''}&rdquo;
                </span>{' '}
                will be created and assigned to the selected user. When they mark
                it complete, the Stock Check Date on this product will
                automatically update.
              </p>
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
                disabled={saving || !assignedTo}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
              >
                {saving ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
