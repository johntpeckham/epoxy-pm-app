'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/usePermissions'
import KebabMenu, { type KebabMenuItem } from '@/components/ui/KebabMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { AREA_TYPE_STYLES } from '../../types'
import type { EstimateArea, EstimateAreaMeasurement, EstimateAreaType } from '../../types'
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
  setAreas: React.Dispatch<React.SetStateAction<EstimateArea[]>>
  setSections: React.Dispatch<React.SetStateAction<EstimateAreaMeasurement[]>>
  reportAutoSave: (s: AutoSaveState) => void
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

function unitForType(type: EstimateAreaType): 'SF' | 'LF' {
  return type === 'cove' ? 'LF' : 'SF'
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
  setAreas,
  setSections,
  reportAutoSave,
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

  // ── Add cove area linked to a parent floor ───────────────────────────────
  async function addCoveLinkedTo(parentFloor: EstimateArea) {
    const nextSortOrder = (areas[areas.length - 1]?.sort_order ?? 0) + 1
    const result = await withAutoSave(async () => {
      const { data: insertedArea, error: areaErr } = await supabase
        .from('estimate_areas')
        .insert({
          estimate_id: estimateId,
          area_type: 'cove',
          name: `Cove — ${parentFloor.name || 'floor'}`,
          parent_area_id: parentFloor.id,
          sort_order: nextSortOrder,
        })
        .select()
        .single()
      if (areaErr || !insertedArea) {
        console.error('Failed to create cove area', { code: areaErr?.code, message: areaErr?.message, hint: areaErr?.hint, details: areaErr?.details })
        throw new Error(areaErr?.message ?? 'Failed to create cove area.')
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
        console.error('Failed to seed cove section', { code: secErr?.code, message: secErr?.message, hint: secErr?.hint, details: secErr?.details })
        const { error: rbErr } = await supabase.from('estimate_areas').delete().eq('id', area.id)
        if (rbErr) console.error('Rollback: failed to delete orphaned cove area', { code: rbErr.code, message: rbErr.message })
        throw new Error(secErr?.message ?? 'Failed to seed cove section.')
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

  // ── Save an area's editable fields (just name in Phase 2) ────────────────
  async function saveAreaName(area: EstimateArea, nextName: string) {
    const trimmed = nextName.trim()
    if (trimmed === area.name) return
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
  async function saveSection(
    section: EstimateAreaMeasurement,
    next: { section_name?: string; length?: number | null; width?: number | null }
  ) {
    const area = areas.find((a) => a.id === section.area_id)
    if (!area) return
    const nextLength = next.length !== undefined ? next.length : section.length
    const nextWidth = isLinear(area.area_type) ? null : (next.width !== undefined ? next.width : section.width)
    const nextName = next.section_name !== undefined ? next.section_name : section.section_name
    const total = isLinear(area.area_type)
      ? (typeof nextLength === 'number' ? nextLength : 0)
      : ((typeof nextLength === 'number' ? nextLength : 0) * (typeof nextWidth === 'number' ? nextWidth : 0))
    const patch: Partial<EstimateAreaMeasurement> = {
      section_name: nextName ?? null,
      length: typeof nextLength === 'number' ? nextLength : 0,
      width: nextWidth,
      total,
    }
    // No-op short-circuit: skip if nothing actually changed.
    if (
      patch.section_name === section.section_name &&
      patch.length === section.length &&
      patch.width === section.width &&
      patch.total === section.total
    ) {
      return
    }
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
    const target = deleteAreaTarget
    setDeleting(true)
    const ok = await withAutoSave(async () => {
      // FK cascade handles section cleanup, but be explicit for clarity.
      const { error } = await supabase.from('estimate_areas').delete().eq('id', target.id)
      if (error) {
        console.error('Failed to delete area', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (ok) {
      setAreas((prev) => prev.filter((a) => a.id !== target.id))
      setSections((prev) => prev.filter((s) => s.area_id !== target.id))
    }
    setDeleting(false)
    setDeleteAreaTarget(null)
  }

  async function confirmDeleteSection() {
    if (!deleteSectionTarget) return
    const target = deleteSectionTarget
    setDeleting(true)
    const ok = await withAutoSave(async () => {
      const { error } = await supabase.from('estimate_area_measurements').delete().eq('id', target.id)
      if (error) {
        console.error('Failed to delete section', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message)
      }
      return true
    })
    if (ok) {
      setSections((prev) => prev.filter((s) => s.id !== target.id))
    }
    setDeleting(false)
    setDeleteSectionTarget(null)
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
      {areas.length === 0 && (
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

      {/* Area cards */}
      {areas.map((area) => {
        const style = AREA_TYPE_STYLES[area.area_type]
        const unit = unitForType(area.area_type)
        const areaRows = sectionsByArea.get(area.id) ?? []
        const total = areaTotal(area)
        const sectionCount = areaRows.length

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
          <div key={area.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
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
                <span className="text-xs text-gray-400 hidden sm:inline">
                  {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {formatTotal(total)} {unit}
                </span>
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
                    <th className="pb-2 pr-3 font-medium text-right">Length</th>
                    {!isLinear(area.area_type) && (
                      <th className="pb-2 pr-3 font-medium text-right">Width</th>
                    )}
                    <th className="pb-2 pr-3 font-medium text-right">Total</th>
                    <th className="pb-2 font-medium text-right w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {areaRows.map((s) => (
                    <SectionRow
                      key={s.id}
                      area={area}
                      section={s}
                      disabled={!canEditAreas}
                      canDelete={canDelete}
                      onSave={(patch) => saveSection(s, patch)}
                      onDelete={() => setDeleteSectionTarget(s)}
                    />
                  ))}
                  {areaRows.length === 0 && (
                    <tr>
                      <td colSpan={isLinear(area.area_type) ? 4 : 5} className="py-3 text-xs text-gray-400 italic">
                        No sections yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {canCreateAreas && (
                <button
                  type="button"
                  onClick={() => addSectionTo(area)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add section
                </button>
              )}
              {canCreateAreas && area.area_type === 'floor' && (
                <button
                  type="button"
                  onClick={() => addCoveLinkedTo(area)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 transition"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add cove to this floor
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Delete confirmation dialogs */}
      {deleteAreaTarget && (
        <ConfirmDialog
          title="Delete area"
          message={`Delete "${deleteAreaTarget.name || untitledFor(deleteAreaTarget.area_type)}"? This will also delete its sections. This cannot be undone.`}
          confirmLabel="Delete area"
          onConfirm={confirmDeleteArea}
          onCancel={() => setDeleteAreaTarget(null)}
          loading={deleting}
        />
      )}
      {deleteSectionTarget && (
        <ConfirmDialog
          title="Delete section"
          message="Delete this section? This cannot be undone."
          confirmLabel="Delete section"
          onConfirm={confirmDeleteSection}
          onCancel={() => setDeleteSectionTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Subcomponents — kept inline for proximity to the tab logic                 */
/* ────────────────────────────────────────────────────────────────────────── */

function AreaNameInput({
  area,
  autoFocus,
  onConsumeFocus,
  disabled,
  onSave,
}: {
  area: EstimateArea
  autoFocus: boolean
  onConsumeFocus: () => void
  disabled: boolean
  onSave: (name: string) => void
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
      className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 min-w-0 flex-1 disabled:cursor-default"
    />
  )
}

function SectionRow({
  area,
  section,
  disabled,
  canDelete,
  onSave,
  onDelete,
}: {
  area: EstimateArea
  section: EstimateAreaMeasurement
  disabled: boolean
  canDelete: boolean
  onSave: (patch: { section_name?: string; length?: number | null; width?: number | null }) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(section.section_name ?? '')
  const [length, setLength] = useState<string>(
    section.length === null || section.length === undefined ? '' : String(section.length)
  )
  const [width, setWidth] = useState<string>(
    section.width === null || section.width === undefined ? '' : String(section.width)
  )

  // Resync local state when the row updates from outside (e.g. rollback).
  useEffect(() => {
    setName(section.section_name ?? '')
    setLength(section.length === null || section.length === undefined ? '' : String(section.length))
    setWidth(section.width === null || section.width === undefined ? '' : String(section.width))
  }, [section.section_name, section.length, section.width])

  function parseNum(s: string): number | null {
    if (s.trim() === '') return null
    const n = Number(s)
    if (Number.isNaN(n)) return null
    return n
  }

  // Live total (display only — commit happens on blur via saveSection).
  const liveTotal = (() => {
    const l = parseNum(length)
    const w = parseNum(width)
    if (isLinear(area.area_type)) return l ?? 0
    return (l ?? 0) * (w ?? 0)
  })()

  const kebabItems: KebabMenuItem[] = []
  if (canDelete) {
    kebabItems.push({
      label: 'Delete',
      icon: <Trash2Icon size={13} />,
      destructive: true,
      onSelect: onDelete,
    })
  }

  function commitName() {
    onSave({ section_name: name })
  }
  function commitLength() {
    onSave({ length: parseNum(length) })
  }
  function commitWidth() {
    onSave({ width: parseNum(width) })
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <tr>
      <td className="py-2 pr-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder="Section name"
          className="w-full text-sm text-gray-700 bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 disabled:cursor-default"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          onBlur={commitLength}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder="0"
          className="w-20 text-sm text-gray-700 bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 text-right disabled:cursor-default"
        />
      </td>
      {!isLinear(area.area_type) && (
        <td className="py-2 pr-3 text-right">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            onBlur={commitWidth}
            onKeyDown={onKey}
            disabled={disabled}
            placeholder="0"
            className="w-20 text-sm text-gray-700 bg-transparent border-b border-transparent focus:border-amber-400 focus:outline-none px-0.5 py-0.5 text-right disabled:cursor-default"
          />
        </td>
      )}
      <td className="py-2 pr-3 text-right text-sm font-medium text-gray-900">
        {formatTotal(liveTotal)}
      </td>
      <td className="py-2 text-right">
        {kebabItems.length > 0 && (
          <KebabMenu variant="light" title="Section actions" items={kebabItems} />
        )}
      </td>
    </tr>
  )
}
