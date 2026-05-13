'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, Trash2Icon, Pencil, Plus, GripVerticalIcon } from 'lucide-react'
import KebabMenu from '@/components/ui/KebabMenu'
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TakeoffItem, MeasurementType, TakeoffSection } from './types'
import { ITEM_COLORS } from './TakeoffViewer'
import {
  computeProjectTotals,
  computeTotals,
  groupItemsBySection,
  sortSections,
} from './sectionTotals'

interface TakeoffSidebarProps {
  items: TakeoffItem[]
  sections: TakeoffSection[]
  /** Sidebar selection (for visual highlight + PDF dim-others). */
  selectedItemId: string | null
  /** Toggle selection on row body click. */
  onSelectItem: (id: string) => void
  /** Open the new-measurement panel pre-populated for this existing item
   *  (locked Linear/Area toggle, editable name/color). */
  onAddMoreToItem: (id: string) => void
  onAddItem: (name: string, type: MeasurementType, color?: string, sectionId?: string) => void
  onDeleteItem: (id: string) => void
  onRenameItem: (id: string, name: string) => void
  onChangeItemColor: (id: string, color: string) => void
  onDeleteMeasurement: (itemId: string, measurementId: string) => void
  /** Section CRUD wired in TakeoffClient. */
  onCreateSection: (name: string) => string
  onRenameSection: (id: string, name: string) => void
  onDeleteSection: (id: string) => void
  onReorderSections: (orderedIds: string[]) => void
  onReorderItemsInSections: (
    sectionIdToOrderedItemIds: Record<string, string[]>
  ) => void
  // Parent tracks panel-open state to gate PDF click placement and to drive
  // the Escape-with-in-progress-points behavior.
  isPanelOpen: boolean
  onPanelOpenChange: (open: boolean) => void
  isMeasuringActive: boolean
  // Id of the item created in the current "+" panel session, if any. While
  // set, this item is hidden from the saved list and its live tally is
  // rendered inline in the panel.
  panelSessionItemId: string | null
  /** When set, the panel is in "add more shapes to an existing item" mode.
   *  The Linear/Area toggle is locked; name/color stay editable. */
  panelEditingItemId: string | null
  // Number of currently-placing points (the in-progress shape under the
  // panel-session item). Used to gate Finish Measuring.
  tempPointsCount: number
  // Finalize the panel-session item: close the panel; the item stays in
  // `items` and surfaces in the saved list.
  onFinishMeasuring: () => void
}

function fmtArea(sf: number): string {
  return sf >= 1000
    ? `${sf.toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft`
    : `${sf.toFixed(1)} sq ft`
}

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

function ColorSwatches({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ITEM_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(c) }}
          className="w-5 h-5 rounded-full flex-shrink-0 transition-all"
          style={{
            backgroundColor: c,
            boxShadow: selected === c ? `0 0 0 2px #111, 0 0 0 4px ${c}` : 'none',
            transform: selected === c ? 'scale(1.1)' : 'scale(1)',
          }}
          title={c}
        />
      ))}
    </div>
  )
}

// ─── Sortable wrappers ─────────────────────────────────────────────────
// Inline so the row/section render logic stays close to the sidebar.
// Each takes a render-prop `children` so the rich row/section body lives
// in one place (the sidebar return JSX) — the wrappers only own the
// dnd-kit hook + drag-handle styling.

function SortableMeasurementRow({
  itemId,
  draggable,
  children,
}: {
  itemId: string
  draggable: boolean
  children: (handle: {
    setActivatorRef: (el: HTMLElement | null) => void
    listeners: ReturnType<typeof useSortable>['listeners']
    attributes: ReturnType<typeof useSortable>['attributes']
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId, disabled: !draggable })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
    background: isDragging ? '#1a1a1a' : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ setActivatorRef: setActivatorNodeRef, listeners, attributes })}
    </div>
  )
}

