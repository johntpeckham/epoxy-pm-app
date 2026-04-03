'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  ArrowLeftIcon,
  GripVerticalIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckIcon,
  ClipboardCheckIcon,
} from 'lucide-react'
import { Profile } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useRouter } from 'next/navigation'

interface ChecklistTemplate {
  id: string
  name: string
  description: string | null
  is_default: boolean
  created_by: string
  created_at: string
  updated_at: string
}

interface ChecklistTemplateItem {
  id: string
  template_id: string
  name: string
  sort_order: number
  default_assignee_id: string | null
  default_due_days: number | null
  default_notes: string | null
  created_at: string
}

interface NewItem {
  tempId: string
  name: string
  default_assignee_id: string
  default_due_days: string
  default_notes: string
}

interface ChecklistTemplatesClientProps {
  userId: string
}

export default function ChecklistTemplatesClient({ userId }: ChecklistTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])

  // Edit/Create state
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formItems, setFormItems] = useState<NewItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Delete state
  const [templateToDelete, setTemplateToDelete] = useState<ChecklistTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('[Templates] Fetch failed:', error)
    const all = (data as ChecklistTemplate[]) ?? []
    // Sort: default template first, then by created_at desc
    all.sort((a, b) => {
      if (a.is_default && !b.is_default) return -1
      if (!a.is_default && b.is_default) return 1
      return 0
    })
    setTemplates(all)
    setLoading(false)
  }, [])

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    fetchTemplates()
    fetchProfiles()
  }, [fetchTemplates, fetchProfiles])

  // Fetch items for a template being edited
  const loadTemplateItems = useCallback(async (templateId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
    const items: NewItem[] = ((data as ChecklistTemplateItem[]) ?? []).map((item) => ({
      tempId: item.id,
      name: item.name,
      default_assignee_id: item.default_assignee_id ?? '',
      default_due_days: item.default_due_days?.toString() ?? '',
      default_notes: item.default_notes ?? '',
    }))
    setFormItems(items)
  }, [])

  const startCreate = () => {
    setIsCreating(true)
    setEditingTemplate(null)
    setFormName('')
    setFormDescription('')
    setFormItems([])
    setError('')
  }

  const startEdit = async (template: ChecklistTemplate) => {
    setEditingTemplate(template)
    setIsCreating(false)
    setFormName(template.name)
    setFormDescription(template.description ?? '')
    setError('')
    await loadTemplateItems(template.id)
  }

  const cancelForm = () => {
    setIsCreating(false)
    setEditingTemplate(null)
    setFormName('')
    setFormDescription('')
    setFormItems([])
    setError('')
  }

  const addItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: '',
        default_assignee_id: '',
        default_due_days: '',
        default_notes: '',
      },
    ])
  }

  const removeItem = (tempId: string) => {
    setFormItems((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  const updateItem = (tempId: string, field: keyof NewItem, value: string) => {
    setFormItems((prev) => prev.map((i) => i.tempId === tempId ? { ...i, [field]: value } : i))
  }

  const moveItem = (index: number, direction: 'up' | 'down') => {
    setFormItems((prev) => {
      const arr = [...prev]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= arr.length) return arr
      ;[arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]]
      return arr
    })
  }

  const handleSave = async () => {
    if (!formName.trim()) { setError('Template name is required'); return }
    const validItems = formItems.filter((i) => i.name.trim())
    const isDefault = editingTemplate?.is_default === true
    if (validItems.length === 0 && !isDefault) { setError('Add at least one checklist item'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    try {
      if (editingTemplate) {
        // Update template (preserve name for default templates)
        const updatePayload: Record<string, unknown> = {
          description: formDescription.trim() || null,
          updated_at: new Date().toISOString(),
        }
        if (!editingTemplate.is_default) {
          updatePayload.name = formName.trim()
        }
        const { error: updateErr } = await supabase
          .from('checklist_templates')
          .update(updatePayload)
          .eq('id', editingTemplate.id)
        if (updateErr) throw updateErr

        // Delete existing items and re-insert
        await supabase.from('checklist_template_items').delete().eq('template_id', editingTemplate.id)

        const itemRows = validItems.map((item, idx) => ({
          template_id: editingTemplate.id,
          name: item.name.trim(),
          sort_order: idx,
          default_assignee_id: item.default_assignee_id || null,
          default_due_days: item.default_due_days ? parseInt(item.default_due_days) : null,
          default_notes: item.default_notes.trim() || null,
        }))
        if (itemRows.length) {
          const { error: insertErr } = await supabase.from('checklist_template_items').insert(itemRows)
          if (insertErr) throw insertErr
        }
      } else {
        // Create template
        const { data: newTemplate, error: createErr } = await supabase
          .from('checklist_templates')
          .insert({ name: formName.trim(), description: formDescription.trim() || null, created_by: userId })
          .select()
          .single()
        if (createErr) throw createErr

        const itemRows = validItems.map((item, idx) => ({
          template_id: newTemplate.id,
          name: item.name.trim(),
          sort_order: idx,
          default_assignee_id: item.default_assignee_id || null,
          default_due_days: item.default_due_days ? parseInt(item.default_due_days) : null,
          default_notes: item.default_notes.trim() || null,
        }))
        if (itemRows.length) {
          const { error: insertErr } = await supabase.from('checklist_template_items').insert(itemRows)
          if (insertErr) throw insertErr
        }
      }

      cancelForm()
      fetchTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!templateToDelete) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('checklist_templates').delete().eq('id', templateToDelete.id)
    if (error) console.error('[Templates] Delete failed:', error)
    setDeleting(false)
    setTemplateToDelete(null)
    fetchTemplates()
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const isEditing = isCreating || editingTemplate !== null

  // Count items per template (we fetch them on demand, so show from local form if editing)
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    async function loadCounts() {
      const supabase = createClient()
      const { data } = await supabase.from('checklist_template_items').select('template_id')
      if (data) {
        const counts: Record<string, number> = {}
        for (const row of data) {
          counts[row.template_id] = (counts[row.template_id] ?? 0) + 1
        }
        setItemCounts(counts)
      }
    }
    if (!isEditing) loadCounts()
  }, [isEditing, templates])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/profile')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Checklist Templates</h1>
          <p className="text-xs text-gray-400">Create reusable checklists that can be applied to projects from the Job Board.</p>
        </div>
        {!isEditing && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New Template
          </button>
        )}
      </div>

      {isEditing ? (
        /* ── Template Edit/Create Form ──────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            {editingTemplate ? 'Edit Template' : 'New Template'}
          </h2>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Template Name *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                readOnly={editingTemplate?.is_default === true}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${editingTemplate?.is_default ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="e.g., Prevailing Wage, Industrial Floor Coating"
              />
              {editingTemplate?.is_default && (
                <p className="text-xs text-gray-400 mt-1">The default template name cannot be changed.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Items */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Checklist Items</h3>
            {formItems.length === 0 ? (
              <p className="text-xs text-gray-400 mb-3">No items yet. Add your first checklist item below.</p>
            ) : (
              <div className="space-y-3">
                {formItems.map((item, idx) => (
                  <div key={item.tempId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-start gap-2">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button
                          onClick={() => moveItem(idx, 'up')}
                          disabled={idx === 0}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronUpIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveItem(idx, 'down')}
                          disabled={idx === formItems.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDownIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Item name */}
                        <input
                          value={item.name}
                          onChange={(e) => updateItem(item.tempId, 'name', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          placeholder="Checklist item name *"
                        />
                        {/* Options row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={item.default_assignee_id}
                            onChange={(e) => updateItem(item.tempId, 'default_assignee_id', e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          >
                            <option value="">No default assignee</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={item.default_due_days}
                            onChange={(e) => updateItem(item.tempId, 'default_due_days', e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                            placeholder="Due days (after start)"
                          />
                          <input
                            value={item.default_notes}
                            onChange={(e) => updateItem(item.tempId, 'default_notes', e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                            placeholder="Default notes"
                          />
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => removeItem(item.tempId)}
                        className="p-1 text-gray-400 hover:text-red-600 transition flex-shrink-0"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addItem}
              className="mt-3 flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button onClick={cancelForm} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Template List ──────────────────────────────────────── */
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <ClipboardCheckIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">No checklist templates yet</p>
              <button onClick={startCreate} className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium">
                + Create your first template
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all ${tpl.is_default ? 'border-amber-300' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{tpl.name}</h3>
                        {tpl.is_default && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 rounded">Auto-applied</span>
                        )}
                      </div>
                      {tpl.description && <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">{itemCounts[tpl.id] ?? 0} item{(itemCounts[tpl.id] ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(tpl)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition"
                        title="Edit template"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {!tpl.is_default && (
                        <button
                          onClick={() => setTemplateToDelete(tpl)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-100 transition"
                          title="Delete template"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {templateToDelete && (
        <ConfirmDialog
          title="Delete Template"
          message={`Delete "${templateToDelete.name}"? This will not remove checklist items already added to projects.`}
          onConfirm={handleDelete}
          onCancel={() => setTemplateToDelete(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
