'use client'

import { useState, useEffect, useRef } from 'react'
import {
  CheckIcon,
  Trash2Icon,
  AlertCircleIcon,
} from 'lucide-react'
import { Profile } from '@/types'

export interface ProjectChecklistItem {
  id: string
  project_id: string
  template_id: string | null
  template_item_id: string | null
  name: string
  is_complete: boolean
  assigned_to: string | null
  due_date: string | null
  notes: string | null
  sort_order: number
  group_name: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistTemplate {
  id: string
  name: string
  description: string | null
}

export interface ChecklistTemplateItem {
  id: string
  template_id: string
  name: string
  sort_order: number
  default_assignee_id: string | null
  default_due_days: number | null
  default_notes: string | null
}

export function ChecklistItemRow({
  item,
  profileMap,
  profiles,
  today,
  isSaving,
  isSaved,
  onToggleComplete,
  onUpdateField,
  onDelete,
  readOnly = false,
}: {
  item: ProjectChecklistItem
  profileMap: Map<string, Profile>
  profiles: Profile[]
  today: string
  isSaving: boolean
  isSaved: boolean
  onToggleComplete: () => void
  onUpdateField: (field: keyof ProjectChecklistItem, value: string | null) => void
  onDelete: () => void
  readOnly?: boolean
}) {
  const [showNotes, setShowNotes] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(item.name)
  const nameRef = useRef<HTMLInputElement>(null)

  const isOverdue = item.due_date && !item.is_complete && item.due_date < today

  useEffect(() => {
    setNameValue(item.name)
  }, [item.name])

  const commitName = () => {
    setEditingName(false)
    if (nameValue.trim() && nameValue.trim() !== item.name) {
      onUpdateField('name', nameValue.trim())
    } else {
      setNameValue(item.name)
    }
  }

  return (
    <div className={`px-4 py-2.5 ${item.is_complete ? 'bg-gray-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        {readOnly ? (
          <div
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
              item.is_complete
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300'
            }`}
          >
            {item.is_complete && <CheckIcon className="w-3 h-3" />}
          </div>
        ) : (
          <button
            onClick={onToggleComplete}
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
              item.is_complete
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-amber-400'
            }`}
          >
            {item.is_complete && <CheckIcon className="w-3 h-3" />}
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name — click to edit (or display-only in readOnly) */}
          {readOnly ? (
            <span className={`text-sm ${item.is_complete ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {item.name}
            </span>
          ) : editingName ? (
            <input
              ref={nameRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(item.name); setEditingName(false) } }}
              className="w-full text-sm text-gray-900 border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className={`text-sm text-left w-full ${item.is_complete ? 'text-gray-400 line-through' : 'text-gray-900'} hover:text-amber-700 transition`}
            >
              {item.name}
            </button>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Assignee */}
            {readOnly ? (
              <span className="text-xs text-gray-600 px-1.5 py-0.5">
                {item.assigned_to ? (profileMap.get(item.assigned_to)?.display_name || 'Unknown') : 'Unassigned'}
              </span>
            ) : (
              <select
                value={item.assigned_to ?? ''}
                onChange={(e) => onUpdateField('assigned_to', e.target.value || null)}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white max-w-[140px]"
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
                ))}
              </select>
            )}

            {/* Due date */}
            {readOnly ? (
              item.due_date ? (
                <span className={`text-xs px-1.5 py-0.5 ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                  {item.due_date}
                </span>
              ) : null
            ) : (
              <input
                type="date"
                value={item.due_date ?? ''}
                onChange={(e) => onUpdateField('due_date', e.target.value || null)}
                className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white ${
                  isOverdue ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-600'
                }`}
              />
            )}

            {isOverdue && (
              <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium">
                <AlertCircleIcon className="w-3 h-3" />
                Overdue
              </span>
            )}

            {/* Notes toggle */}
            {(item.notes || !readOnly) && (
              <button
                onClick={() => setShowNotes(!showNotes)}
                className={`text-xs px-1.5 py-0.5 rounded transition ${
                  item.notes ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.notes ? 'Notes' : '+ Note'}
              </button>
            )}

            {/* Save indicator */}
            {isSaving && <span className="text-xs text-gray-400 animate-pulse">Saving...</span>}
            {isSaved && <span className="text-xs text-green-500">Saved</span>}
          </div>

          {/* Notes area */}
          {showNotes && (
            readOnly ? (
              <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">{item.notes}</p>
            ) : (
              <textarea
                value={item.notes ?? ''}
                onChange={(e) => onUpdateField('notes', e.target.value || null)}
                rows={2}
                className="mt-2 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
                placeholder="Add notes..."
              />
            )
          )}
        </div>

        {/* Delete */}
        {!readOnly && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-300 hover:text-red-500 transition flex-shrink-0 mt-0.5"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
