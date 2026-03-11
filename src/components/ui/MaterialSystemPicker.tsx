'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import type { MaterialSystem } from '@/lib/useMaterialSystems'

export interface MaterialSystemRow {
  id: string
  systemName: string
  quantity: string
  coverageRate: string
  notes: string
}

interface MaterialSystemPickerProps {
  rows: MaterialSystemRow[]
  onChange: (rows: MaterialSystemRow[]) => void
  systems: MaterialSystem[]
  onAddNew: (name: string) => Promise<MaterialSystem | null>
  readOnly?: boolean
}

function genRowId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function MaterialSystemPicker({
  rows,
  onChange,
  systems,
  onAddNew,
  readOnly = false,
}: MaterialSystemPickerProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setShowNewInput(false)
        setNewName('')
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  function selectSystem(system: MaterialSystem) {
    const newRow: MaterialSystemRow = {
      id: genRowId(),
      systemName: system.name,
      quantity: '',
      coverageRate: '',
      notes: '',
    }
    onChange([...rows, newRow])
    setShowDropdown(false)
  }

  async function handleAddNew() {
    if (!newName.trim()) return
    setSaving(true)
    const result = await onAddNew(newName.trim())
    if (result) {
      const newRow: MaterialSystemRow = {
        id: genRowId(),
        systemName: result.name,
        quantity: '',
        coverageRate: '',
        notes: '',
      }
      onChange([...rows, newRow])
    }
    setSaving(false)
    setNewName('')
    setShowNewInput(false)
    setShowDropdown(false)
  }

  function updateRow(rowId: string, updates: Partial<MaterialSystemRow>) {
    onChange(rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)))
  }

  function removeRow(rowId: string) {
    onChange(rows.filter((r) => r.id !== rowId))
  }

  // Filter out systems already added
  const addedNames = new Set(rows.map((r) => r.systemName))
  const availableSystems = systems.filter((s) => !addedNames.has(s.name))

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">{row.systemName}</span>
            {!readOnly && (
              <button
                onClick={() => removeRow(row.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Quantity</label>
              <input
                type="text"
                value={row.quantity}
                onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                readOnly={readOnly}
                placeholder="e.g. 500 sq ft"
                className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Coverage Rate</label>
              <input
                type="text"
                value={row.coverageRate}
                onChange={(e) => updateRow(row.id, { coverageRate: e.target.value })}
                readOnly={readOnly}
                placeholder="e.g. 200 sq ft/gal"
                className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
              <input
                type="text"
                value={row.notes}
                onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                readOnly={readOnly}
                placeholder="Notes..."
                className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
              />
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Material System
          </button>

          {showDropdown && (
            <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
              {availableSystems.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSystem(s)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {s.name}
                </button>
              ))}
              {availableSystems.length === 0 && !showNewInput && (
                <div className="px-3 py-2 text-xs text-gray-400">No systems available</div>
              )}
              {!showNewInput ? (
                <button
                  onClick={() => setShowNewInput(true)}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 border-t border-gray-100 transition-colors flex items-center gap-1"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add New
                </button>
              ) : (
                <div className="p-2 border-t border-gray-100">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="System name..."
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNew()
                      if (e.key === 'Escape') { setShowNewInput(false); setNewName('') }
                    }}
                  />
                  <div className="flex justify-end gap-1.5 mt-1.5">
                    <button
                      onClick={() => { setShowNewInput(false); setNewName('') }}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddNew}
                      disabled={!newName.trim() || saving}
                      className="px-2 py-1 text-xs font-medium text-white bg-amber-500 rounded hover:bg-amber-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
