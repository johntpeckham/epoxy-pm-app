'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { XIcon, PlusIcon, SearchIcon, CheckIcon } from 'lucide-react'

interface SearchableDropdownProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  onAddNew?: (name: string) => Promise<string | null> // returns error string or null on success
}

export default function SearchableDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  onAddNew,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const newInputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  useEffect(() => {
    if (open) {
      updatePosition()
      // Focus search input when dropdown opens
      setTimeout(() => searchInputRef.current?.focus(), 0)
    } else {
      setSearch('')
      setAddingNew(false)
      setNewName('')
      setAddError('')
    }
  }, [open, updatePosition])

  // Update position on scroll/resize
  useEffect(() => {
    if (!open) return
    const handleUpdate = () => updatePosition()
    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)
    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [open, updatePosition])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  const handleAddNew = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setAddError('')
    if (onAddNew) {
      const err = await onAddNew(newName.trim())
      if (err) {
        setAddError(err)
        setSaving(false)
        return
      }
    }
    onChange(newName.trim())
    setSaving(false)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className={`w-full border rounded-lg px-2.5 py-1.5 text-sm text-left flex items-center gap-1 transition ${
          disabled
            ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
            : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500'
        }`}
      >
        <span className={`flex-1 truncate ${!value ? 'text-gray-400' : ''}`}>
          {value || placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            onClick={handleClear}
            className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <XIcon className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Dropdown via portal */}
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100">
            <SearchIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
            />
          </div>

          {/* Options list */}
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
            )}
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleSelect(option)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition flex items-center gap-2 ${
                  option === value ? 'text-amber-600 font-medium' : 'text-gray-700'
                }`}
              >
                {option === value && <CheckIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                <span className={option === value ? '' : 'pl-[22px]'}>{option}</span>
              </button>
            ))}
          </div>

          {/* Add new */}
          {onAddNew && (
            <div className="border-t border-gray-100">
              {addingNew ? (
                <div className="px-3 py-2">
                  <div className="flex gap-2">
                    <input
                      ref={newInputRef}
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="New name..."
                      className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddNew() }
                        if (e.key === 'Escape') { e.stopPropagation(); setAddingNew(false); setAddError('') }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddNew}
                      disabled={!newName.trim() || saving}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-medium rounded transition"
                    >
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                  {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingNew(true); setNewName(search); setAddError('') }}
                  className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition flex items-center gap-2 font-medium"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add New
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
