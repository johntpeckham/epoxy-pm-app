'use client'

import { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MasterKitGroup, UnitType } from '@/types'

export interface MasterKitGroupFormData {
  name: string
  // Material Systems Wave 1 defaults — same shape as MasterAddKitFormData's
  // kit-level defaults so the kit's quantity rule can be edited after
  // creation, not just at create time.
  default_quantity_mode: 'coverage' | 'fixed' | null
  default_coverage_amount: number | null
  default_coverage_basis: number | null
  default_fixed_quantity: number | null
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

  // ── Default quantity rule (Material Systems Wave 1 follow-up) ─────────────
  // Hydrated from the kit group's stored default_* fields so reopening the
  // modal shows the persisted values. NULL on the row → mode 'none' here.
  type DefaultMode = 'none' | 'coverage' | 'fixed'
  const [defaultMode, setDefaultMode] = useState<DefaultMode>(
    kitGroup?.default_quantity_mode === 'coverage' ? 'coverage'
      : kitGroup?.default_quantity_mode === 'fixed' ? 'fixed'
      : 'none'
  )
  const [defaultCoverageAmount, setDefaultCoverageAmount] = useState<string>(
    kitGroup?.default_coverage_amount != null ? String(kitGroup.default_coverage_amount) : ''
  )
  const [defaultCoverageBasis, setDefaultCoverageBasis] = useState<string>(
    kitGroup?.default_coverage_basis != null ? String(kitGroup.default_coverage_basis) : ''
  )
  const [defaultFixedQuantity, setDefaultFixedQuantity] = useState<string>(
    kitGroup?.default_fixed_quantity != null ? String(kitGroup.default_fixed_quantity) : ''
  )
  const [defaultUnit, setDefaultUnit] = useState<string>(
    kitGroup?.default_unit ?? (unitTypes.length > 0 ? unitTypes[0].abbreviation : 'gal')
  )

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

    // ── Default quantity rule validation + serialization ────────────────────
    let defaultMode_db: 'coverage' | 'fixed' | null = null
    let defaultCoverageAmount_db: number | null = null
    let defaultCoverageBasis_db: number | null = null
    let defaultFixedQuantity_db: number | null = null
    let defaultUnit_db: string | null = null
    if (defaultMode === 'coverage') {
      const a = parseFloat(defaultCoverageAmount)
      const b = parseFloat(defaultCoverageBasis)
      if (defaultCoverageAmount.trim() === '' || Number.isNaN(a) || a <= 0) {
        setError('Default coverage amount must be a positive number.')
        return
      }
      if (defaultCoverageBasis.trim() === '' || Number.isNaN(b) || b <= 0) {
        setError('Default coverage basis must be a positive number.')
        return
      }
      defaultMode_db = 'coverage'
      defaultCoverageAmount_db = a
      defaultCoverageBasis_db = b
      defaultUnit_db = defaultUnit
    } else if (defaultMode === 'fixed') {
      const q = parseFloat(defaultFixedQuantity)
      if (defaultFixedQuantity.trim() === '' || Number.isNaN(q) || q <= 0) {
        setError('Default fixed quantity must be a positive number.')
        return
      }
      defaultMode_db = 'fixed'
      defaultFixedQuantity_db = q
      defaultUnit_db = defaultUnit
    }

    setError(null)
    setSaving(true)
    try {
      await onSave({
        name: trimmed,
        default_quantity_mode: defaultMode_db,
        default_coverage_amount: defaultCoverageAmount_db,
        default_coverage_basis: defaultCoverageBasis_db,
        default_fixed_quantity: defaultFixedQuantity_db,
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

              {/* Default quantity rule for the KIT as a whole. Mirrors the
                  Wave 1 section in MasterAddKitModal so kit defaults can be
                  edited after creation, not only at create time. */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1">
                  Default quantity rule
                </label>
                <select
                  value={defaultMode}
                  onChange={(e) => setDefaultMode(e.target.value as 'none' | 'coverage' | 'fixed')}
                  className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                >
                  <option value="none">None (no default)</option>
                  <option value="coverage">Coverage rate</option>
                  <option value="fixed">Fixed quantity</option>
                </select>
                {defaultMode === 'coverage' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={defaultCoverageAmount}
                      onChange={(e) => setDefaultCoverageAmount(e.target.value)}
                      placeholder="1"
                      className="w-20 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      aria-label="Default coverage amount"
                    />
                    <span className="text-xs text-gray-500 dark:text-[#a0a0a0]">per</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={defaultCoverageBasis}
                      onChange={(e) => setDefaultCoverageBasis(e.target.value)}
                      placeholder="250"
                      className="w-24 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      aria-label="Default coverage basis"
                    />
                    <span className="text-xs text-gray-500 dark:text-[#a0a0a0]">sqft of</span>
                    <select
                      value={defaultUnit}
                      onChange={(e) => setDefaultUnit(e.target.value)}
                      className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      aria-label="Default unit"
                    >
                      {unitTypes.length === 0 ? (
                        <option value="" disabled>—</option>
                      ) : (
                        unitTypes.map((ut) => (
                          <option key={ut.id} value={ut.abbreviation}>
                            {ut.abbreviation}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
                {defaultMode === 'fixed' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={defaultFixedQuantity}
                      onChange={(e) => setDefaultFixedQuantity(e.target.value)}
                      placeholder="1"
                      className="w-24 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      aria-label="Default fixed quantity"
                    />
                    <select
                      value={defaultUnit}
                      onChange={(e) => setDefaultUnit(e.target.value)}
                      className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                      aria-label="Default unit"
                    >
                      {unitTypes.length === 0 ? (
                        <option value="" disabled>—</option>
                      ) : (
                        unitTypes.map((ut) => (
                          <option key={ut.id} value={ut.abbreviation}>
                            {ut.abbreviation}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
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
