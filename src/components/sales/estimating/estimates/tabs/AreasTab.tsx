'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, PencilIcon, Trash2Icon, GripVerticalIcon } from 'lucide-react'
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
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/usePermissions'
import KebabMenu, { type KebabMenuItem } from '@/components/ui/KebabMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Tooltip from '@/components/ui/Tooltip'
import { AREA_TYPE_STYLES } from '../../types'
import type {
  EstimateArea,
  EstimateAreaMeasurement,
  EstimateAreaType,
  EstimateSectionCove,
  EstimateSectionInputMode,
} from '../../types'
import type { AutoSaveState } from '../AutoSaveIndicator'

const ADD_BUTTONS: { type: EstimateAreaType; label: string }[] = [
  { type: 'floor', label: '+ Add floor' },
  { type: 'roof', label: '+ Add roof' },
  { type: 'walls', label: '+ Add walls' },
  { type: 'cove', label: '+ Add cove' },
  { type: 'custom', label: '+ Add custom' },
]

interface Props {
  estimateId: string
  areas: EstimateArea[]
  sections: EstimateAreaMeasurement[]
  sectionCoves: EstimateSectionCove[]
  setAreas: React.Dispatch<React.SetStateAction<EstimateArea[]>>
  setSections: React.Dispatch<React.SetStateAction<EstimateAreaMeasurement[]>>
  setSectionCoves: React.Dispatch<React.SetStateAction<EstimateSectionCove[]>>
  reportAutoSave: (s: AutoSaveState) => void
  /** Called BEFORE each state-mutating user action to push the current
   *  document state onto the undo stack. The owner suppresses this during
   *  its own undo/redo restoration via a guard ref. */
  captureSnapshot: () => void
}

