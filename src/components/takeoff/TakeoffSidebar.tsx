'use client'

import { useEffect, useRef, useState } from 'react'
import { PlusIcon, Trash2Icon, XIcon, Pencil, Plus } from 'lucide-react'
import type { TakeoffItem, MeasurementType } from './types'
import { ITEM_COLORS } from './TakeoffViewer'

interface TakeoffSidebarProps {
  items: TakeoffItem[]
  /** Sidebar selection (for visual highlight + PDF dim-others). */
  selectedItemId: string | null
  /** Toggle selection on row body click. */
  onSelectItem: (id: string) => void
  /** Open the new-measurement panel pre-populated for this existing item
   *  (locked Linear/Area toggle, editable name/color). */
  onAddMoreToItem: (id: string) => void
  onAddItem: (name: string, type: MeasurementType, color?: string) => void
  onDeleteItem: (id: string) => void
  onRenameItem: (id: string, name: string) => void
  onChangeItemColor: (id: string, color: string) => void
  onDeleteMeasurement: (itemId: string, measurementId: string) => void
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

export default function TakeoffSidebar({
  items,
  selectedItemId,
  onSelectItem,
  onAddMoreToItem,
  onAddItem,
  onDeleteItem,
  onRenameItem,
  onChangeItemColor,
  onDeleteMeasurement,
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
  const isEditingExisting = panelEditingItemId !== null

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelEditingItemId])

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
  const savedItems = panelSessionItemId
    ? items.filter((it) => it.id !== panelSessionItemId)
    : items

  // "Start Measuring" — creates the item if needed and arms PDF click
  // placement, but keeps the config panel open with form state intact so the
  // user can re-arm via Escape (which clears in-progress points).
  function handleStartMeasuring() {
    if (!newName.trim()) return
    onAddItem(newName.trim(), newType, newColor)
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
    <div className="w-[260px] flex-shrink-0 bg-[#111] border-l border-gray-800 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
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
        <div className="px-3 py-2.5 border-b border-gray-800 space-y-2 flex-shrink-0">
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
        {showAdd && savedItems.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-t-2 border-zinc-700">
            <span className="text-gray-300 font-semibold text-xs tracking-wide uppercase">
              Saved Measurements
            </span>
          </div>
        )}

        {savedItems.map((item) => {
          const isSelected = item.id === selectedItemId
          const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
          const totalPerim = item.type === 'area' ? item.measurements.reduce((s, m) => s + (m.perimeterFt || 0), 0) : 0
          const isEditing = editingId === item.id

          return (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`cursor-pointer transition-colors border-b border-gray-800/60 ${
                isSelected
                  ? 'bg-[#1a1a1a] border-l-4 border-l-amber-500'
                  : 'bg-[#111] hover:bg-[#161616] border-l-4 border-l-transparent opacity-70 hover:opacity-100'
              }`}
            >
              {/* Top row: dot + name + badge + delete */}
              <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />

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
                      className="text-sm font-semibold border-b border-amber-500 outline-none bg-transparent w-full max-w-[180px] text-white"
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
                    <div
                      onClick={(e) => { e.stopPropagation(); startRename(item) }}
                      className="group/name flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
                    >
                      <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {item.name}
                      </span>
                      <Pencil size={12} className="text-gray-600 group-hover/name:text-amber-500 flex-shrink-0" />
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                      item.type === 'linear' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
                    }`}>
                      {item.type === 'linear' ? 'LINEAR' : 'AREA'}
                    </span>
                    {/* Add-more "+" — opens the new-measurement panel
                        pre-populated for this item. Stop propagation so
                        clicking the icon does not also toggle row
                        selection. */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddMoreToItem(item.id) }}
                      title="Add more shapes to this item"
                      className="p-1.5 text-gray-700 hover:text-amber-400 flex-shrink-0 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id) }}
                      className="p-1.5 text-gray-700 hover:text-red-400 flex-shrink-0 transition-colors"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Per-shape list expands when the row is selected. */}
              {isSelected && item.measurements.length > 0 && (
                <div className="px-3 pb-1">
                  {item.measurements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-0.5 group">
                      <span className="text-[10px] text-gray-500">
                        {m.label}
                        {m.type === 'area' && m.perimeterFt ? ` | ${fmtFtIn(m.perimeterFt)} perim.` : ''}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteMeasurement(item.id, m.id) }}
                        className="p-1.5 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              <div className={`px-3 pb-2 text-[11px] font-bold ${isSelected ? 'text-amber-400' : 'text-gray-600'}`}>
                Total: {item.type === 'linear' ? fmtFtIn(total) : `${total.toFixed(1)} sq ft`}
                {item.type === 'area' && totalPerim > 0 && (
                  <span className="ml-1.5 text-[10px] font-medium opacity-70">| {fmtFtIn(totalPerim)} perim.</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
