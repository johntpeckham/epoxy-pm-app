'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MasterKitGroup, UnitType } from '@/types'

export interface MasterKitGroupFormData {
  name: string
  // Material Systems: optional default coverage rate. All three move
  // together — empty = no default; partial states rejected.
  default_coverage_basis: number | null
  default_coverage_basis_unit: 'sqft' | 'lf' | null
  default_unit: string | null
}

interface Props {
  kitGroup: MasterKitGroup | null
  supplierName: string
  unitTypes: UnitType[]
  onClose: () => void
  onSave: (data: MasterKitGroupFormData) => Promise<void> | void
}

export default function MasterKitGroupModal({ kitGroup, supplierName, unitTypes, onClose, onSave }: Props) {
  const isEdit = !!kitGroup
  const [name, setName] = useState(kitGroup?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Default coverage rate (Material Systems) ──────────────────────────────
  // Hydrated from the kit group's stored default_* fields so reopening the
  // modal shows the persisted values.
  const [defaultCoverageBasis, setDefaultCoverageBasis] = useState<string>(
    kitGroup?.default_coverage_basis != null ? String(kitGroup.default_coverage_basis) : ''
  )
  const [defaultCoverageBasisUnit, setDefaultCoverageBasisUnit] = useState<'' | 'sqft' | 'lf'>(
    kitGroup?.default_coverage_basis_unit ?? ''
  )
  const [defaultUnit, setDefaultUnit] = useState<string>(kitGroup?.default_unit ?? '')

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

    // ── Default coverage rate validation + serialization ─────────────────────
    const basisStr = defaultCoverageBasis.trim()
    const basisUnitVal = defaultCoverageBasisUnit
    const unitVal = defaultUnit.trim()
    const anySet = basisStr !== '' || basisUnitVal !== '' || unitVal !== ''
    const allSet = basisStr !== '' && basisUnitVal !== '' && unitVal !== ''
    let defaultCoverageBasis_db: number | null = null
    let defaultCoverageBasisUnit_db: 'sqft' | 'lf' | null = null
    let defaultUnit_db: string | null = null
    if (anySet && !allSet) {
      setError('Default coverage rate needs all three fields filled in (or all left blank).')
      return
    }
    if (allSet) {
      const b = parseFloat(basisStr)
      if (Number.isNaN(b) || b <= 0) {
        setError('Coverage basis must be a positive number.')
        return
      }
      defaultCoverageBasis_db = b
      defaultCoverageBasisUnit_db = basisUnitVal as 'sqft' | 'lf'
      defaultUnit_db = unitVal
    }

    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        default_coverage_basis: defaultCoverageBasis_db,
        default_coverage_basis_unit: defaultCoverageBasisUnit_db,
        default_unit: defaultUnit_db,
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

              {/* Default coverage rate for the KIT as a whole. Mirrors the
                  same simplified shape used by MasterProductModal and
                  MasterAddKitModal. */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                  Default quantity rule
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={defaultCoverageBasis}
                    onChange={(e) => setDefaultCoverageBasis(e.target.value)}
                    placeholder="e.g. 250"
                    className="w-24 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    aria-label="Default coverage basis"
                  />
                  <select
                    value={defaultCoverageBasisUnit}
                    onChange={(e) => setDefaultCoverageBasisUnit(e.target.value as '' | 'sqft' | 'lf')}
                    className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    aria-label="Default coverage basis unit"
                  >
                    <option value="">—</option>
                    <option value="sqft">sqft</option>
                    <option value="lf">lf</option>
                  </select>
                  <span className="text-xs text-gray-500 dark:text-[#a0a0a0]">of</span>
                  <select
                    value={defaultUnit}
                    onChange={(e) => setDefaultUnit(e.target.value)}
                    className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    aria-label="Default unit"
                  >
                    <option value="">—</option>
                    {unitTypes.map((ut) => (
                      <option key={ut.id} value={ut.abbreviation}>
                        {ut.abbreviation}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-[#6b6b6b]">
                  Reads as &ldquo;1 unit covers basis area&rdquo;. Leave all three blank for no default.
                </p>
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
                {saving ? 'Saving\u2026' : isEdit ? 'Save' : 'Add Kit Group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
