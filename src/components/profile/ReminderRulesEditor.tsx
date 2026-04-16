'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  BellIcon,
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  AlertTriangleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { ReminderRule } from '@/components/sales/estimating/types'

const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: 'estimate_sent', label: 'Estimate Sent' },
]

interface DraftRule {
  id: string
  trigger_event: string
  days_after: number
  title_template: string
  is_active: boolean
  isNew?: boolean
  isDeleted?: boolean
}

interface ReminderRulesEditorProps {
  onClose: () => void
}

export default function ReminderRulesEditor({ onClose }: ReminderRulesEditorProps) {
  const [drafts, setDrafts] = useState<DraftRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DraftRule | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('reminder_rules')
      .select('*')
      .order('days_after', { ascending: true })
    const rows = (data as ReminderRule[]) ?? []
    setDrafts(
      rows.map((r) => ({
        id: r.id,
        trigger_event: r.trigger_event,
        days_after: r.days_after,
        title_template: r.title_template,
        is_active: r.is_active,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const visible = drafts.filter((d) => !d.isDeleted)

  function updateDraft(id: string, patch: Partial<DraftRule>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function addRule() {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setDrafts((prev) => [
      ...prev,
      {
        id,
        trigger_event: 'estimate_sent',
        days_after: 3,
        title_template: 'Follow up on {project_name}',
        is_active: true,
        isNew: true,
      },
    ])
  }

  function requestDelete(draft: DraftRule) {
    if (draft.isNew) {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
      return
    }
    setConfirmDelete(draft)
  }

  function confirmDeleteRule() {
    if (!confirmDelete) return
    updateDraft(confirmDelete.id, { isDeleted: true })
    setConfirmDelete(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      const deletedIds = drafts
        .filter((d) => d.isDeleted && !d.isNew)
        .map((d) => d.id)
      if (deletedIds.length > 0) {
        await supabase.from('reminder_rules').delete().in('id', deletedIds)
      }

      const activeDrafts = drafts.filter((d) => !d.isDeleted)
      for (const d of activeDrafts) {
        const row = {
          trigger_event: d.trigger_event,
          days_after: d.days_after,
          title_template: d.title_template.trim(),
          is_active: d.is_active,
        }
        if (d.isNew) {
          await supabase.from('reminder_rules').insert(row)
        } else {
          await supabase.from('reminder_rules').update(row).eq('id', d.id)
        }
      }

      setSaving(false)
      onClose()
    } catch (err) {
      console.error('[ReminderRulesEditor] Save failed:', err)
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
              <BellIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-gray-900">
                Edit Notifications and Follow-ups
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
                  Auto-reminders are created when a trigger event fires. Use{' '}
                  <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-700">
                    {'{project_name}'}
                  </code>{' '}
                  in the title to include the project name.
                </p>
                {visible.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-4">
                    No rules configured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {visible.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 bg-white border border-gray-200 rounded-lg space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                          <select
                            value={d.trigger_event}
                            onChange={(e) =>
                              updateDraft(d.id, { trigger_event: e.target.value })
                            }
                            className="px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          >
                            {TRIGGER_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={d.days_after}
                              onChange={(e) =>
                                updateDraft(d.id, {
                                  days_after: Math.max(
                                    0,
                                    parseInt(e.target.value || '0', 10)
                                  ),
                                })
                              }
                              className="w-16 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                            <span className="text-xs text-gray-500">days after</span>
                          </div>
                          <label className="flex items-center gap-1 text-xs text-gray-500 justify-self-end">
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
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={d.title_template}
                            onChange={(e) =>
                              updateDraft(d.id, { title_template: e.target.value })
                            }
                            placeholder="Follow up on {project_name}"
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => requestDelete(d)}
                            title="Delete rule"
                            className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2Icon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addRule}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add rule
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
          title="Delete rule?"
          message={`This will remove the "${confirmDelete.title_template}" rule. Existing reminders already created from this rule will stay.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={confirmDeleteRule}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </Portal>
  )
}