// Section name generator: A, B, ... Z, AA, AB, ...
function nextSectionLetter(existingCount: number): string {
  const letters: string[] = []
  let n = existingCount
  do {
    letters.unshift(String.fromCharCode(65 + (n % 26)))
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `Section ${letters.join('')}`
}

function isLinear(type: EstimateAreaType): boolean {
  return type === 'cove'
}

function untitledFor(type: EstimateAreaType): string {
  return `Untitled ${type}`
}

function formatTotal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function AreasTab({
  estimateId,
  areas,
  sections,
  sectionCoves,
  setAreas,
  setSections,
  setSectionCoves,
  reportAutoSave,
  captureSnapshot,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { canCreate, canEdit } = usePermissions()
  const canCreateAreas = canCreate('estimating')
  const canEditAreas = canEdit('estimating')
  const canDelete = canEdit('estimating') // delete gated by full level

  // Which area id should auto-focus its name input on next render (set right
  // after creating a new area so the user can immediately rename it).
  const [focusAreaNameId, setFocusAreaNameId] = useState<string | null>(null)

  // Delete confirms
  const [deleteAreaTarget, setDeleteAreaTarget] = useState<EstimateArea | null>(null)
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<EstimateAreaMeasurement | null>(null)
  const [deleteCoveTarget, setDeleteCoveTarget] = useState<EstimateSectionCove | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Group sections by area, sorted by sort_order then created_at for stability.
  const sectionsByArea = useMemo(() => {
    const map = new Map<string, EstimateAreaMeasurement[]>()
    for (const s of sections) {
      const arr = map.get(s.area_id) ?? []
      arr.push(s)
      map.set(s.area_id, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.created_at.localeCompare(b.created_at)
      })
    }
    return map
  }, [sections])

  // Coves are now per-section (estimate_section_coves), not per-area. The old
  // model used estimate_areas.parent_area_id for nested-cove-as-its-own-area;
  // migration 20260554 wiped those rows. Anything that still has a
  // parent_area_id sneaks past as a safety net to keep the top-level filter
  // defensive — but no UI path can create one anymore.
  // Sort by sort_order so optimistic updates from drag-and-drop reorder
  // (which stamp new sort_order values onto items without mutating array
  // order) flow through to the rendered list. created_at is a stable
  // tiebreaker on fresh inserts before they get their sort_order saved.
  const topLevelAreas = useMemo(
    () =>
      areas
        .filter((a) => !a.parent_area_id)
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
          return a.created_at.localeCompare(b.created_at)
        }),
    [areas]
  )

  // Group section coves by their parent section id for fast per-section
  // lookup during render.
  const covesBySection = useMemo(() => {
    const map = new Map<string, EstimateSectionCove[]>()
    for (const c of sectionCoves) {
      const arr = map.get(c.section_id) ?? []
      arr.push(c)
      map.set(c.section_id, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.created_at.localeCompare(b.created_at)
      })
    }
    return map
  }, [sectionCoves])

  // Helper: report a save lifecycle around any awaitable operation.
  const withAutoSave = useCallback(
    async <T,>(op: () => Promise<T>): Promise<T | null> => {
      reportAutoSave('saving')
      try {
        const out = await op()
        reportAutoSave('saved')
        return out
      } catch (err) {
        console.error('Auto-save failure', err instanceof Error ? { message: err.message } : { err })
        reportAutoSave('error')
        return null
      }
    },
    [reportAutoSave]
  )

  // ── Add area + first section ─────────────────────────────────────────────
  async function addAreaOfType(type: EstimateAreaType) {
    captureSnapshot()
    const nextSortOrder = (areas[areas.length - 1]?.sort_order ?? 0) + 1
    const result = await withAutoSave(async () => {
      const { data: insertedArea, error: areaErr } = await supabase
        .from('estimate_areas')
        .insert({
          estimate_id: estimateId,
          area_type: type,
          name: untitledFor(type),
          sort_order: nextSortOrder,
        })
        .select()
        .single()
      if (areaErr || !insertedArea) {
        console.error('Failed to create estimate_area', { code: areaErr?.code, message: areaErr?.message, hint: areaErr?.hint, details: areaErr?.details })
        throw new Error(areaErr?.message ?? 'Failed to create area.')
      }
      const area = insertedArea as EstimateArea
      const { data: insertedSection, error: secErr } = await supabase
        .from('estimate_area_measurements')
        .insert({
          area_id: area.id,
          section_name: nextSectionLetter(0),
          sort_order: 1,
        })
        .select()
        .single()
      if (secErr || !insertedSection) {
        console.error('Failed to seed first section', { code: secErr?.code, message: secErr?.message, hint: secErr?.hint, details: secErr?.details })
        // Roll back the area so we never leave a sectionless area behind.
        const { error: rbErr } = await supabase.from('estimate_areas').delete().eq('id', area.id)
        if (rbErr) console.error('Rollback: failed to delete orphaned area', { code: rbErr.code, message: rbErr.message })
        throw new Error(secErr?.message ?? 'Failed to seed first section.')
      }
      return { area, section: insertedSection as EstimateAreaMeasurement }
    })
    if (!result) return
    setAreas((prev) => [...prev, result.area])
    setSections((prev) => [...prev, result.section])
    setFocusAreaNameId(result.area.id)
  }

  // ── Add a section to an existing area ────────────────────────────────────
  async function addSectionTo(area: EstimateArea) {
    captureSnapshot()
    const existing = sectionsByArea.get(area.id) ?? []
    const nextSortOrder = (existing[existing.length - 1]?.sort_order ?? 0) + 1
    const result = await withAutoSave(async () => {
      const { data: inserted, error } = await supabase
        .from('estimate_area_measurements')
        .insert({
          area_id: area.id,
          section_name: nextSectionLetter(existing.length),
          sort_order: nextSortOrder,
        })
        .select()
        .single()
      if (error || !inserted) {
        console.error('Failed to add section', { code: error?.code, message: error?.message, hint: error?.hint, details: error?.details })
        throw new Error(error?.message ?? 'Failed to add section.')
      }
      return inserted as EstimateAreaMeasurement
    })
    if (!result) return
    setSections((prev) => [...prev, result])
  }

  // ── Section coves (Floor-area sections only) ─────────────────────────────
  async function addSectionCove(section: EstimateAreaMeasurement) {
    captureSnapshot()
    const existing = covesBySection.get(section.id) ?? []
    const nextSortOrder = (existing[existing.length - 1]?.sort_order ?? 0) + 1
    const result = await withAutoSave(async () => {
      const { data: inserted, error } = await supabase
        .from('estimate_section_coves')
        .insert({
          section_id: section.id,
          sort_order: nextSortOrder,
        })
        .select()
        .single()
      if (error || !inserted) {
        console.error('Failed to add section cove', { code: error?.code, message: error?.message, hint: error?.hint, details: error?.details })
        throw new Error(error?.message ?? 'Failed to add cove.')
      }
      return inserted as EstimateSectionCove
    })
    if (!result) return
    setSectionCoves((prev) => [...prev, result])
  }

  async function saveCoveLength(cove: EstimateSectionCove, nextLength: number | null) {
    if (nextLength === cove.cove_length) return
    captureSnapshot()
    const previous = cove
    setSectionCoves((prev) => prev.map((c) => (c.id === cove.id ? { ...c, cove_length: nextLength } : c)))
    const ok = await withAutoSave(async () => {
      const { error } = await supabase
        .from('estimate_section_coves')
        .update({ cove_length: nextLength })
        .eq('id', cove.id)
      if (error) {
        console.error('Failed to update cove length', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (!ok) {
      setSectionCoves((prev) => prev.map((c) => (c.id === cove.id ? previous : c)))
    }
  }

  async function saveCoveName(cove: EstimateSectionCove, nextName: string | null) {
    // Treat null and empty equivalently — the trim happens in the row component.
    const normalized = nextName === '' ? null : nextName
    if (normalized === (cove.name ?? null)) return
    captureSnapshot()
    const previous = cove
    setSectionCoves((prev) => prev.map((c) => (c.id === cove.id ? { ...c, name: normalized } : c)))
    const ok = await withAutoSave(async () => {
      const { error } = await supabase
        .from('estimate_section_coves')
        .update({ name: normalized })
        .eq('id', cove.id)
      if (error) {
        console.error('Failed to update cove name', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (!ok) {
      setSectionCoves((prev) => prev.map((c) => (c.id === cove.id ? previous : c)))
    }
  }

  async function confirmDeleteCove() {
    if (!deleteCoveTarget) return
    captureSnapshot()
    const target = deleteCoveTarget
    setDeleting(true)
    const ok = await withAutoSave(async () => {
      const { error } = await supabase.from('estimate_section_coves').delete().eq('id', target.id)
      if (error) {
        console.error('Failed to delete section cove', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (ok) {
      setSectionCoves((prev) => prev.filter((c) => c.id !== target.id))
    }
    setDeleting(false)
    setDeleteCoveTarget(null)
  }

  // ── Save an area's editable fields (just name in Phase 2) ────────────────
  async function saveAreaName(area: EstimateArea, nextName: string) {
    const trimmed = nextName.trim()
    if (trimmed === area.name) return
    captureSnapshot()
    const previous = area
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, name: trimmed } : a)))
    const result = await withAutoSave(async () => {
      const { error } = await supabase
        .from('estimate_areas')
        .update({ name: trimmed })
        .eq('id', area.id)
      if (error) {
        console.error('Failed to update area name', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (!result) {
      // Revert optimistic update on failure.
      setAreas((prev) => prev.map((a) => (a.id === area.id ? previous : a)))
    }
  }

  // ── Save a section row's editable fields ─────────────────────────────────
  // Patch shape supports both modes. In dimensioned mode the caller passes
  // length/width and we compute the total. In total_only mode the caller
  // passes total directly and we null length/width. The input_mode field can
  // be supplied alone (toggle flip) or together with values.
  //
  // Toggle semantics:
  //   dimensioned → total_only: length/width null, total = displayed L×W
  //   total_only → dimensioned: length/width left null (user re-enters)
  async function saveSection(
    section: EstimateAreaMeasurement,
    next: {
      section_name?: string
      length?: number | null
      width?: number | null
      total?: number | null
      input_mode?: EstimateSectionInputMode
    }
  ) {
    const area = areas.find((a) => a.id === section.area_id)
    if (!area) return
    const linear = isLinear(area.area_type)
    const mode: EstimateSectionInputMode =
      next.input_mode !== undefined ? next.input_mode : section.input_mode
    const nextName = next.section_name !== undefined ? next.section_name : section.section_name

    let nextLength: number | null
    let nextWidth: number | null
    let nextTotal: number | null

    if (mode === 'total_only') {
      nextLength = null
      nextWidth = null
      nextTotal = next.total !== undefined ? next.total : section.total
    } else {
      nextLength = next.length !== undefined ? next.length : section.length
      nextWidth = linear ? null : (next.width !== undefined ? next.width : section.width)
      // Recompute total from length/width unless caller explicitly supplied one
      // (e.g. when toggling from dimensioned → total_only we want to carry
      // the displayed total forward).
      if (next.total !== undefined) {
        nextTotal = next.total
      } else {
        const l = typeof nextLength === 'number' ? nextLength : 0
        const w = linear ? 1 : (typeof nextWidth === 'number' ? nextWidth : 0)
        nextTotal = linear ? l : l * w
      }
    }

    const patch: Partial<EstimateAreaMeasurement> = {
      section_name: nextName ?? null,
      length: nextLength,
      width: nextWidth,
      total: nextTotal,
      input_mode: mode,
    }
    // No-op short-circuit: skip if nothing actually changed.
    if (
      patch.section_name === section.section_name &&
      patch.length === section.length &&
      patch.width === section.width &&
      patch.total === section.total &&
      patch.input_mode === section.input_mode
    ) {
      return
    }
    captureSnapshot()
    const previous = section
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, ...patch } : s)))
    const result = await withAutoSave(async () => {
      const { error } = await supabase
        .from('estimate_area_measurements')
        .update(patch)
        .eq('id', section.id)
      if (error) {
        console.error('Failed to update section', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (!result) {
      setSections((prev) => prev.map((s) => (s.id === section.id ? previous : s)))
    }
  }

  // ── Delete handlers ──────────────────────────────────────────────────────
  async function confirmDeleteArea() {
    if (!deleteAreaTarget) return
    captureSnapshot()
    const target = deleteAreaTarget
    setDeleting(true)
    const ok = await withAutoSave(async () => {
      // The DB cascades both the area's sections (via area_id FK) and any
      // nested-cove children (via parent_area_id FK CASCADE — migration
      // 20260553). Local state has to drop the same set.
      const { error } = await supabase.from('estimate_areas').delete().eq('id', target.id)
      if (error) {
        console.error('Failed to delete area', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (ok) {
      // Walk the parent_area_id tree once. Section-level coves no longer use
      // this relation but the walk is defensive in case any legacy nested
      // rows survived the 20260554 wipe.
      const removedAreaIds = new Set<string>([target.id])
      let added = true
      while (added) {
        added = false
        for (const a of areas) {
          if (a.parent_area_id && removedAreaIds.has(a.parent_area_id) && !removedAreaIds.has(a.id)) {
            removedAreaIds.add(a.id)
            added = true
          }
        }
      }
      const removedSectionIds = new Set<string>(
        sections.filter((s) => removedAreaIds.has(s.area_id)).map((s) => s.id)
      )
      setAreas((prev) => prev.filter((a) => !removedAreaIds.has(a.id)))
      setSections((prev) => prev.filter((s) => !removedAreaIds.has(s.area_id)))
      setSectionCoves((prev) => prev.filter((c) => !removedSectionIds.has(c.section_id)))
    }
    setDeleting(false)
    setDeleteAreaTarget(null)
  }

  async function confirmDeleteSection() {
    if (!deleteSectionTarget) return
    captureSnapshot()
    const target = deleteSectionTarget
    setDeleting(true)
    const ok = await withAutoSave(async () => {
      // Section coves cascade-delete via estimate_section_coves.section_id FK.
      const { error } = await supabase.from('estimate_area_measurements').delete().eq('id', target.id)
      if (error) {
        console.error('Failed to delete section', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (ok) {
      setSections((prev) => prev.filter((s) => s.id !== target.id))
      setSectionCoves((prev) => prev.filter((c) => c.section_id !== target.id))
    }
    setDeleting(false)
    setDeleteSectionTarget(null)
  }

  // ── Drag-and-drop: reorder top-level area cards ──────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleAreaDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = topLevelAreas.findIndex((a) => a.id === active.id)
    const newIdx = topLevelAreas.findIndex((a) => a.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    captureSnapshot()

    const reordered = [...topLevelAreas]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    const sortOrderById = new Map<string, number>()
    reordered.forEach((a, i) => sortOrderById.set(a.id, i + 1))

    // Optimistic local update: stamp the new sort_order on every reordered
    // top-level area; non-top-level rows (defensive, none today) untouched.
    const previousAreas = areas
    setAreas((prev) =>
      prev.map((a) => (sortOrderById.has(a.id) ? { ...a, sort_order: sortOrderById.get(a.id)! } : a))
    )

    const ok = await withAutoSave(async () => {
      const results = await Promise.all(
        Array.from(sortOrderById.entries()).map(([id, sortOrder]) =>
          supabase.from('estimate_areas').update({ sort_order: sortOrder }).eq('id', id)
        )
      )
      const firstErr = results.find((r) => r.error)?.error
      if (firstErr) {
        console.error('Failed to persist area sort_order', { code: firstErr.code, message: firstErr.message, hint: firstErr.hint, details: firstErr.details })
        throw new Error(firstErr.message)
      }
      return true
    })
    if (!ok) {
      // Rollback to the previous ordering on any persistence error.
      setAreas(previousAreas)
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function areaTotal(area: EstimateArea): number {
    const rows = sectionsByArea.get(area.id) ?? []
    let t = 0
    for (const s of rows) if (typeof s.total === 'number') t += s.total
    return t
  }

  return (
    <div className="space-y-4">
      {/* Area type add buttons */}
      {canCreateAreas && (
        <div className="flex flex-wrap gap-2">
          {ADD_BUTTONS.map((btn) => (
            <button
              key={btn.type}
              type="button"
              onClick={() => addAreaOfType(btn.type)}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:text-amber-600 hover:border-amber-400 transition"
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {topLevelAreas.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500 dark:text-[#a0a0a0]">
            No areas yet.
          </p>
          {canCreateAreas && (
            <p className="text-xs text-gray-400 dark:text-[#6b6b6b] mt-1">
              Click one of the buttons above to start.
            </p>
          )}
        </div>
      )}

      {/* Area cards (top-level only — section coves render under their section row).
          Wrapped in DndContext + SortableContext so the cards can be reordered
          by dragging the grip handle that fades in on hover. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAreaDragEnd}>
      <SortableContext items={topLevelAreas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
      {topLevelAreas.map((area) => {
        const style = AREA_TYPE_STYLES[area.area_type]
        const areaRows = sectionsByArea.get(area.id) ?? []

        const kebabItems: KebabMenuItem[] = []
        if (canEditAreas) {
          kebabItems.push({
            label: 'Rename',
            icon: <PencilIcon size={13} />,
            onSelect: () => setFocusAreaNameId(area.id),
          })
        }
        if (canDelete) {
          kebabItems.push({
            label: 'Delete',
            icon: <Trash2Icon size={13} />,
            destructive: true,
            onSelect: () => setDeleteAreaTarget(area),
          })
        }

        return (
          <SortableArea key={area.id} id={area.id} showHandle={canEditAreas}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0 w-[40%] pl-4">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${style.className}`}
                >
                  {style.label}
                </span>
                <AreaNameInput
                  area={area}
                  autoFocus={focusAreaNameId === area.id}
                  onConsumeFocus={() => setFocusAreaNameId((curr) => (curr === area.id ? null : curr))}
                  disabled={!canEditAreas}
                  onSave={(name) => saveAreaName(area, name)}
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canCreateAreas && (
                  <Tooltip label="Add section" placement="top">
                    <button
                      type="button"
                      onClick={() => addSectionTo(area)}
                      aria-label="Add section"
                      className="inline-flex items-center justify-center w-6 h-6 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )}
                {kebabItems.length > 0 && (
                  <KebabMenu variant="light" title="Area actions" items={kebabItems} />
                )}
              </div>
            </div>

            {/* Measurement table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide">
                    <th className="pb-2 pr-3 font-medium">Section</th>
                    {!isLinear(area.area_type) && (
                      <>
                        <th className="pb-2 pr-3 font-medium text-right">Length</th>
                        <th className="pb-2 pr-3 font-medium text-right">Width</th>
                      </>
                    )}
                    <th className="pb-2 pr-3 font-medium text-right">Total</th>
                    <th className="pb-2 font-medium text-right w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                  {areaRows.map((s) => {
                    const sectionCoveRows = covesBySection.get(s.id) ?? []
                    return (
                      <React.Fragment key={s.id}>
                        <SectionRow
                          area={area}
                          section={s}
                          disabled={!canEditAreas}
                          canDelete={canDelete}
                          canAddCove={canCreateAreas && area.area_type === 'floor'}
                          onSave={(patch) => saveSection(s, patch)}
                          onDelete={() => setDeleteSectionTarget(s)}
                          onAddCove={() => addSectionCove(s)}
                        />
                        {sectionCoveRows.map((cove) => (
                          <CoveLineRow
                            key={cove.id}
                            cove={cove}
                            disabled={!canEditAreas}
                            canDelete={canDelete}
                            onSaveLength={(length) => saveCoveLength(cove, length)}
                            onSaveName={(nextName) => saveCoveName(cove, nextName)}
                            onDelete={() => setDeleteCoveTarget(cove)}
                          />
                        ))}
                      </React.Fragment>
                    )
                  })}
                  {areaRows.length === 0 && (
                    <tr>
                      <td colSpan={isLinear(area.area_type) ? 3 : 5} className="py-3 text-xs text-gray-400 italic">
                        No sections yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom totals — divider + right-aligned per area type.
                  Floor: always Total SF, + Total LF if any section cove exists.
                  Roof / Walls / Custom: Total SF only.
                  Standalone Cove (top-level): Total LF only. */}
            {(() => {
              const sfTotal = areaTotal(area)
              const sectionIdsInArea = areaRows.map((s) => s.id)
              const lfTotal = sectionCoves.reduce(
                (acc, c) => (sectionIdsInArea.includes(c.section_id) && typeof c.cove_length === 'number' ? acc + c.cove_length : acc),
                0
              )
              const hasCoves = sectionCoves.some((c) => sectionIdsInArea.includes(c.section_id))
              const isStandaloneCove = area.area_type === 'cove'
              const showSf = !isStandaloneCove
              const showLf = isStandaloneCove || (area.area_type === 'floor' && hasCoves)
              const lfValue = isStandaloneCove ? sfTotal : lfTotal // standalone coves store LF in section.total
              return (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-[#3a3a3a] flex flex-col items-end gap-0.5 text-sm">
                  {showSf && (
                    <div>
                      <span className="text-gray-500 dark:text-[#a0a0a0] mr-2">Total SF:</span>
                      <span className="font-medium text-gray-900 dark:text-[#e5e5e5]">{formatTotal(sfTotal)}</span>
                    </div>
                  )}
                  {showLf && (
                    <div>
                      <span className="text-gray-500 dark:text-[#a0a0a0] mr-2">Total LF:</span>
                      <span className="font-medium text-gray-900 dark:text-[#e5e5e5]">{formatTotal(lfValue)}</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </SortableArea>
        )
      })}
      </SortableContext>
      </DndContext>

      {/* Delete confirmation dialogs */}
      {deleteAreaTarget && (
        <ConfirmDialog
          title="Delete area"
          message={`Delete "${deleteAreaTarget.name || untitledFor(deleteAreaTarget.area_type)}"? This will also delete its sections and any cove lines on them. This cannot be undone.`}
          confirmLabel="Delete area"
          onConfirm={confirmDeleteArea}
          onCancel={() => setDeleteAreaTarget(null)}
          loading={deleting}
        />
      )}
      {deleteSectionTarget && (
        <ConfirmDialog
          title="Delete section"
          message="Delete this section? Any cove lines on this section will also be deleted. This cannot be undone."
          confirmLabel="Delete section"
          onConfirm={confirmDeleteSection}
          onCancel={() => setDeleteSectionTarget(null)}
          loading={deleting}
        />
      )}
      {deleteCoveTarget && (
        <ConfirmDialog
          title="Delete cove"
          message="Delete this cove line?"
          confirmLabel="Delete cove"
          onConfirm={confirmDeleteCove}
          onCancel={() => setDeleteCoveTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Subcomponents — kept inline for proximity to the tab logic                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Sortable wrapper for a top-level area card. Provides the outer card
 * surface (rounded, border, padding), the dnd-kit ref + transform plumbing,
 * and a grip handle that fades in on hover at the card's left edge.
 *
 * The handle is absolute-positioned over the card's left padding area so
 * its appearance never shifts the card content; only the trigger is wired
 * with dnd-kit attributes + listeners, so dragging is initiated solely by
 * the grip — the rest of the card (name, kebab, "+ Add section", section
 * rows) remains fully interactive.
 */
function SortableArea({
  id,
  showHandle,
  children,
}: {
  id: string
  showHandle: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      // Use a Tailwind v4 NAMED group ("area") so the grip handle's
      // group-hover/area: trigger fires only on hover of THIS card and
      // doesn't leak into descendant Tooltips (which use unscoped `group`).
      className={`relative group/area bg-white rounded-xl border border-gray-200 p-4 ${isDragging ? 'opacity-60 z-10 shadow-lg' : ''}`}
    >
      {showHandle && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          className="absolute top-3 left-1 opacity-0 group-hover/area:opacity-100 focus:opacity-100 p-0.5 text-gray-400 hover:text-gray-700 dark:text-[#a0a0a0] dark:hover:text-white cursor-grab active:cursor-grabbing touch-none transition-opacity"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </button>
      )}
      {children}
    </div>
  )
}

function AreaNameInput({
  area,
  autoFocus,
  onConsumeFocus,
  disabled,
  onSave,
  tier = 'top',
}: {
  area: EstimateArea
  autoFocus: boolean
  onConsumeFocus: () => void
  disabled: boolean
  onSave: (name: string) => void
  /** Visual hierarchy: top-level cards use H2 (18px), nested cove
   *  mini-headers use H3 (16px). Both are weight 500. */
  tier?: 'top' | 'nested'
}) {
  const [value, setValue] = useState(area.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync local input when the area's name changes from outside (e.g. rollback).
  useEffect(() => {
    setValue(area.name)
  }, [area.name])

  // Programmatically focus when requested by the parent (after create / rename).
  useEffect(() => {
    if (!autoFocus) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
    onConsumeFocus()
  }, [autoFocus, onConsumeFocus])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      disabled={disabled}
      placeholder="Untitled area"
      title={disabled ? undefined : 'Click to rename'}
      // Opt out of the global dark-mode input chrome rule in globals.css so
      // our bg-transparent / border-transparent Tailwind utilities actually
      // win. The rule excludes inputs with this attribute.
      data-plain-text
      className={[
        tier === 'nested' ? 'text-base' : 'text-lg',
        'font-medium text-gray-900 dark:text-white',
        // At rest: render as plain styled text — fully transparent so no
        // input chrome appears until the user shows intent.
        'bg-transparent border border-transparent rounded',
        'px-1.5 py-0.5 min-w-0 flex-1',
        // Hover: subtle tint indicates editability; cursor switches to text.
        disabled ? 'cursor-default' : 'cursor-text hover:bg-gray-100 dark:hover:bg-[#2e2e2e]',
        // Focus: full input styling — solid surface + amber border ring.
        'focus:bg-white dark:focus:bg-[#1f1f1f] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:hover:bg-transparent',
      ].join(' ')}
    />
  )
}

function SectionRow({
  area,
  section,
  disabled,
  canDelete,
  canAddCove,
  onSave,
  onDelete,
  onAddCove,
}: {
  area: EstimateArea
  section: EstimateAreaMeasurement
  disabled: boolean
  canDelete: boolean
  /** Only true on Floor-area sections (and when the user has create perms).
   *  Drives whether the "+" icon for adding a cove appears next to the kebab. */
  canAddCove: boolean
  onSave: (patch: {
    section_name?: string
    length?: number | null
    width?: number | null
    total?: number | null
    input_mode?: EstimateSectionInputMode
  }) => void
  onDelete: () => void
  onAddCove: () => void
}) {
  const linear = isLinear(area.area_type)

  const [name, setName] = useState(section.section_name ?? '')
  const [length, setLength] = useState<string>(
    section.length === null || section.length === undefined ? '' : String(section.length)
  )
  const [width, setWidth] = useState<string>(
    section.width === null || section.width === undefined ? '' : String(section.width)
  )
  const [totalInput, setTotalInput] = useState<string>(
    section.total === null || section.total === undefined ? '' : String(section.total)
  )

  // Resync local state when the row updates from outside (e.g. rollback, or
  // when the server normalizes a save).
  useEffect(() => {
    setName(section.section_name ?? '')
    setLength(section.length === null || section.length === undefined ? '' : String(section.length))
    setWidth(section.width === null || section.width === undefined ? '' : String(section.width))
    setTotalInput(section.total === null || section.total === undefined ? '' : String(section.total))
  }, [section.section_name, section.length, section.width, section.total, section.input_mode])

  function parseNum(s: string): number | null {
    if (s.trim() === '') return null
    const n = Number(s)
    if (Number.isNaN(n)) return null
    return n
  }

  // Live preview: when both Length and Width have valid values, the Total
  // cell mirrors the product as the user types. We keep totalInput in sync
  // via the length/width onChange handlers so the displayed value stays
  // coherent; if the user types directly in Total, that override sticks
  // until length or width is edited again.
  function handleLengthChange(next: string) {
    setLength(next)
    const l = parseNum(next)
    const w = parseNum(width)
    if (l !== null && (linear || w !== null)) {
      const product = linear ? l : l * (w ?? 0)
      setTotalInput(String(product))
    } else {
      setTotalInput('')
    }
  }
  function handleWidthChange(next: string) {
    setWidth(next)
    const l = parseNum(length)
    const w = parseNum(next)
    if (l !== null && w !== null) {
      setTotalInput(String(l * w))
    } else {
      setTotalInput('')
    }
  }

  const kebabItems: KebabMenuItem[] = []
  if (canDelete) {
    kebabItems.push({
      label: 'Delete',
      icon: <Trash2Icon size={13} />,
      destructive: true,
      onSelect: onDelete,
    })
  }

  // Per-field commit. Each handler knows which field was just blurred and
  // derives input_mode implicitly:
  //   - name only → preserve current input_mode, patch section_name
  //   - length / width → input_mode = 'dimensioned', recompute total
  //   - total → input_mode = 'total_only' if any value entered; if both L
  //             and W have values, keep them as reference; otherwise null
  //             them out per the brief's rule
  //   - all three empty → input_mode = 'dimensioned' with all nulls
  function commitName() {
    if ((name ?? '') === (section.section_name ?? '')) return
    onSave({ section_name: name })
  }
  function commitLength() {
    const l = parseNum(length)
    const w = parseNum(width)
    const t = parseNum(totalInput)
    if (l === null && w === null && t === null) {
      onSave({ length: null, width: null, total: null, input_mode: 'dimensioned' })
      return
    }
    const computed = linear
      ? (l ?? 0)
      : ((l ?? 0) * (w ?? 0))
    onSave({
      length: l,
      width: linear ? null : w,
      total: computed,
      input_mode: 'dimensioned',
    })
  }
  function commitWidth() {
    const l = parseNum(length)
    const w = parseNum(width)
    const t = parseNum(totalInput)
    if (l === null && w === null && t === null) {
      onSave({ length: null, width: null, total: null, input_mode: 'dimensioned' })
      return
    }
    onSave({
      length: l,
      width: linear ? null : w,
      total: linear ? (l ?? 0) : ((l ?? 0) * (w ?? 0)),
      input_mode: 'dimensioned',
    })
  }
  function commitTotal() {
    const l = parseNum(length)
    const w = parseNum(width)
    const t = parseNum(totalInput)
    if (l === null && w === null && t === null) {
      onSave({ length: null, width: null, total: null, input_mode: 'dimensioned' })
      return
    }
    if (!linear && l !== null && w !== null) {
      // Both dimensions present — keep them as reference, total direct.
      onSave({ length: l, width: w, total: t, input_mode: 'total_only' })
      return
    }
    // Otherwise the direct total wins; dimensions are not used.
    onSave({ length: null, width: null, total: t, input_mode: 'total_only' })
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const inputBase =
    'w-20 text-sm bg-transparent border-b focus:outline-none px-0.5 py-0.5 text-right'
  const activeInputCls =
    'text-gray-700 dark:text-[#e5e5e5] border-transparent focus:border-amber-400'
  const disabledInputCls =
    'text-gray-400 dark:text-[#6b6b6b] border-transparent cursor-not-allowed'

  return (
    <tr>
      <td className="py-2 pr-3">
        <div className="inline-flex items-center gap-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={onKey}
            disabled={disabled}
            placeholder="Section name"
            className="w-40 max-w-full text-sm text-gray-700 dark:text-[#e5e5e5] bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 disabled:cursor-default"
          />
          {canAddCove && (
            <Tooltip label="Add cove" placement="top">
              <button
                type="button"
                onClick={onAddCove}
                aria-label="Add cove"
                className="inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-[#a0a0a0] dark:hover:text-white dark:hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </td>
      {!linear && (
        <>
          <td className="py-2 pr-3 text-right">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={length}
              onChange={(e) => handleLengthChange(e.target.value)}
              onBlur={commitLength}
              onKeyDown={onKey}
              disabled={disabled}
              placeholder="—"
              className={`${inputBase} ${disabled ? disabledInputCls : activeInputCls}`}
            />
          </td>
          <td className="py-2 pr-3 text-right">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={width}
              onChange={(e) => handleWidthChange(e.target.value)}
              onBlur={commitWidth}
              onKeyDown={onKey}
              disabled={disabled}
              placeholder="—"
              className={`${inputBase} ${disabled ? disabledInputCls : activeInputCls}`}
            />
          </td>
        </>
      )}
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={totalInput}
          onChange={(e) => setTotalInput(e.target.value)}
          onBlur={commitTotal}
          onKeyDown={onKey}
          disabled={disabled}
          className={`${inputBase} font-medium ${disabled ? disabledInputCls : 'text-gray-900 dark:text-white border-transparent focus:border-amber-400'}`}
        />
      </td>
      <td className="py-2 text-right">
        {kebabItems.length > 0 && (
          <KebabMenu variant="light" title="Section actions" items={kebabItems} />
        )}
      </td>
    </tr>
  )
}

/** A single cove line under a Floor-area section. One length input + delete. */
function CoveLineRow({
  cove,
  disabled,
  canDelete,
  onSaveLength,
  onSaveName,
  onDelete,
}: {
  cove: EstimateSectionCove
  disabled: boolean
  canDelete: boolean
  onSaveLength: (nextLength: number | null) => void
  onSaveName: (nextName: string | null) => void
  onDelete: () => void
}) {
  const [lengthInput, setLengthInput] = useState<string>(
    cove.cove_length === null || cove.cove_length === undefined ? '' : String(cove.cove_length)
  )
  const [nameInput, setNameInput] = useState<string>(cove.name ?? '')

  useEffect(() => {
    setLengthInput(cove.cove_length === null || cove.cove_length === undefined ? '' : String(cove.cove_length))
  }, [cove.cove_length])
  useEffect(() => {
    setNameInput(cove.name ?? '')
  }, [cove.name])

  function parseNum(s: string): number | null {
    if (s.trim() === '') return null
    const n = Number(s)
    if (Number.isNaN(n)) return null
    return n
  }
  function commitLength() {
    onSaveLength(parseNum(lengthInput))
  }
  function commitName() {
    const trimmed = nameInput.trim()
    onSaveName(trimmed === '' ? null : trimmed)
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const kebabItems: KebabMenuItem[] = []
  if (canDelete) {
    kebabItems.push({
      label: 'Delete',
      icon: <Trash2Icon size={13} />,
      destructive: true,
      onSelect: onDelete,
    })
  }

  const coveBadgeCls = AREA_TYPE_STYLES.cove.className

  return (
    <tr>
      <td colSpan={3} className="py-1.5 pr-3 pl-6">
        <div className="inline-flex items-center gap-2 min-w-0 max-w-full">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${coveBadgeCls}`}
          >
            Cove
          </span>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={onKey}
            disabled={disabled}
            placeholder="Add label"
            data-plain-text
            // Matches AreaNameInput's plain-text-at-rest pattern: transparent
            // surface at rest, hover tint, focus chrome via Tailwind utilities.
            // Opt out of the global dark-input chrome rule via data-plain-text.
            className={[
              'flex-1 min-w-0 text-sm font-medium text-gray-700 dark:text-[#e5e5e5]',
              'bg-transparent border border-transparent rounded px-1.5 py-0.5',
              disabled ? 'cursor-default' : 'cursor-text hover:bg-gray-100 dark:hover:bg-[#2e2e2e]',
              'focus:bg-white dark:focus:bg-[#1f1f1f] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:hover:bg-transparent',
            ].join(' ')}
          />
        </div>
      </td>
      <td className="py-1.5 pr-3 text-right">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={lengthInput}
          onChange={(e) => setLengthInput(e.target.value)}
          onBlur={commitLength}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder="—"
          className={`w-20 text-sm bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 text-right font-medium ${disabled ? 'text-gray-400 dark:text-[#6b6b6b] cursor-not-allowed' : 'text-gray-900 dark:text-white'}`}
        />
      </td>
      <td className="py-1.5 text-right">
        {kebabItems.length > 0 && (
          <KebabMenu variant="light" title="Cove actions" items={kebabItems} />
        )}
      </td>
    </tr>
  )
}
