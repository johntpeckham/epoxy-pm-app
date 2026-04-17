'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardCheckIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  Maximize2Icon,
  AlertCircleIcon,
  XIcon,
} from 'lucide-react'
import { Project, Profile } from '@/types'
import {
  ProjectChecklistItem,
  ChecklistTemplate,
  ChecklistTemplateItem,
  ChecklistItemRow,
} from './workspaces/ChecklistShared'
import { moveToTrash } from '@/lib/trashBin'

interface ChecklistDashboardCardProps {
  project: Project
  userId: string
  onExpand: () => void
  isAdmin?: boolean
}

export default function ChecklistDashboardCard({ project, userId, onExpand, isAdmin = false }: ChecklistDashboardCardProps) {
  const [items, setItems] = useState<ProjectChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [showNewDropdown, setShowNewDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const hasInitCollapse = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(null), 5000)
  }

  const fetchItems = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('project_checklist_items')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('[ChecklistCard] Fetch items failed:', error)
      showError('Failed to load checklist items: ' + error.message)
    }
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

  // Set initial collapse state once items are loaded
  useEffect(() => {
    if (hasInitCollapse.current || items.length === 0) return
    hasInitCollapse.current = true
    if (project.status === 'Active') {
      setCollapsedGroups(new Set(['Closeout Checklist']))
    } else {
      // Completed/Closed: collapse everything except Closeout Checklist
      const groupNames = new Set<string>()
      for (const item of items) {
        const g = (!item.group_name || item.group_name === 'Custom') ? 'Additional Checklist Items' : item.group_name
        if (g !== 'Closeout Checklist') groupNames.add(g)
      }
      setCollapsedGroups(groupNames)
    }
  }, [items, project.status])

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
        console.error('[ChecklistCard] Save failed:', error)
        showError('Failed to save changes: ' + error.message)
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
    const newVal = !item.is_complete
    updateItemLocal(item.id, { is_complete: newVal })
    debouncedSave(item, { is_complete: newVal })
  }

  const updateField = (item: ProjectChecklistItem, field: keyof ProjectChecklistItem, value: string | null) => {
    updateItemLocal(item.id, { [field]: value })
    debouncedSave(item, { [field]: value })
  }

  const deleteItem = async (id: string) => {
    const prevItems = items
    setItems((prev) => prev.filter((i) => i.id !== id))
    const supabase = createClient()
    const { data: snapshot } = await supabase.from('project_checklist_items').select('*').eq('id', id).single()
    if (snapshot) {
      const { error } = await moveToTrash(
        supabase,
        'checklist_item',
        id,
        snapshot.name ?? 'Checklist item',
        userId,
        snapshot as Record<string, unknown>,
        project.name,
      )
      if (error) {
        console.error('[ChecklistCard] Delete failed:', error)
        showError('Failed to delete item: ' + error)
        setItems(prevItems)
      }
    }
  }

  // ── Add manual item ──────────────────────────────────────────────
  const addManualItem = async () => {
    const maxSort = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0
    const supabase = createClient()
    const { error } = await supabase.from('project_checklist_items').insert({
      project_id: project.id,
      name: 'New item',
      sort_order: maxSort,
      group_name: 'Additional Checklist Items',
    })
    if (error) {
      console.error('[ChecklistCard] Add item failed:', error)
      showError('Failed to add item: ' + error.message)
    } else {
      fetchItems()
    }
  }

  // ── Apply template ───────────────────────────────────────────────
  const applyTemplate = async (template: ChecklistTemplate) => {
    setShowTemplateDropdown(false)

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
    if (error) {
      console.error('[ChecklistCard] Apply template failed:', error)
      showError('Failed to apply template: ' + error.message)
      return
    }
    fetchItems()
  }

  // ── Group items ──────────────────────────────────────────────────
  const grouped = items.reduce<{ group: string; items: ProjectChecklistItem[] }[]>((acc, item) => {
    const group = (!item.group_name || item.group_name === 'Custom') ? 'Additional Checklist Items' : item.group_name
    const existing = acc.find((g) => g.group === group)
    if (existing) existing.items.push(item)
    else acc.push({ group, items: [item] })
    return acc
  }, [])
  // Status-dependent ordering:
  // Active: Project Checklist → others → Additional → Closeout Checklist (last)
  // Completed/Closed: Closeout Checklist (first) → Project Checklist → others → Additional
  const isActiveProject = project.status === 'Active'
  grouped.sort((a, b) => {
    const order = (g: string) => {
      if (g === 'Closeout Checklist') return isActiveProject ? 4 : -1
      if (g === 'Project Checklist') return 0
      if (g === 'Additional Checklist Items') return 2
      return 1
    }
    return order(a.group) - order(b.group)
  })

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
  const completedItems = items.filter((i) => i.is_complete).length
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500"><ClipboardCheckIcon className="w-5 h-5" /></span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Office Checklist</h3>

        {/* + New dropdown (admin only) */}
        {isAdmin && <div className="relative">
          <button
            onClick={() => { setShowNewDropdown(!showNewDropdown); setShowTemplateDropdown(false) }}
            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-white px-2 py-1 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-3 h-3" />
            New
            <ChevronDownIcon className="w-3 h-3" />
          </button>
          {showNewDropdown && !showTemplateDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNewDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                <button
                  onClick={() => { setShowNewDropdown(false); addManualItem() }}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-center gap-2"
                >
                  <PlusIcon className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-900">Add New Checklist Item</p>
                    <p className="text-[10px] text-gray-400">Add a blank item to edit</p>
                  </div>
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => { setShowNewDropdown(false); setShowTemplateDropdown(true) }}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition flex items-center gap-2"
                >
                  <ClipboardCheckIcon className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-900">Apply Template</p>
                    <p className="text-[10px] text-gray-400">Add items from a template</p>
                  </div>
                </button>
              </div>
            </>
          )}
          {showTemplateDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTemplateDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                {templates.filter((t) => t.name !== 'Project Checklist' && t.name !== 'Closeout Checklist').length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No templates available.</p>
                ) : (
                  templates.filter((t) => t.name !== 'Project Checklist' && t.name !== 'Closeout Checklist').map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 transition"
                    >
                      <p className="text-xs font-medium text-gray-900">{t.name}</p>
                      {t.description && <p className="text-[10px] text-gray-400">{t.description}</p>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>}

        {/* Expand button */}
        <button
          onClick={onExpand}
          className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          title="Open full Office Checklist workspace"
        >
          <Maximize2Icon className="w-4 h-4" />
        </button>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 p-0.5">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <ClipboardCheckIcon className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
          <p className="text-xs text-gray-500 font-medium">No office checklist items yet</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Use <span className="font-semibold">+ New</span> to add items or apply a template.</p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-600">{completedItems} of {totalItems} complete</span>
              <span className="text-xs font-medium text-gray-400">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Grouped items */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {grouped.map(({ group, items: groupItems }) => {
              const isCollapsed = collapsedGroups.has(group)
              const groupComplete = groupItems.filter((i) => i.is_complete).length
              return (
                <div key={group} className="rounded-lg border border-gray-100 overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition text-left"
                  >
                    <ChevronRightIcon className={`w-3 h-3 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                    <FileTextIcon className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide flex-1">{group}</span>
                    <span className="text-[10px] text-gray-400">{groupComplete}/{groupItems.length}</span>
                  </button>
                  {/* Group items */}
                  {!isCollapsed && (
                    <div className="divide-y divide-gray-50 dark:divide-[#2a2a2a]">
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
                          readOnly={!isAdmin}
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
    </div>
  )
}
