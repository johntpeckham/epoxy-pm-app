'use client'

import { useState, useEffect, useRef } from 'react'
import {
  CheckIcon,
  Trash2Icon,
  AlertCircleIcon,
  PlusIcon,
  UserIcon,
  CalendarIcon,
  StickyNoteIcon,
  XIcon,
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

type EditingField = 'assignee' | 'due_date' | 'notes' | null

/** Format "2026-04-08" → "Due 4/8/26" */
function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `Due ${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`
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
  const [showDropdown, setShowDropdown] = useState(false)
  const [editingField, setEditingField] = useState<EditingField>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(item.name)
  const [editingNoteValue, setEditingNoteValue] = useState(item.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const plusBtnRef = useRef<HTMLButtonElement>(null)

  const isOverdue = item.due_date && !item.is_complete && item.due_date < today
  const hasAssignee = !!item.assigned_to
  const hasDueDate = !!item.due_date
  const hasNotes = !!item.notes

  useEffect(() => {
    setNameValue(item.name)
  }, [item.name])

  useEffect(() => {
    setEditingNoteValue(item.notes ?? '')
  }, [item.notes])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const commitName = () => {
    setEditingName(false)
    if (nameValue.trim() && nameValue.trim() !== item.name) {
      onUpdateField('name', nameValue.trim())
    } else {
      setNameValue(item.name)
    }
  }

  const commitNote = () => {
    setEditingField(null)
    const trimmed = editingNoteValue.trim()
    if (trimmed !== (item.notes ?? '')) {
      onUpdateField('notes', trimmed || null)
    }
  }

  const handleDropdownAction = (action: 'assignee' | 'due_date' | 'notes' | 'remove_assignee' | 'remove_due_date' | 'remove_notes') => {
    setShowDropdown(false)
    if (action === 'remove_assignee') {
      onUpdateField('assigned_to', null)
    } else if (action === 'remove_due_date') {
      onUpdateField('due_date', null)
    } else if (action === 'remove_notes') {
      onUpdateField('notes', null)
      setEditingNoteValue('')
    } else {
      if (action === 'notes') {
        setEditingNoteValue(item.notes ?? '')
      }
      setEditingField(action)
    }
  }

  const assigneeName = hasAssignee ? (profileMap.get(item.assigned_to!)?.display_name || 'Unknown') : null

  return (
    <div className={`px-4 py-2.5 ${item.is_complete ? 'bg-gray-50/50' : ''}`}>
      {/* Row 1: checkbox | name | assignee | date | + | save | trash */}
      <div className="flex items-center gap-2">
        {/* Checkbox */}
        {readOnly ? (
          <div
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
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
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
              item.is_complete
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-amber-400'
            }`}
          >
            {item.is_complete && <CheckIcon className="w-3 h-3" />}
          </button>
        )}

        {/* Name */}
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <span className={`text-sm truncate block ${item.is_complete ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {item.name}
            </span>
          ) : editingName ? (
            <input
              ref={nameRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(item.name); setEditingName(false) } }}
              className="w-full text-sm text-gray-900 border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className={`text-sm text-left truncate w-full block ${item.is_complete ? 'text-gray-400 line-through' : 'text-gray-900'} hover:text-amber-700 transition`}
            >
              {item.name}
            </button>
          )}
        </div>

        {/* Inline assignee (clickable to edit) */}
        {hasAssignee && (
          readOnly ? (
            <span className="flex-shrink-0 text-xs text-gray-400 truncate max-w-[100px]">
              {assigneeName}
            </span>
          ) : (
            <button
              onClick={() => setEditingField(editingField === 'assignee' ? null : 'assignee')}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-amber-600 truncate max-w-[100px] transition"
              title="Change assignee"
            >
              {assigneeName}
            </button>
          )
        )}

        {/* Dot separator when both assignee and date are present */}
        {hasAssignee && hasDueDate && (
          <span className="flex-shrink-0 text-xs text-gray-400">·</span>
        )}

        {/* Inline due date (clickable to edit) */}
        {hasDueDate && (
          readOnly ? (
            <span className={`flex-shrink-0 text-xs truncate ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {isOverdue && <AlertCircleIcon className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
              {formatDueDate(item.due_date!)}
            </span>
          ) : (
            <button
              onClick={() => setEditingField(editingField === 'due_date' ? null : 'due_date')}
              className={`flex-shrink-0 text-xs truncate transition ${isOverdue ? 'text-red-500 font-medium hover:text-red-700' : 'text-gray-400 hover:text-amber-600'}`}
              title="Change due date"
            >
              {isOverdue && <AlertCircleIcon className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
              {formatDueDate(item.due_date!)}
            </button>
          )
        )}

        {/* Save indicator */}
        {isSaving && <span className="text-[10px] text-gray-400 animate-pulse flex-shrink-0">Saving...</span>}
        {isSaved && <span className="text-[10px] text-green-500 flex-shrink-0">Saved</span>}

        {/* + button with dropdown (edit mode only) */}
        {!readOnly && (
          <div className="relative flex-shrink-0">
            <button
              ref={plusBtnRef}
              onClick={() => { setShowDropdown(!showDropdown); setEditingField(null) }}
              className={`p-1 rounded transition ${
                showDropdown
                  ? 'text-amber-500 bg-amber-50'
                  : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
              }`}
              title="Add details"
            >
              <PlusIcon className="w-4 h-4" />
            </button>

            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1"
              >
                {/* Assignee option */}
                <button
                  onClick={() => handleDropdownAction('assignee')}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-center gap-2.5"
                >
                  <UserIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-700">{hasAssignee ? 'Change Assignee' : 'Add Assignee'}</span>
                </button>
                {hasAssignee && (
                  <button
                    onClick={() => handleDropdownAction('remove_assignee')}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 transition flex items-center gap-2.5"
                  >
                    <XIcon className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-500">Remove Assignee</span>
                  </button>
                )}

                <div className="border-t border-gray-100 my-0.5" />

                {/* Due date option */}
                <button
                  onClick={() => handleDropdownAction('due_date')}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-center gap-2.5"
                >
                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-700">{hasDueDate ? 'Change Due Date' : 'Add Due Date'}</span>
                </button>
                {hasDueDate && (
                  <button
                    onClick={() => handleDropdownAction('remove_due_date')}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 transition flex items-center gap-2.5"
                  >
                    <XIcon className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-500">Remove Due Date</span>
                  </button>
                )}

                <div className="border-t border-gray-100 my-0.5" />

                {/* Note option */}
                <button
                  onClick={() => handleDropdownAction('notes')}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-center gap-2.5"
                >
                  <StickyNoteIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-700">{hasNotes ? 'Edit Note' : 'Add Note'}</span>
                </button>
                {hasNotes && (
                  <button
                    onClick={() => handleDropdownAction('remove_notes')}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 transition flex items-center gap-2.5"
                  >
                    <XIcon className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-500">Remove Note</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Delete */}
        {!readOnly && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-300 hover:text-red-500 transition flex-shrink-0"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Row 2: Notes text (always visible when present, full text) */}
      {hasNotes && editingField !== 'notes' && (
        <div className="ml-7 mt-1">
          {readOnly ? (
            <p className="text-xs text-gray-500 whitespace-pre-wrap">{item.notes}</p>
          ) : (
            <button
              onClick={() => { setEditingNoteValue(item.notes ?? ''); setEditingField('notes') }}
              className="text-xs text-gray-500 hover:text-amber-600 text-left whitespace-pre-wrap transition w-full"
            >
              {item.notes}
            </button>
          )}
        </div>
      )}

      {/* Inline editor: Assignee */}
      {editingField === 'assignee' && !readOnly && (
        <div className="ml-7 mt-2 flex items-center gap-2">
          <UserIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <select
            value={item.assigned_to ?? ''}
            onChange={(e) => {
              onUpdateField('assigned_to', e.target.value || null)
              setEditingField(null)
            }}
            className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white flex-1"
            autoFocus
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
            ))}
          </select>
          <button
            onClick={() => setEditingField(null)}
            className="p-1 text-gray-400 hover:text-gray-600 transition"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline editor: Due date */}
      {editingField === 'due_date' && !readOnly && (
        <div className="ml-7 mt-2 flex items-center gap-2">
          <CalendarIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={item.due_date ?? ''}
            onChange={(e) => {
              onUpdateField('due_date', e.target.value || null)
              setEditingField(null)
            }}
            className={`text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white flex-1 ${
              isOverdue ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-600'
            }`}
            autoFocus
          />
          <button
            onClick={() => setEditingField(null)}
            className="p-1 text-gray-400 hover:text-gray-600 transition"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline editor: Notes */}
      {editingField === 'notes' && !readOnly && (
        <div className="ml-7 mt-2">
          <textarea
            value={editingNoteValue}
            onChange={(e) => {
              setEditingNoteValue(e.target.value)
              onUpdateField('notes', e.target.value || null)
            }}
            onBlur={commitNote}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEditingNoteValue(item.notes ?? ''); setEditingField(null) } }}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
            placeholder="Add notes..."
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
