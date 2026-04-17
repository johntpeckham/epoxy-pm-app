'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface JobReportChecklist {
  id: string
  name: string
  sort_order: number
  created_at: string
}

interface JobReportChecklistItem {
  id: string
  checklist_id: string
  text: string
  sort_order: number
  created_at: string
}

interface NewItem {
  tempId: string
  text: string
}

interface JobReportChecklistManagementProps {
  userId: string
}

export default function JobReportChecklistManagement({ userId }: JobReportChecklistManagementProps) {
  const [checklists, setChecklists] = useState<JobReportChecklist[]>([])
  const [loading, setLoading] = useState(true)

  // Edit/Create state
  const [editingChecklist, setEditingChecklist] = useState<JobReportChecklist | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formItems, setFormItems] = useState<NewItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Delete state
  const [checklistToDelete, setChecklistToDelete] = useState<JobReportChecklist | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Item counts
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})

  const fetchChecklists = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('job_report_checklists')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) console.error('[JobReportChecklists] Fetch failed:', error)
    setChecklists((data as JobReportChecklist[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchChecklists()
  }, [fetchChecklists])

  const isEditing = isCreating || editingChecklist !== null

  useEffect(() => {
    async function loadCounts() {
      const supabase = createClient()
      const { data } = await supabase.from('job_report_checklist_items').select('checklist_id')
      if (data) {
        const counts: Record<string, number> = {}
        for (const row of data) {
          counts[row.checklist_id] = (counts[row.checklist_id] ?? 0) + 1
        }
        setItemCounts(counts)
      }
    }
    if (!isEditing) loadCounts()
  }, [isEditing, checklists])

  const loadChecklistItems = useCallback(async (checklistId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('job_report_checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: true })
    const items: NewItem[] = ((data as JobReportChecklistItem[]) ?? []).map((item) => ({
      tempId: item.id,
      text: item.text,
    }))
    setFormItems(items)
  }, [])

  const startCreate = () => {
    setIsCreating(true)
    setEditingChecklist(null)
    setFormName('')
    setFormItems([])
    setError('')
  }

  const startEdit = async (checklist: JobReportChecklist) => {
    setEditingChecklist(checklist)
    setIsCreating(false)
    setFormName(checklist.name)
    setError('')
    await loadChecklistItems(checklist.id)
  }

  const cancelForm = () => {
    setIsCreating(false)
    setEditingChecklist(null)
    setFormName('')
    setFormItems([])
    setError('')
  }

  const addItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: '',
      },
    ])
  }

  const removeItem = (tempId: string) => {
    setFormItems((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  const updateItem = (tempId: string, text: string) => {
    setFormItems((prev) => prev.map((i) => i.tempId === tempId ? { ...i, text } : i))
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
    if (!formName.trim()) { setError('Checklist name is required'); return }
    const validItems = formItems.filter((i) => i.text.trim())
    if (validItems.length === 0) { setError('Add at least one checklist item'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    try {
      if (editingChecklist) {
        // Update checklist name
        const { error: updateErr } = await supabase
          .from('job_report_checklists')
          .update({ name: formName.trim() })
          .eq('id', editingChecklist.id)
        if (updateErr) throw updateErr

        // Delete existing items and re-insert
        await supabase.from('job_report_checklist_items').delete().eq('checklist_id', editingChecklist.id)

        const itemRows = validItems.map((item, idx) => ({
          checklist_id: editingChecklist.id,
          text: item.text.trim(),
          sort_order: idx,
        }))
        if (itemRows.length) {
          const { error: insertErr } = await supabase.from('job_report_checklist_items').insert(itemRows)
          if (insertErr) throw insertErr
        }
      } else {
        // Create checklist
        const { data: newChecklist, error: createErr } = await supabase
          .from('job_report_checklists')
          .insert({ name: formName.trim(), sort_order: checklists.length })
          .select()
          .single()
        if (createErr) throw createErr

        const itemRows = validItems.map((item, idx) => ({
          checklist_id: newChecklist.id,
          text: item.text.trim(),
          sort_order: idx,
        }))
        if (itemRows.length) {
          const { error: insertErr } = await supabase.from('job_report_checklist_items').insert(itemRows)
          if (insertErr) throw insertErr
        }
      }

      cancelForm()
      fetchChecklists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!checklistToDelete) return
    setDeleting(true)
    const supabase = createClient()
    // Delete items first, then checklist
    await supabase.from('job_report_checklist_items').delete().eq('checklist_id', checklistToDelete.id)
    const { error } = await supabase.from('job_report_checklists').delete().eq('id', checklistToDelete.id)
    if (error) console.error('[JobReportChecklists] Delete failed:', error)
    setDeleting(false)
    setChecklistToDelete(null)
    fetchChecklists()
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Sub-header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <p className="text-xs text-gray-400">Create reusable checklists for job reports.</p>
        </div>
        {!isEditing && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New Checklist
          </button>
        )}
      </div>

      {isEditing ? (
        /* ── Checklist Edit/Create Form ──────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingChecklist ? 'Edit Checklist' : 'New Checklist'}
          </h2>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Checklist Name *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="e.g., Safety Inspection, Quality Check"
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
                          <ChevronUpIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveItem(idx, 'down')}
                          disabled={idx === formItems.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDownIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <input
                          value={item.text}
                          onChange={(e) => updateItem(item.tempId, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          placeholder="Checklist item text *"
                        />
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
              {saving ? 'Saving...' : editingChecklist ? 'Save Changes' : 'Create Checklist'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Checklist List ──────────────────────────────────────── */
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : checklists.length === 0 ? (
            <div className="text-center py-20">
              <ClipboardCheckIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">No job report checklists yet</p>
              <button onClick={startCreate} className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium">
                + Create your first checklist
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {checklists.map((cl) => (
                <div key={cl.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">{cl.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">{itemCounts[cl.id] ?? 0} item{(itemCounts[cl.id] ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(cl)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition"
                        title="Edit checklist"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setChecklistToDelete(cl)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 transition"
                        title="Delete checklist"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {checklistToDelete && (
        <ConfirmDialog
          title="Delete Checklist"
          message={`Delete "${checklistToDelete.name}"? This will permanently remove the checklist and all its items. This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setChecklistToDelete(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
