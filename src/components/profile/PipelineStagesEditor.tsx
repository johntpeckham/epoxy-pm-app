'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  GitBranchIcon,
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  AlertTriangleIcon,
  GripVerticalIcon,
  LockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type {
  PipelineStage,
  PipelineStageAutomationRules,
} from '@/components/sales/estimating/types'
import { SYSTEM_STAGES } from '@/components/sales/estimating/types'

const PRESET_COLORS: { value: string; label: string }[] = [
  { value: '#10B981', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#6B7280', label: 'Grey' },
]

const AUTO_ADVANCE_OPTIONS: {
  value: NonNullable<PipelineStageAutomationRules['auto_advance_trigger']>
  label: string
}[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'estimate_sent', label: 'When estimate sent' },
  { value: 'estimate_accepted', label: 'When estimate accepted' },
  { value: 'estimate_declined', label: 'When estimate declined' },
]

interface DraftStage {
  id: string
  name: string
  color: string
  is_active: boolean
  is_default: boolean
  original_name: string | null
  automation_rules: PipelineStageAutomationRules
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
  const [expandedAutomation, setExpandedAutomation] = useState<Set<string>>(
    new Set()
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
        automation_rules: s.automation_rules ?? {},
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

  function updateAutomation(
    id: string,
    patch: Partial<PipelineStageAutomationRules>
  ) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, automation_rules: { ...d.automation_rules, ...patch } }
          : d
      )
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDrafts((prev) => {
      const active_list = prev.filter((d) => !d.isDeleted)
      const from = active_list.findIndex((d) => d.id === active.id)
      const to = active_list.findIndex((d) => d.id === over.id)
      if (from < 0 || to < 0) return prev
      const reordered = arrayMove(active_list, from, to)
      const deleted = prev.filter((d) => d.isDeleted)
      return [...reordered, ...deleted]
    })
  }

  function toggleAutomation(id: string) {
    setExpandedAutomation((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
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
        automation_rules: {},
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

      const renames = ordered
        .filter(
          (d) =>
            !d.isNew &&
            d.original_name &&
            d.original_name !== d.name.trim()
        )
        .map((d) => ({ from: d.original_name as string, to: d.name.trim() }))

      for (const r of renames) {
        await supabase
          .from('estimating_projects')
          .update({ pipeline_stage: r.to })
          .eq('pipeline_stage', r.from)
      }

      const deletedIds = drafts.filter((d) => d.isDeleted && !d.isNew).map((d) => d.id)
      if (deletedIds.length > 0) {
        await supabase.from('pipeline_stages').delete().in('id', deletedIds)
      }

      for (let i = 0; i < ordered.length; i++) {
        const d = ordered[i]
        const row = {
          name: d.name.trim(),
          color: d.color,
          is_active: d.is_active,
          is_default: d.is_default,
          display_order: i + 1,
          automation_rules: d.automation_rules,
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
                  Drag to reorder, click a swatch to change color, expand
                  Automation for stage triggers. &quot;Won&quot; and
                  &quot;Lost&quot; are system stages and cannot be deleted.
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={visible.map((d) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {visible.map((d) => (
                        <SortableStageRow
                          key={d.id}
                          draft={d}
                          isExpanded={expandedAutomation.has(d.id)}
                          onToggleExpand={() => toggleAutomation(d.id)}
                          onUpdate={(patch) => updateDraft(d.id, patch)}
                          onUpdateAutomation={(patch) =>
                            updateAutomation(d.id, patch)
                          }
                          onDelete={() => requestDelete(d)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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

function SortableStageRow({
  draft,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onUpdateAutomation,
  onDelete,
}: {
  draft: DraftStage
  isExpanded: boolean
  onToggleExpand: () => void
  onUpdate: (patch: Partial<DraftStage>) => void
  onUpdateAutomation: (patch: Partial<PipelineStageAutomationRules>) => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft.id })

  const isSystem = SYSTEM_STAGES.includes(
    draft.name as (typeof SYSTEM_STAGES)[number]
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg overflow-hidden"
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </button>
        <ColorSwatchPicker
          value={draft.color}
          onChange={(color) => onUpdate({ color })}
        />
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          disabled={isSystem}
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => onUpdate({ is_active: e.target.checked })}
            className="w-3.5 h-3.5 text-amber-500 rounded focus:ring-amber-500"
          />
          Active
        </label>
        <button
          type="button"
          onClick={onToggleExpand}
          title="Automation"
          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>
        {isSystem ? (
          <span
            title="System stage — cannot be deleted"
            className="p-1.5 text-gray-300"
          >
            <LockIcon className="w-3.5 h-3.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            title="Delete stage"
            className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 bg-amber-50/40 border-t border-amber-100 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              Auto-advance to this stage when:
            </label>
            <select
              value={draft.automation_rules.auto_advance_trigger ?? 'manual'}
              onChange={(e) =>
                onUpdateAutomation({
                  auto_advance_trigger: e.target
                    .value as PipelineStageAutomationRules['auto_advance_trigger'],
                })
              }
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              {AUTO_ADVANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(draft.automation_rules.auto_reminder_enabled)}
                onChange={(e) =>
                  onUpdateAutomation({ auto_reminder_enabled: e.target.checked })
                }
                className="w-3.5 h-3.5 text-amber-500 rounded focus:ring-amber-500"
              />
              Auto-create reminder when entering this stage
            </label>
            {draft.automation_rules.auto_reminder_enabled && (
              <div className="mt-1.5 flex items-center gap-2 pl-5">
                <span className="text-xs text-gray-500">Days after:</span>
                <input
                  type="number"
                  min={0}
                  value={draft.automation_rules.auto_reminder_days ?? 3}
                  onChange={(e) =>
                    onUpdateAutomation({
                      auto_reminder_days: Math.max(
                        0,
                        parseInt(e.target.value || '0', 10)
                      ),
                    })
                  }
                  className="w-16 px-2 py-1 border border-gray-200 rounded-md text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-md border border-gray-200 hover:ring-2 hover:ring-amber-300 transition"
        style={{ backgroundColor: value }}
        aria-label="Pick color"
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-[75]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-[76] bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex items-center gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onChange(c.value)
                  setOpen(false)
                }}
                title={c.label}
                className={`w-6 h-6 rounded ${
                  value === c.value ? 'ring-2 ring-offset-1 ring-amber-500' : ''
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
