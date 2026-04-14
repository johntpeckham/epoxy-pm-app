'use client'

import { useEffect, useRef, useState } from 'react'
import { PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MaterialSupplier, MasterSupplier } from '@/types'

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

export interface SupplierSaveData {
  name: string
  color: string
  masterSupplierId: string | null
}

interface Props {
  supplier: MaterialSupplier | null
  masterSuppliers: MasterSupplier[]
  onClose: () => void
  onSave: (data: SupplierSaveData) => Promise<void> | void
}

export default function SupplierModal({ supplier, masterSuppliers, onClose, onSave }: Props) {
  const isEdit = !!supplier
  const [name, setName] = useState(supplier?.name ?? '')
  const [color, setColor] = useState(supplier?.color ?? 'amber')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Master supplier selection (add mode only)
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [addNewMode, setAddNewMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredMasterSuppliers = masterSuppliers.filter((ms) =>
    ms.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (isEdit) {
      inputRef.current?.focus()
    } else {
      searchRef.current?.focus()
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

  function selectMasterSupplier(ms: MasterSupplier) {
    setSelectedMasterId(ms.id)
    setName(ms.name)
    setColor(ms.color ?? 'amber')
    setSearchQuery(ms.name)
    setDropdownOpen(false)
    setAddNewMode(false)
  }

  function handleAddNew() {
    setSelectedMasterId(null)
    setAddNewMode(true)
    setName(searchQuery)
    setDropdownOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Supplier name is required.')
      return
    }
    if (!isEdit && !selectedMasterId && !addNewMode) {
      setError('Please select a master supplier or choose "Add New".')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({ name: trimmed, color, masterSupplierId: selectedMasterId })
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

              {/* Master supplier searchable dropdown — only shown when adding */}
              {!isEdit && !addNewMode && (
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
                        setSelectedMasterId(null)
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      placeholder="Search master suppliers…"
                      className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                    />
                  </div>
                  {dropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#2e2e2e] border border-gray-200 dark:border-[#3a3a3a] rounded-lg shadow-lg">
                      {filteredMasterSuppliers.map((ms) => (
                        <button
                          key={ms.id}
                          type="button"
                          onClick={() => selectMasterSupplier(ms)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors ${
                            selectedMasterId === ms.id
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {ms.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddNew}
                        className="w-full text-left px-3 py-2 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-medium border-t border-gray-100 dark:border-[#3a3a3a] flex items-center gap-1.5"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        Add New Supplier{searchQuery.trim() ? `: "${searchQuery.trim()}"` : ''}
                      </button>
                    </div>
                  )}
                  {selectedMasterId && !dropdownOpen && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Linked to master supplier: {masterSuppliers.find((m) => m.id === selectedMasterId)?.name}
                    </p>
                  )}
                </div>
              )}

              {/* Add new mode header */}
              {!isEdit && addNewMode && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Creating New Supplier
                  </span>
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
                </div>
              )}

              {/* Name field — shown when editing or in "Add New" mode, or when a master supplier is selected (read-only) */}
              {(isEdit || addNewMode) && (
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
                    className="w-full border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-[#2e2e2e]"
                  />
                </div>
              )}

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
