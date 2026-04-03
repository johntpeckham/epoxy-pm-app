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
  ChevronUpIcon,
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
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(item.name)
  const nameRef = useRef<HTMLInputElement>(null)

  const isOverdue = item.due_date && !item.is_complete && item.due_date < today
  const hasAssignee = !!item.assigned_to
  const hasDueDate = !!item.due_date
  const hasNotes = !!item.notes
  const hasAnyMetadata = hasAssignee || hasDueDate || hasNotes

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
          {/* Top row: Name + inline metadata pills + action buttons */}
          <div className="flex items-center gap-1.5">
            {/* Name */}
            <div className="flex-1 min-w-0">
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
            </div>

            {/* Save indicator */}
            {isSaving && <span className="text-[10px] text-gray-400 animate-pulse flex-shrink-0">Saving...</span>}
            {isSaved && <span className="text-[10px] text-green-500 flex-shrink-0">Saved</span>}

            {/* Expand/collapse toggle (only in edit mode) */}
            {!readOnly && (
              <button
                onClick={() => setExpanded(!expanded)}
                className={`flex-shrink-0 p-0.5 rounded transition ${
                  expanded
                    ? 'text-amber-500 hover:text-amber-600 bg-amber-50'
                    : hasAnyMetadata
                      ? 'text-amber-400 hover:text-amber-500'
                      : 'text-gray-300 hover:text-gray-500'
                }`}
                title={expanded ? 'Collapse details' : 'Add details'}
              >
                {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Compact metadata pills — shown when collapsed and has values */}
          {!expanded && hasAnyMetadata && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {hasAssignee && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  <UserIcon className="w-2.5 h-2.5" />
                  {profileMap.get(item.assigned_to!)?.display_name || 'Unknown'}
                </span>
              )}
              {hasDueDate && (
                <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 ${
                  isOverdue ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-100'
                }`}>
                  <CalendarIcon className="w-2.5 h-2.5" />
                  {item.due_date}
                  {isOverdue && (
                    <AlertCircleIcon className="w-2.5 h-2.5 text-red-500" />
                  )}
                </span>
              )}
              {hasNotes && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                  <StickyNoteIcon className="w-2.5 h-2.5" />
                  Note
                </span>
              )}
            </div>
          )}

          {/* Read-only metadata display */}
          {readOnly && hasAnyMetadata && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {hasAssignee && (
                <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  <UserIcon className="w-2.5 h-2.5" />
                  {profileMap.get(item.assigned_to!)?.display_name || 'Unknown'}
                </span>
              )}
              {hasDueDate && (
                <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 ${
                  isOverdue ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-100'
                }`}>
                  <CalendarIcon className="w-2.5 h-2.5" />
                  {item.due_date}
                  {isOverdue && (
                    <AlertCircleIcon className="w-2.5 h-2.5 text-red-500" />
                  )}
                </span>
              )}
              {hasNotes && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                  <StickyNoteIcon className="w-2.5 h-2.5" />
                  Note
                </span>
              )}
              {hasNotes && (
                <p className="w-full mt-1 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">{item.notes}</p>
              )}
            </div>
          )}

          {/* Expanded editable fields */}
          {expanded && !readOnly && (
            <div className="mt-2 space-y-2 bg-gray-50 rounded-lg p-2.5">
              {/* Assignee */}
              <div className="flex items-center gap-2">
                <UserIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <select
                  value={item.assigned_to ?? ''}
                  onChange={(e) => onUpdateField('assigned_to', e.target.value || null)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white flex-1"
                >
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
                  ))}
                </select>
              </div>

              {/* Due date */}
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <input
                  type="date"
                  value={item.due_date ?? ''}
                  onChange={(e) => onUpdateField('due_date', e.target.value || null)}
                  className={`text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white flex-1 ${
                    isOverdue ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-600'
                  }`}
                />
                {isOverdue && (
                  <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium flex-shrink-0">
                    <AlertCircleIcon className="w-3 h-3" />
                    Overdue
                  </span>
                )}
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StickyNoteIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500">Notes</span>
                </div>
                <textarea
                  value={item.notes ?? ''}
                  onChange={(e) => onUpdateField('notes', e.target.value || null)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
                  placeholder="Add notes..."
                />
              </div>
            </div>
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
