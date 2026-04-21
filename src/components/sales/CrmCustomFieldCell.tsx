'use client'

import { useState, useRef, useEffect } from 'react'

interface CrmCustomFieldCellProps {
  value: string | null
  columnType: 'text' | 'number' | 'date' | 'select'
  selectOptions: string[] | null
  canEdit: boolean
  onSave: (value: string | null) => void
}

export default function CrmCustomFieldCell({
  value,
  columnType,
  selectOptions,
  canEdit,
  onSave,
}: CrmCustomFieldCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  function startEditing(e: React.MouseEvent) {
    if (!canEdit) return
    e.stopPropagation()
    setDraft(value ?? '')
    setEditing(true)
  }

  function save() {
    const trimmed = draft.trim()
    onSave(trimmed || null)
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
    setDraft(value ?? '')
  }

  if (editing) {
    if (columnType === 'select') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            onSave(e.target.value || null)
            setEditing(false)
          }}
          onBlur={() => setEditing(false)}
          onClick={(e) => e.stopPropagation()}
          className="w-full border border-amber-300 rounded px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
        >
          <option value="">—</option>
          {(selectOptions ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={columnType === 'number' ? 'number' : columnType === 'date' ? 'date' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') cancel()
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full border border-amber-300 rounded px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
      />
    )
  }

  return (
    <span
      className={`block truncate ${canEdit ? 'cursor-pointer hover:text-amber-700' : ''} ${value ? 'text-gray-600' : 'text-gray-400'}`}
      onClick={startEditing}
      title={value ?? ''}
    >
      {value || '—'}
    </span>
  )
}