function SortableSection({
  sectionId,
  draggable,
  children,
}: {
  sectionId: string
  draggable: boolean
  children: (handle: {
    setActivatorRef: (el: HTMLElement | null) => void
    listeners: ReturnType<typeof useSortable>['listeners']
    attributes: ReturnType<typeof useSortable>['attributes']
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId, disabled: !draggable })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 60 : undefined,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ setActivatorRef: setActivatorNodeRef, listeners, attributes })}
    </div>
  )
}

function buildSectionMapWithItemMoved(
  sortedSections: TakeoffSection[],
  itemsBySectionId: Map<string, TakeoffItem[]>,
  itemId: string,
  destSectionId: string
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const s of sortedSections) {
    next[s.id] = (itemsBySectionId.get(s.id) ?? [])
      .map((it) => it.id)
      .filter((id) => id !== itemId)
  }
  if (!next[destSectionId]) next[destSectionId] = []
  if (!next[destSectionId].includes(itemId)) next[destSectionId].push(itemId)
  return next
}

export default function TakeoffSidebar({
  items,
  sections,
  selectedItemId,
  onSelectItem,
  onAddMoreToItem,
  onAddItem,
  onDeleteItem,
  onRenameItem,
  onChangeItemColor,
  onDeleteMeasurement,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onReorderSections,
  onReorderItemsInSections,
  isPanelOpen,
  onPanelOpenChange,
  isMeasuringActive,
  panelSessionItemId,
  panelEditingItemId,
  tempPointsCount,
  onFinishMeasuring,
}: TakeoffSidebarProps) {
  const showAdd = isPanelOpen
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MeasurementType>('linear')
  const [newColor, setNewColor] = useState(ITEM_COLORS[0])
  // Section dropdown selection in the panel. Default-selection logic
  // applied via the openTransition useEffect below.
  const [newSectionId, setNewSectionId] = useState<string>('')
  const isEditingExisting = panelEditingItemId !== null

  // Inline rename state for sections.
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const sectionEditInputRef = useRef<HTMLInputElement | null>(null)

  // ─── Sections + items grouping + totals ──────────────────────────────
  // panelSessionItemId is filtered out of the saved list while the panel
  // is open (its tally renders inline in the panel instead).
  const visibleItems = useMemo(() => {
    return panelSessionItemId
      ? items.filter((it) => it.id !== panelSessionItemId)
      : items
  }, [items, panelSessionItemId])

  const sortedSections = useMemo(() => sortSections(sections), [sections])

  // Group items by sectionId. Shared helper so all surfaces produce
  // identical groupings.
  const itemsBySectionId = useMemo(
    () => groupItemsBySection(sortedSections, visibleItems),
    [visibleItems, sortedSections]
  )

  const projectTotals = useMemo(
    () => computeProjectTotals(visibleItems),
    [visibleItems]
  )

  // ─── DnD ─────────────────────────────────────────────────────────────
  // PointerSensor with an 8px activation distance keeps inline-rename
  // clicks on item names from accidentally starting a drag.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Section reorder.
  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = sortedSections.map((s) => s.id)
    const fromIndex = ids.indexOf(active.id as string)
    const toIndex = ids.indexOf(over.id as string)
    if (fromIndex < 0 || toIndex < 0) return
    onReorderSections(arrayMove(ids, fromIndex, toIndex))
  }

  // Item reorder within a section. Items can be reordered within the same
  // section; cross-section moves are exposed via a separate "Move to…"
  // affordance on hover (the dropdown in the new-measurement add-to-
  // existing panel covers the deliberate-edit case). Item-to-item drag
  // across sections is also supported here when the drop target's
  // sortable id is in another section's SortableContext.
  function handleItemDragEnd(sectionId: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return
      const sourceItems = itemsBySectionId.get(sectionId) ?? []
      const sourceIds = sourceItems.map((it) => it.id)
      // Same-section reorder.
      if (sourceIds.includes(over.id as string)) {
        const fromIndex = sourceIds.indexOf(active.id as string)
        const toIndex = sourceIds.indexOf(over.id as string)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
        const reordered = arrayMove(sourceIds, fromIndex, toIndex)
        const next: Record<string, string[]> = {}
        for (const s of sortedSections) {
          next[s.id] =
            s.id === sectionId
              ? reordered
              : (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
        }
        onReorderItemsInSections(next)
        return
      }
      // Cross-section drop — `over.id` is either an item id in another
      // section or a section id (when hovering an empty section).
      let destSectionId: string | null = null
      let destInsertIdx = 0
      const overAsSection = sortedSections.find((s) => s.id === over.id)
      if (overAsSection) {
        destSectionId = overAsSection.id
        destInsertIdx = (itemsBySectionId.get(destSectionId) ?? []).length
      } else {
        for (const s of sortedSections) {
          if (s.id === sectionId) continue
          const ids = (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
          const idx = ids.indexOf(over.id as string)
          if (idx >= 0) {
            destSectionId = s.id
            destInsertIdx = idx
            break
          }
        }
      }
      if (!destSectionId) return
      const next: Record<string, string[]> = {}
      for (const s of sortedSections) next[s.id] = (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
      next[sectionId] = next[sectionId].filter((id) => id !== active.id)
      const destIds = next[destSectionId].slice()
      destIds.splice(destInsertIdx, 0, active.id as string)
      next[destSectionId] = destIds
      onReorderItemsInSections(next)
    }
  }

  // When the panel transitions into "add to existing" mode (the user clicked
  // the "+" icon on a saved row), pre-populate the form fields from the
  // item's current values. We key this on the item id changing, not on
  // every render, so user edits to name/color while the panel is open are
  // preserved.
  useEffect(() => {
    if (!isEditingExisting) return
    const item = items.find((it) => it.id === panelEditingItemId)
    if (!item) return
    setNewName(item.name)
    setNewType(item.type)
    setNewColor(item.color)
    setNewSectionId(item.sectionId || sortedSections[0]?.id || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelEditingItemId])

  // When the panel opens for a NEW item (top "+" button), default the
  // section dropdown to the currently-selected saved row's section if
  // any, else the first section.
  const prevPanelOpenRef = useRef(false)
  useEffect(() => {
    if (isPanelOpen && !prevPanelOpenRef.current && !isEditingExisting) {
      const fromSelected = selectedItemId
        ? items.find((it) => it.id === selectedItemId)?.sectionId
        : null
      setNewSectionId(fromSelected || sortedSections[0]?.id || '')
    }
    prevPanelOpenRef.current = isPanelOpen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen])

  // Mirror the panel's section dropdown onto the in-progress item while
  // editing-existing (so a section change is reflected immediately in
  // the grouped list — Cancel still restores via the snapshot path in
  // the parent).
  useEffect(() => {
    if (!isEditingExisting || !panelEditingItemId) return
    if (!newSectionId) return
    onReorderItemsInSections(
      buildSectionMapWithItemMoved(
        sortedSections,
        itemsBySectionId,
        panelEditingItemId,
        newSectionId
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSectionId, panelEditingItemId])

  // Mirror name/color edits made in the panel onto the live item while
  // editing-existing, so the live tally header (and the PDF stroke color)
  // reflect the user's choices in real time. Skipped while the panel is
  // closed or while creating a brand-new item (which has its own
  // creation-on-Start-Measuring flow).
  useEffect(() => {
    if (!isEditingExisting || !panelEditingItemId) return
    const trimmed = newName.trim()
    if (trimmed) onRenameItem(panelEditingItemId, trimmed)
    onChangeItemColor(panelEditingItemId, newColor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newName, newColor, panelEditingItemId])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // Inline blocking message for "Finish Measuring while shape in progress".
  // Auto-dismiss after 2.5s. We hide the message at render time when the
  // in-progress shape is gone (tempPointsCount === 0) so Enter/Escape feel
  // instant; the 2.5s timer is the long-tail dismissal for the case where
  // the user keeps clicking Finish without resolving the shape.
  const [blockMessage, setBlockMessage] = useState<string | null>(null)
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showBlockMessage(text: string) {
    setBlockMessage(text)
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current)
    blockTimerRef.current = setTimeout(() => setBlockMessage(null), 2500)
  }
  useEffect(() => {
    return () => {
      if (blockTimerRef.current) clearTimeout(blockTimerRef.current)
    }
  }, [])

  // The in-progress item is rendered inline in the panel and excluded from
  // the saved list. Until the user clicks Finish Measuring it should not
  // appear in the saved list at all.
  const sessionItem = panelSessionItemId
    ? items.find((it) => it.id === panelSessionItemId) ?? null
    : null

  // "Start Measuring" — creates the item if needed and arms PDF click
  // placement, but keeps the config panel open with form state intact so the
  // user can re-arm via Escape (which clears in-progress points).
  function handleStartMeasuring() {
    if (!newName.trim()) return
    // If zero sections exist (unusual: user deleted them all and the
    // auto-create hasn't completed yet), let the create flow run with
    // undefined section — TakeoffViewer's handleAddItem will fall back
    // to whatever sections[0] resolves to client-side.
    onAddItem(
      newName.trim(),
      newType,
      newColor,
      newSectionId || sortedSections[0]?.id
    )
  }

  // "Finish Measuring" — only valid in the "actively measuring" mode.
  // Blocked when there's an in-progress shape with placed points; in that
  // case we surface an inline auto-dismissing message instead of finalizing.
  function handleFinishMeasuring() {
    if (tempPointsCount > 0) {
      showBlockMessage('Complete or cancel current shape first')
      return
    }
    onFinishMeasuring()
    setNewName('')
    setNewType('linear')
    setNewColor(ITEM_COLORS[0])
  }

  function handleCancel() {
    setNewName('')
    setNewType('linear')
    setNewColor(ITEM_COLORS[0])
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current)
    setBlockMessage(null)
    onPanelOpenChange(false)
  }

  function handleTogglePanel() {
    if (isPanelOpen) {
      handleCancel()
    } else {
      onPanelOpenChange(true)
    }
  }

  function startRename(item: TakeoffItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditColor(item.color)
  }

  function finishRename(id: string) {
    if (editName.trim()) onRenameItem(id, editName.trim())
    if (editColor && editColor !== items.find(i => i.id === id)?.color) {
      onChangeItemColor(id, editColor)
    }
    setEditingId(null)
  }

  return (
    <div className="w-[325px] flex-shrink-0 bg-neutral-900 border-l border-neutral-800 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="px-3 pt-2.5 pb-3.5 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="text-gray-300 font-semibold text-xs tracking-wide uppercase">Measurement Items</span>
        <button
          onClick={handleTogglePanel}
          className="w-6 h-6 flex items-center justify-center rounded bg-amber-500 hover:bg-amber-400 text-white transition-colors"
          title="Add Item"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Inline add form */}
      {showAdd && (
        <div className="px-3 py-2.5 border-b border-neutral-800 space-y-2 flex-shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStartMeasuring()}
            placeholder="Item name"
            className="w-full px-2.5 py-1.5 bg-[#222] border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          {/* Color swatches */}
          <ColorSwatches selected={newColor} onSelect={setNewColor} />
          {/* Type pill toggle. Locked when editing-existing — type is a
              property of the item itself; switching it would invalidate the
              already-stored shapes' geometry. */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { if (!isEditingExisting) setNewType('linear') }}
              disabled={isEditingExisting}
              aria-disabled={isEditingExisting}
              className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                newType === 'linear'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'bg-[#222] text-gray-500 border border-gray-700 hover:text-gray-300'
              } ${isEditingExisting && newType !== 'linear' ? 'opacity-40 cursor-not-allowed' : ''} ${isEditingExisting ? 'cursor-not-allowed' : ''}`}
            >
              Linear
            </button>
            <button
              onClick={() => { if (!isEditingExisting) setNewType('area') }}
              disabled={isEditingExisting}
              aria-disabled={isEditingExisting}
              className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                newType === 'area'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'bg-[#222] text-gray-500 border border-gray-700 hover:text-gray-300'
              } ${isEditingExisting && newType !== 'area' ? 'opacity-40 cursor-not-allowed' : ''} ${isEditingExisting ? 'cursor-not-allowed' : ''}`}
            >
              Area
            </button>
          </div>

          {/* Section dropdown — placed between the type toggle and the
              Finish/Cancel buttons per spec. In add-to-existing mode the
              default is the existing item's section; in new-item mode the
              default is the selected row's section if any, else the
              first section. Editable in both modes. */}
          {sortedSections.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Section</label>
              <select
                value={newSectionId}
                onChange={(e) => setNewSectionId(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 bg-[#222] border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {sortedSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={isMeasuringActive ? handleFinishMeasuring : handleStartMeasuring}
              disabled={!isMeasuringActive && !newName.trim()}
              className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/40 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
            >
              {isMeasuringActive ? 'Finish Measuring' : 'Start Measuring'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Inline blocking-message slot. Subtle warning tone, auto-dismiss
              after 2.5s, and hidden the moment the in-progress shape clears
              (Enter / Escape) so feedback feels instant. */}
          {blockMessage && tempPointsCount > 0 && (
            <div role="status" className="text-[11px] text-amber-300/90 leading-snug">
              {blockMessage}
            </div>
          )}

          {/* Live tally for the in-progress (panel-session) item.
              Only shown once at least one shape has been completed. */}
          {sessionItem && sessionItem.measurements.length > 0 && (() => {
            const total = sessionItem.measurements.reduce((s, m) => s + m.valueInFeet, 0)
            const totalPerim = sessionItem.type === 'area'
              ? sessionItem.measurements.reduce((s, m) => s + (m.perimeterFt || 0), 0)
              : 0
            const count = sessionItem.measurements.length
            return (
              <div className="rounded border border-gray-800 bg-[#0c0c0c] px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500">
                  <span>{count} {sessionItem.type === 'linear' ? 'segment' : 'shape'}{count === 1 ? '' : 's'}</span>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${
                    sessionItem.type === 'linear'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-green-500/15 text-green-400'
                  }`}>
                    {sessionItem.type === 'linear' ? 'LINEAR' : 'AREA'}
                  </span>
                </div>
                <div className="text-[12px] font-bold text-amber-400">
                  Total: {sessionItem.type === 'linear' ? fmtFtIn(total) : `${total.toFixed(1)} sq ft`}
                </div>
                {sessionItem.type === 'area' && totalPerim > 0 && (
                  <div className="text-[10px] font-medium text-gray-400">
                    {fmtFtIn(totalPerim)} perim.
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !showAdd && (
          <div className="px-4 py-10 text-center">
            <p className="text-gray-600 text-xs">Click + to add your first measurement item</p>
          </div>
        )}

        {/* Stronger divider + section header — only when the config panel
            is open AND there is at least one already-saved item. */}
        {showAdd && visibleItems.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-t-2 border-zinc-700">
            <span className="text-gray-300 font-semibold text-xs tracking-wide uppercase">
              Saved Measurements
            </span>
          </div>
        )}

        {/* Outer DndContext: sections sortable relative to each other. */}
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={sortedSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {sortedSections.map((section) => {
              const sectionItems = itemsBySectionId.get(section.id) ?? []
              const sub = computeTotals(sectionItems)
              const subLinear = sub.linear
              const subArea = sub.area
              const isRenamingThis = editingSectionId === section.id
              const sectionDraggable = sortedSections.length > 1
              return (
                <SortableSection key={section.id} sectionId={section.id} draggable={sectionDraggable}>
                  {({ setActivatorRef, listeners, attributes }) => (
                    <div>
                      {/* Section label row — flat, orange bar + white uppercase text */}
                      <div className="group relative flex items-center px-3 pt-[18px] pb-[12px]">
                        {sectionDraggable && (
                          <button
                            ref={setActivatorRef}
                            type="button"
                            {...listeners}
                            {...attributes}
                            aria-label="Drag to reorder section"
                            className="flex-shrink-0 mr-1 p-0.5 text-gray-300 cursor-grab active:cursor-grabbing touch-none opacity-40 group-hover:opacity-100 transition-opacity"
                          >
                            <GripVerticalIcon className="w-4 h-4" />
                          </button>
                        )}
                        <span aria-hidden="true" className="block w-[3px] h-[13px] bg-amber-500 rounded-[2px] flex-shrink-0 mr-2" />
                        {isRenamingThis ? (
                          <input
                            ref={(el) => { sectionEditInputRef.current = el }}
                            type="text"
                            value={editingSectionName}
                            onChange={(e) => setEditingSectionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onRenameSection(section.id, editingSectionName)
                                setEditingSectionId(null)
                              }
                              if (e.key === 'Escape') setEditingSectionId(null)
                            }}
                            onBlur={() => {
                              onRenameSection(section.id, editingSectionName)
                              setEditingSectionId(null)
                            }}
                            onFocus={(e) => e.target.select()}
                            autoFocus
                            className="flex-1 min-w-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-white bg-transparent border-b border-amber-500 outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingSectionId(section.id)
                              setEditingSectionName(section.name)
                            }}
                            className="flex-1 min-w-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-white truncate cursor-pointer hover:text-amber-400"
                          >
                            {section.name}
                          </span>
                        )}
                        <div className="flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                          <KebabMenu
                            variant="dark"
                            title="Section actions"
                            items={[
                              {
                                label: 'Rename',
                                icon: <Pencil size={13} />,
                                onSelect: () => {
                                  setEditingSectionId(section.id)
                                  setEditingSectionName(section.name)
                                },
                              },
                              {
                                label: 'Delete',
                                destructive: true,
                                icon: <Trash2Icon className="w-3.5 h-3.5" />,
                                onSelect: () => {
                                  const count = sectionItems.length
                                  const message =
                                    count > 0
                                      ? `Delete section "${section.name}" and all ${count} measurement${count === 1 ? '' : 's'} inside? This cannot be undone.`
                                      : `Delete section "${section.name}"?`
                                  if (typeof window !== 'undefined' && window.confirm(message)) {
                                    onDeleteSection(section.id)
                                  }
                                },
                              },
                            ]}
                          />
                        </div>
                      </div>

                      {/* Inner DndContext: items within this section. */}
                      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd(section.id)}>
                        <SortableContext items={sectionItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                          {sectionItems.length === 0 ? (
                            <div className="px-3 py-[10px] text-[11px] text-[#666] italic">
                              No measurements in this section
                            </div>
                          ) : (
                            sectionItems.map((item) => {
                              const isSelected = item.id === selectedItemId
                              const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
                              const itemPerim = item.type === 'area'
                                ? item.measurements.reduce((s, m) => s + (m.perimeterFt || 0), 0)
                                : 0
                              const isEditing = editingId === item.id
                              return (
                                <SortableMeasurementRow key={item.id} itemId={item.id} draggable={!isEditing}>
                                  {({ setActivatorRef, listeners, attributes }) => (
                                    <div
                                      onClick={() => onSelectItem(item.id)}
                                      className={`group cursor-pointer transition-colors ${
                                        isSelected
                                          ? 'bg-neutral-700/60 border-l-2 border-l-amber-500'
                                          : 'bg-transparent hover:bg-neutral-800/40 border-l-2 border-l-transparent'
                                      }`}
                                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                                    >
                                      <div className="flex items-center px-3 pt-[11px] pb-[11px] min-w-0">
                                        <button
                                          ref={setActivatorRef}
                                          type="button"
                                          {...listeners}
                                          {...attributes}
                                          aria-label="Drag to reorder measurement"
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex-shrink-0 mr-1 p-0.5 text-gray-300 cursor-grab active:cursor-grabbing touch-none opacity-40 group-hover:opacity-100 transition-opacity"
                                        >
                                          <GripVerticalIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <span
                                          className="rounded-full flex-shrink-0 mr-2"
                                          style={{ width: '7px', height: '7px', backgroundColor: item.color }}
                                        />
                                        {isEditing ? (
                                          <div className="flex-1 min-w-0 space-y-1.5">
                                            <input
                                              type="text"
                                              value={editName}
                                              onChange={(e) => setEditName(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') finishRename(item.id)
                                                if (e.key === 'Escape') setEditingId(null)
                                              }}
                                              onFocus={(e) => e.target.select()}
                                              className="text-[13px] font-medium border-b border-amber-500 outline-none bg-transparent w-full max-w-[160px] text-white"
                                              autoFocus
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                            <ColorSwatches selected={editColor} onSelect={(c) => { setEditColor(c); onChangeItemColor(item.id, c) }} />
                                            <button
                                              onClick={(e) => { e.stopPropagation(); finishRename(item.id) }}
                                              className="text-[10px] text-amber-400 hover:text-amber-300 font-medium"
                                            >
                                              Done
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <span className="flex-1 min-w-0 text-[13px] text-white truncate mr-1.5">
                                              {item.name}
                                            </span>
                                            <span
                                              className={`flex-shrink-0 mr-2 uppercase tracking-[0.04em] ${
                                                item.type === 'linear' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
                                              }`}
                                              style={{
                                                fontSize: '9px',
                                                fontWeight: 500,
                                                padding: '1px 5px',
                                                borderRadius: '3px',
                                              }}
                                            >
                                              {item.type === 'linear' ? 'LINEAR' : 'AREA'}
                                            </span>
                                            <span className="flex-shrink-0 text-[13px] font-medium text-white tabular-nums whitespace-nowrap">
                                              {item.type === 'linear' ? fmtFtIn(total) : fmtArea(total)}
                                            </span>
                                            <div className="flex-shrink-0 ml-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                              <KebabMenu
                                                variant="dark"
                                                title="Item actions"
                                                items={[
                                                  {
                                                    label: 'Add measurements',
                                                    icon: <Plus className="w-3.5 h-3.5" />,
                                                    onSelect: () => onAddMoreToItem(item.id),
                                                  },
                                                  {
                                                    label: 'Rename',
                                                    icon: <Pencil size={13} />,
                                                    onSelect: () => startRename(item),
                                                  },
                                                  {
                                                    label: 'Delete',
                                                    destructive: true,
                                                    icon: <Trash2Icon className="w-3.5 h-3.5" />,
                                                    onSelect: () => onDeleteItem(item.id),
                                                  },
                                                ]}
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      {!isEditing && item.type === 'area' && itemPerim > 0 && (
                                        <div className="pl-[15px] pb-[6px] text-[11px] text-[#888] tabular-nums">
                                          {fmtFtIn(itemPerim)} perim
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </SortableMeasurementRow>
                              )
                            })
                          )}
                        </SortableContext>
                      </DndContext>

                      {/* Per-section total — single muted right-aligned line. Only when section has measurements. */}
                      {sectionItems.length > 0 && (
                        <div className="flex items-center justify-end gap-3 px-3 pt-2 pb-0.5">
                          <span className="text-[10px] text-[#888] tabular-nums">{fmtFtIn(subLinear)}</span>
                          <span className="text-[10px] text-[#444]">·</span>
                          <span className="text-[10px] text-[#888] tabular-nums">{fmtArea(subArea)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </SortableSection>
              )
            })}
          </SortableContext>
        </DndContext>

        {/* Project total row — flat, single line with orange top divider. */}
        <div
          className="flex items-center justify-between px-3 mt-2.5 pt-[18px] pb-1"
          style={{ borderTop: '1px solid rgba(245,158,11,0.3)' }}
        >
          <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-[0.06em]">
            Total
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-medium text-white tabular-nums whitespace-nowrap">{fmtFtIn(projectTotals.linear)}</span>
            <span className="text-[14px] text-[#444]">·</span>
            <span className="text-[14px] font-medium text-white tabular-nums whitespace-nowrap">{fmtArea(projectTotals.area)}</span>
          </div>
        </div>

        {/* + Add Section button — flat dashed gray at the bottom of the list. */}
        <div className="px-3 mt-4 pb-3">
          <button
            onClick={() => {
              const id = onCreateSection('New Section')
              // Defer focus so the new section row is mounted first.
              setEditingSectionId(id)
              setEditingSectionName('New Section')
              setTimeout(() => sectionEditInputRef.current?.focus(), 0)
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-[10px] bg-transparent text-[#888] hover:text-gray-300 text-[12px] font-medium rounded-md transition-colors"
            style={{ border: '1px dashed rgba(255,255,255,0.15)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Section
          </button>
        </div>
      </div>
    </div>
  )
}
