'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardCheckIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { Project, Profile } from '@/types'
import WorkspaceShell from '../WorkspaceShell'

interface ChecklistWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

interface ProjectChecklistItem {
  id: string
  project_id: string
  template_id: string | null
  template_item_id: string | null
  name: string
  is_completed: boolean
  assigned_to: string | null
  due_date: string | null
  notes: string | null
  sort_order: number
  group_name: string | null
  created_at: string
  updated_at: string
}

interface ChecklistTemplate {
  id: string
  name: string
  description: string | null
}

interface ChecklistTemplateItem {
  id: string
  template_id: string
  name: string
  sort_order: number
  default_assignee_id: string | null
  default_due_days: number | null
  default_notes: string | null
}

export default function ChecklistWorkspace({ project, userId, onBack }: ChecklistWorkspaceProps) {
  const [items, setItems] = useState<ProjectChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const fetchItems = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('project_checklist_items')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true })
    if (error) console.error('[Checklist] Fetch items failed:', error)
    setItems((data as ProjectChecklistItem[]) ?? [])
    setLoading(false)
  }, [project.id])

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('checklist_templates').select('id, name, description').order('name')
    setTemplates((data as ChecklistTemplate[]) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchItems()
    fetchProfiles()
    fetchTemplates()
  }, [fetchItems, fetchProfiles, fetchTemplates])

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  // ── Auto-save with debounce ──────────────────────────────────────
  const debouncedSave = useCallback((item: ProjectChecklistItem, updates: Partial<ProjectChecklistItem>) => {
    const existing = saveTimers.current.get(item.id)
    if (existing) clearTimeout(existing)

    setSavingIds((prev) => new Set(prev).add(item.id))

    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('project_checklist_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', item.id)

      setSavingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })

      if (!error) {
        setSavedIds((prev) => new Set(prev).add(item.id))
        setTimeout(() => setSavedIds((prev) => { const next = new Set(prev); next.delete(item.id); return next }), 1500)
      } else {
        console.error('[Checklist] Save failed:', error)
      }

      saveTimers.current.delete(item.id)
    }, 600)

    saveTimers.current.set(item.id, timer)
  }, [])

  // ── Item mutations ───────────────────────────────────────────────
  const updateItemLocal = (id: string, updates: Partial<ProjectChecklistItem>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))
  }

  const toggleComplete = (item: ProjectChecklistItem) => {
    const newVal = !item.is_completed
    updateItemLocal(item.id, { is_completed: newVal })
    debouncedSave(item, { is_completed: newVal })
  }

  const updateField = (item: ProjectChecklistItem, field: keyof ProjectChecklistItem, value: string | null) => {
    updateItemLocal(item.id, { [field]: value })
    debouncedSave(item, { [field]: value })
  }

  const deleteItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const supabase = createClient()
    await supabase.from('project_checklist_items').delete().eq('id', id)
  }

  // ── Add manual item ──────────────────────────────────────────────
  const addManualItem = async () => {
    if (!newItemName.trim()) return
    setAddingItem(true)
    const maxSort = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0
    const supabase = createClient()
    const { error } = await supabase.from('project_checklist_items').insert({
      project_id: project.id,
      name: newItemName.trim(),
      sort_order: maxSort,
      group_name: 'Custom',
    })
    if (!error) {
      setNewItemName('')
      fetchItems()
    }
    setAddingItem(false)
  }

  // ── Apply template ───────────────────────────────────────────────
  const applyTemplate = async (template: ChecklistTemplate) => {
    setShowTemplateDropdown(false)

    // Check if already applied
    const alreadyApplied = items.some((i) => i.template_id === template.id)
    if (alreadyApplied) {
      if (!window.confirm(`"${template.name}" has already been applied. Apply again?`)) return
    }

    const supabase = createClient()
    const { data: templateItems } = await supabase
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', template.id)
      .order('sort_order', { ascending: true })

    if (!templateItems?.length) return

    const maxSort = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0

    const newItems = (templateItems as ChecklistTemplateItem[]).map((ti, idx) => {
      let dueDate: string | null = null
      if (ti.default_due_days && project.start_date) {
        const d = new Date(project.start_date + 'T00:00:00')
        d.setDate(d.getDate() + ti.default_due_days)
        dueDate = d.toISOString().split('T')[0]
      }
      return {
        project_id: project.id,
        template_id: template.id,
        template_item_id: ti.id,
        name: ti.name,
        sort_order: maxSort + idx,
        group_name: template.name,
        assigned_to: ti.default_assignee_id ?? null,
        due_date: dueDate,
        notes: ti.default_notes ?? null,
      }
    })

    const { error } = await supabase.from('project_checklist_items').insert(newItems)
    if (error) console.error('[Checklist] Apply template failed:', error)
    fetchItems()
  }

  // ── Group items ──────────────────────────────────────────────────
  const grouped = items.reduce<{ group: string; items: ProjectChecklistItem[] }[]>((acc, item) => {
    const group = item.group_name || 'Custom'
    const existing = acc.find((g) => g.group === group)
    if (existing) existing.items.push(item)
    else acc.push({ group, items: [item] })
    return acc
  }, [])

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // ── Completion stats ─────────────────────────────────────────────
  const totalItems = items.length
  const completedItems = items.filter((i) => i.is_completed).length
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  const today = new Date().toISOString().split('T')[0]

  return (
    <WorkspaceShell
      title="Checklist"
      icon={<ClipboardCheckIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <div className="relative">
          <button
            onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Apply Template
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
          {showTemplateDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTemplateDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No templates available. Create one in Settings.</p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 transition"
                    >
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      }
    >
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardCheckIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No checklist items yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">Apply a template or add items manually.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setShowTemplateDropdown(true)}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Apply Template
              </button>
              <span className="text-gray-300">or</span>
              <button
                onClick={() => { setNewItemName(''); setAddingItem(false); document.getElementById('add-item-input')?.focus() }}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Add Item
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-600">{completedItems} of {totalItems} complete</span>
                <span className="text-xs font-medium text-gray-400">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Grouped items */}
            <div className="space-y-4">
              {grouped.map(({ group, items: groupItems }) => {
                const isCollapsed = collapsedGroups.has(group)
                const groupComplete = groupItems.filter((i) => i.is_completed).length
                return (
                  <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition text-left"
                    >
                      <ChevronRightIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                      <FileTextIcon className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide flex-1">{group}</span>
                      <span className="text-xs text-gray-400">{groupComplete}/{groupItems.length}</span>
                    </button>
                    {/* Group items */}
                    {!isCollapsed && (
                      <div className="divide-y divide-gray-100">
                        {groupItems.map((item) => (
                          <ChecklistItemRow
                            key={item.id}
                            item={item}
                            profileMap={profileMap}
                            profiles={profiles}
                            today={today}
                            isSaving={savingIds.has(item.id)}
                            isSaved={savedIds.has(item.id)}
                            onToggleComplete={() => toggleComplete(item)}
                            onUpdateField={(field, value) => updateField(item, field, value)}
                            onDelete={() => deleteItem(item.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Add manual item */}
        <div className="mt-4 flex items-center gap-2">
          <input
            id="add-item-input"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addManualItem() }}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            placeholder="Add a checklist item..."
          />
          <button
            onClick={addManualItem}
            disabled={!newItemName.trim() || addingItem}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>
    </WorkspaceShell>
  )
}

// ── Checklist Item Row ────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  profileMap,
  profiles,
  today,
  isSaving,
  isSaved,
  onToggleComplete,
  onUpdateField,
  onDelete,
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
}) {
  const [showNotes, setShowNotes] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(item.name)
  const nameRef = useRef<HTMLInputElement>(null)

  const isOverdue = item.due_date && !item.is_completed && item.due_date < today

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
    <div className={`px-4 py-2.5 ${item.is_completed ? 'bg-gray-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleComplete}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
            item.is_completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 hover:border-amber-400'
          }`}
        >
          {item.is_completed && <CheckIcon className="w-3 h-3" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name — click to edit */}
          {editingName ? (
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
              className={`text-sm text-left w-full ${item.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'} hover:text-amber-700 transition`}
            >
              {item.name}
            </button>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Assignee */}
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

            {/* Due date */}
            <input
              type="date"
              value={item.due_date ?? ''}
              onChange={(e) => onUpdateField('due_date', e.target.value || null)}
              className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white ${
                isOverdue ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-600'
              }`}
            />

            {isOverdue && (
              <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium">
                <AlertCircleIcon className="w-3 h-3" />
                Overdue
              </span>
            )}

            {/* Notes toggle */}
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`text-xs px-1.5 py-0.5 rounded transition ${
                item.notes ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.notes ? 'Notes' : '+ Note'}
            </button>

            {/* Save indicator */}
            {isSaving && <span className="text-xs text-gray-400 animate-pulse">Saving...</span>}
            {isSaved && <span className="text-xs text-green-500">Saved</span>}
          </div>

          {/* Notes area */}
          {showNotes && (
            <textarea
              value={item.notes ?? ''}
              onChange={(e) => onUpdateField('notes', e.target.value || null)}
              rows={2}
              className="mt-2 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none bg-white"
              placeholder="Add notes..."
            />
          )}
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1 text-gray-300 hover:text-red-500 transition flex-shrink-0 mt-0.5"
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
