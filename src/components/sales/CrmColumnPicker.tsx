'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, XIcon, CheckIcon } from 'lucide-react'
import type { CrmColumn } from './crmColumns'

interface CrmColumnPickerProps {
  allColumns: CrmColumn[]
  visibleIds: string[]
  isAdmin: boolean
  onToggle: (columnId: string) => void
  onCustomColumnCreated: (col: {
    name: string
    column_type: 'text' | 'number' | 'date' | 'select'
    select_options: string[] | null
  }) => void
}

export default function CrmColumnPicker({
  allColumns,
  visibleIds,
  isAdmin,
  onToggle,
  onCustomColumnCreated,
}: CrmColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const builtIn = allColumns.filter((c) => c.type === 'built-in')
  const custom = allColumns.filter((c) => c.type === 'custom')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title="Customize columns"
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 max-h-[420px] overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">Show columns</p>
          </div>

          {builtIn.map((col) => {
            const checked = visibleIds.includes(col.id)
            const locked = col.type === 'built-in' && col.alwaysVisible
            return (
              <label
                key={col.id}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${
                  locked ? 'opacity-60 cursor-default' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => !locked && onToggle(col.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                />
                <span className="text-gray-700">{col.label}</span>
              </label>
            )
          })}

          {custom.length > 0 && (
            <>
              <div className="mx-3 my-1 border-t border-gray-100" />
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Custom</p>
              </div>
              {custom.map((col) => {
                const checked = visibleIds.includes(col.id)
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(col.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                )
              })}
            </>
          )}

          {isAdmin && !creating && (
            <>
              <div className="mx-3 my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add new column
              </button>
            </>
          )}

          {isAdmin && creating && (
            <>
              <div className="mx-3 my-1 border-t border-gray-100" />
              <CreateColumnForm
                onCancel={() => setCreating(false)}
                onCreate={(col) => {
                  onCustomColumnCreated(col)
                  setCreating(false)
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CreateColumnForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (col: {
    name: string
    column_type: 'text' | 'number' | 'date' | 'select'
    select_options: string[] | null
  }) => void
}) {
  const [name, setName] = useState('')
  const [colType, setColType] = useState<'text' | 'number' | 'date' | 'select'>('text')
  const [optionInput, setOptionInput] = useState('')
  const [options, setOptions] = useState<string[]>([])

  function addOption() {
    const trimmed = optionInput.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setOptionInput('')
    }
  }

  function removeOption(opt: string) {
    setOptions(options.filter((o) => o !== opt))
  }

  function handleSubmit() {
    if (!name.trim()) return
    if (colType === 'select' && options.length === 0) return
    onCreate({
      name: name.trim(),
      column_type: colType,
      select_options: colType === 'select' ? options : null,
    })
  }

  return (
    <div className="px-3 py-2 space-y-2.5">
      <p className="text-xs font-medium text-gray-500">New column</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Contract Value"
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
      />
      <select
        value={colType}
        onChange={(e) => setColType(e.target.value as typeof colType)}
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
      >
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="date">Date</option>
        <option value="select">Select</option>
      </select>

      {colType === 'select' && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
              placeholder="Add option..."
              className="flex-1 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            <button
              type="button"
              onClick={addOption}
              disabled={!optionInput.trim()}
              className="px-2 py-1.5 text-xs font-medium text-amber-600 border border-amber-200 rounded-md hover:bg-amber-50 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {options.map((opt) => (
                <span
                  key={opt}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
                >
                  {opt}
                  <button
                    type="button"
                    onClick={() => removeOption(opt)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || (colType === 'select' && options.length === 0)}
          className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md disabled:opacity-50 transition-colors"
        >
          Create
        </button>
      </div>
    </div>
  )
}
