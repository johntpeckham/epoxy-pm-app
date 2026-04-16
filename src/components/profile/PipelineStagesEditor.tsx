'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  GitBranchIcon,
  PlusIcon,
  Trash2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { PipelineStage } from '@/components/sales/estimating/types'
import { SYSTEM_STAGES } from '@/components/sales/estimating/types'

interface DraftStage {
  id: string
  name: string
  color: string
  is_active: boolean
  is_default: boolean
  original_name: string | null
  isNew?: boolean
  isDeleted?: boolean
}

interface PipelineStagesEditorProps {
  onClose: () => void
}

export default function PipelineStagesEditor({ onClose }: PipelineStagesEditorProps) {
  const [drafts, setDrafts] = useState<DraftStage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    draft: DraftStage
    count: number
  } | null>(null)

  const fetchStages = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('pipeline_stages')
      .select('*')
      .order('display_order', { ascending: true })
    const rows = (data as PipelineStage[]) ?? []
    setDrafts(
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        is_active: s.is_active,
        is_default: s.is_default,
        original_name: s.name,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStages()
  }, [fetchStages])

  const visible = drafts.filter((d) => !d.isDeleted)

  function updateDraft(id: string, patch: Partial<DraftStage>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function move(id: string, dir: -1 | 1) {
    setDrafts((prev) => {
      const list = prev.filter((d) => !d.isDeleted)
      const idx = list.findIndex((d) => d.id === id)
      const nextIdx = idx + dir
      if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return prev
      const reordered = [...list]
      const [item] = reordered.splice(idx, 1)
      reordered.splice(nextIdx, 0, item)
      const deleted = prev.filter((d) => d.isDeleted)
      return [...reordered, ...deleted]
    })
  }

  function addStage() {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setDrafts((prev) => [
      ...prev,
      {
        id,
        name: 'New Stage',
        color: '#F59E0B',
        is_active: true,
        is_default: false,
        original_name: null,
        isNew: true,
      },
    ])
  }

  async function requestDelete(draft: DraftStage) {
    if (SYSTEM_STAGES.includes(draft.name as (typeof SYSTEM_STAGES)[number])) {
      setError(`Cannot delete system stage "${draft.name}".`)
      return
    }
    if (draft.isNew) {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
      return
    }
    const supabase = createClient()
    const { count } = await supabase
      .from('estimating_projects')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_stage', draft.original_name ?? draft.name)
    if ((count ?? 0) > 0) {
      setConfirmDelete({ draft, count: count ?? 0 })
      return
    }
    updateDraft(draft.id, { isDeleted: true })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      const ordered = drafts.filter((d) => !d.isDeleted)

      // Detect rename — original_name != name for existing rows
      const renames = ordered
        .filter(
          (d) =>
            !d.isNew &&
            d.original_name &&
            d.original_name !== d.name.trim()
        )
        .map((d) => ({ from: d.original_name as string, to: d.name.trim() }))

      // Apply renames to estimating_projects first
      for (const r of renames) {
        await supabase
          .from('estimating_projects')
          .update({ pipeline_stage: r.to })
          .eq('pipeline_stage', r.from)
      }

      // Deletes
      const deletedIds = drafts.filter((d) => d.isDeleted && !d.isNew).map((d) => d.id)
      if (deletedIds.length > 0) {
        await supabase.from('pipeline_stages').delete().in('id', deletedIds)
      }

      // Updates + inserts with new display_order
      for (let i = 0; i < ordered.length; i++) {
        const d = ordered[i]
        const row = {
          name: d.name.trim(),
          color: d.color,
          is_active: d.is_active,
          is_default: d.is_default,
          display_order: i + 1,
        }
        if (d.isNew) {
          await supabase.from('pipeline_stages').insert(row)
        } else {
          await supabase.from('pipeline_stages').update(row).eq('id', d.id)
        }
      }

      setSaving(false)
      onClose()
    } catch (err) {
      console.error('[PipelineStagesEditor] Save failed:', err)
      setError('Failed to save changes. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <GitBranchIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-gray-900">
                Edit Pipeline Visual
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            {loading ? (
              <div className="py-8 flex items-center justify-center text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  Rename, recolor, reorder, or deactivate stages. &quot;Won&quot; and
                  &quot;Lost&quot; cannot be deleted.
                </p>
                <div className="space-y-2">
                  {visible.map((d, idx) => {
                    const isSystem = SYSTEM_STAGES.includes(
                      d.name as (typeof SYSTEM_STAGES)[number]
                    )
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg"
                      >
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => move(d.id, -1)}
                            disabled={idx === 0}
                            className="w-6 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ChevronUpIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(d.id, 1)}
                            disabled={idx === visible.length - 1}
                            className="w-6 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="color"
                          value={d.color}
                          onChange={(e) =>
                            updateDraft(d.id, { color: e.target.value })
                          }
                          className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                          aria-label="Stage color"
                        />
                        <input
                          type="text"
                          value={d.name}
                          onChange={(e) =>
                            updateDraft(d.id, { name: e.target.value })
                          }
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={d.is_active}
                            onChange={(e) =>
                              updateDraft(d.id, { is_active: e.target.checked })
                            }
                            className="w-3.5 h-3.5 text-amber-500 rounded focus:ring-amber-500"
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          onClick={() => requestDelete(d)}
                          disabled={isSystem}
                          title={
                            isSystem
                              ? `Cannot delete system stage "${d.name}"`
                              : 'Delete stage'
                          }
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={addStage}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add stage
                </button>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Stage in use"
          message={`${confirmDelete.count} project(s) are currently at "${confirmDelete.draft.name}". Move those projects to another stage before deleting.`}
          confirmLabel="OK"
          variant="default"
          onConfirm={() => setConfirmDelete(null)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </Portal>
  )
}
