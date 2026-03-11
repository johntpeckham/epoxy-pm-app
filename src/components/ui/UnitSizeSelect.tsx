'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon } from 'lucide-react'
import { useMaterialSystemUnits } from '@/lib/useMaterialSystemUnits'

interface UnitSizeSelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function UnitSizeSelect({ value, onChange, className }: UnitSizeSelectProps) {
  const { units, addUnit } = useMaterialSystemUnits()
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newUnit, setNewUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingNew(false)
        setNewUnit('')
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleAddNew() {
    if (!newUnit.trim()) return
    setSaving(true)
    const result = await addUnit(newUnit)
    if (result) {
      onChange(result.name)
    }
    setSaving(false)
    setNewUnit('')
    setAddingNew(false)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={className || 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'}
      >
        {value || <span className="text-gray-400">Select unit</span>}
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-full min-w-[140px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          )}
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => { onChange(u.name); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === u.name ? 'text-amber-600 font-medium bg-amber-50' : 'text-gray-700'}`}
            >
              {u.name}
            </button>
          ))}
          {!addingNew ? (
            <button
              onClick={() => setAddingNew(true)}
              className="w-full text-left px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 border-t border-gray-100 transition-colors flex items-center gap-1"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add New
            </button>
          ) : (
            <div className="p-2 border-t border-gray-100">
              <input
                type="text"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="Unit name..."
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew()
                  if (e.key === 'Escape') { setAddingNew(false); setNewUnit('') }
                }}
              />
              <div className="flex justify-end gap-1 mt-1">
                <button
                  onClick={() => { setAddingNew(false); setNewUnit('') }}
                  className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNew}
                  disabled={!newUnit.trim() || saving}
                  className="px-2 py-0.5 text-xs font-medium text-white bg-amber-500 rounded hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
