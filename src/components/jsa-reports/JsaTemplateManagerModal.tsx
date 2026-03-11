'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, PencilIcon, Trash2Icon, ChevronUpIcon, ChevronDownIcon, CheckIcon } from 'lucide-react'
import { JsaTaskTemplate } from '@/types'
import Portal from '@/components/ui/Portal'

interface JsaTemplateManagerModalProps {
  onClose: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function JsaTemplateManagerModal({ onClose }: JsaTemplateManagerModalProps) {
  const supabase = createClient()
  const [templates, setTemplates] = useState<JsaTaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add/Edit form state
  const [formName, setFormName] = useState('')
  const [formHazards, setFormHazards] = useState('')
  const [formPrecautions, setFormPrecautions] = useState('')
  const [formPpe, setFormPpe] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTemplates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('jsa_task_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) console.error('[JsaTemplateManager] Fetch templates failed:', error)
    setTemplates((data as JsaTaskTemplate[]) ?? [])
    setLoading(false)
  }

  function startEdit(t: JsaTaskTemplate) {
    setEditingId(t.id)
    setFormName(t.name)
    setFormHazards(t.default_hazards ?? '')
    setFormPrecautions(t.default_precautions ?? '')
    setFormPpe(t.default_ppe ?? '')
    setShowAddForm(false)
  }

  function startAdd() {
    setEditingId(null)
    setFormName('')
    setFormHazards('')
    setFormPrecautions('')
    setFormPpe('')
    setShowAddForm(true)
  }

  function cancelForm() {
    setEditingId(null)
    setShowAddForm(false)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)

    if (editingId) {
      const { error } = await supabase
        .from('jsa_task_templates')
        .update({
          name: formName.trim(),
          default_hazards: formHazards.trim() || null,
          default_precautions: formPrecautions.trim() || null,
          default_ppe: formPpe.trim() || null,
        })
        .eq('id', editingId)
      if (error) console.error('[JsaTemplateManager] Update template failed:', error)
    } else {
      const maxSort = templates.length > 0 ? Math.max(...templates.map((t) => t.sort_order)) : 0
      const { error } = await supabase.from('jsa_task_templates').insert({
        name: formName.trim(),
        sort_order: maxSort + 1,
        default_hazards: formHazards.trim() || null,
        default_precautions: formPrecautions.trim() || null,
        default_ppe: formPpe.trim() || null,
      })
      if (error) console.error('[JsaTemplateManager] Insert template failed:', error)
    }

    setSaving(false)
    cancelForm()
    await fetchTemplates()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from('jsa_task_templates')
      .update({ is_active: false })
      .eq('id', id)
    if (error) console.error('[JsaTemplateManager] Delete template failed:', error)
    await fetchTemplates()
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const idx = templates.findIndex((t) => t.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= templates.length) return

    const a = templates[idx]
    const b = templates[swapIdx]

    const results = await Promise.all([
      supabase.from('jsa_task_templates').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('jsa_task_templates').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    for (const { error } of results) {
      if (error) console.error('[JsaTemplateManager] Reorder failed:', error)
    }

    await fetchTemplates()
  }

  const isFormVisible = showAddForm || editingId !== null

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Manage JSA Task Templates</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading templates...</p>
          ) : templates.length === 0 && !isFormVisible ? (
            <p className="text-sm text-gray-400 text-center py-8">No task templates yet. Add one to get started.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-white hover:border-amber-200 transition"
                >
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => handleReorder(t.id, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 text-gray-400 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorder(t.id, 'down')}
                      disabled={idx === templates.length - 1}
                      className="p-0.5 text-gray-400 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                    {t.default_hazards && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{t.default_hazards}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Form */}
          {isFormVisible && (
            <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
              <p className="text-sm font-bold text-amber-800">
                {editingId ? 'Edit Task Template' : 'New Task Template'}
              </p>
              <div>
                <label className={labelCls}>Task Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Concrete Prep"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Default Hazards</label>
                <textarea
                  rows={2}
                  value={formHazards}
                  onChange={(e) => setFormHazards(e.target.value)}
                  placeholder="Pre-filled hazards text..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Default Precautions</label>
                <textarea
                  rows={2}
                  value={formPrecautions}
                  onChange={(e) => setFormPrecautions(e.target.value)}
                  placeholder="Pre-filled precautions text..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Default PPE</label>
                <textarea
                  rows={2}
                  value={formPpe}
                  onChange={(e) => setFormPpe(e.target.value)}
                  placeholder="Pre-filled PPE requirements..."
                  className={textareaCls}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelForm}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
          {!isFormVisible && (
            <button
              onClick={startAdd}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              Add Template
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
