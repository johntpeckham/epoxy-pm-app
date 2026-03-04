'use client'

import { useState } from 'react'
import { PlusIcon, Trash2Icon, CheckIcon, XIcon } from 'lucide-react'
import type { TakeoffItem, MeasurementType } from './types'

interface TakeoffSidebarProps {
  items: TakeoffItem[]
  activeItemId: string | null
  onSelectItem: (id: string) => void
  onAddItem: (name: string, type: MeasurementType) => void
  onDeleteItem: (id: string) => void
  onRenameItem: (id: string, name: string) => void
  onDeleteMeasurement: (itemId: string, measurementId: string) => void
}

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

export default function TakeoffSidebar({
  items,
  activeItemId,
  onSelectItem,
  onAddItem,
  onDeleteItem,
  onRenameItem,
  onDeleteMeasurement,
}: TakeoffSidebarProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MeasurementType>('linear')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function handleAdd() {
    if (!newName.trim()) return
    onAddItem(newName.trim(), newType)
    setNewName('')
    setNewType('linear')
    setShowAdd(false)
  }

  function startRename(item: TakeoffItem) {
    setEditingId(item.id)
    setEditName(item.name)
  }

  function finishRename(id: string) {
    if (editName.trim()) onRenameItem(id, editName.trim())
    setEditingId(null)
  }

  return (
    <div className="w-[260px] flex-shrink-0 bg-[#111] border-l border-gray-800 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
        <span className="text-gray-300 font-semibold text-xs tracking-wide uppercase">Measurement Items</span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="w-6 h-6 flex items-center justify-center rounded bg-amber-500 hover:bg-amber-400 text-white transition-colors"
          title="Add Item"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline add form */}
      {showAdd && (
        <div className="px-3 py-2.5 border-b border-gray-800 space-y-2 flex-shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Item name"
            className="w-full px-2.5 py-1.5 bg-[#222] border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          {/* Type pill toggle */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setNewType('linear')}
              className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                newType === 'linear'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'bg-[#222] text-gray-500 border border-gray-700 hover:text-gray-300'
              }`}
            >
              Linear
            </button>
            <button
              onClick={() => setNewType('area')}
              className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                newType === 'area'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'bg-[#222] text-gray-500 border border-gray-700 hover:text-gray-300'
              }`}
            >
              Area
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleAdd}
              className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && !showAdd && (
          <div className="px-4 py-10 text-center">
            <p className="text-gray-600 text-xs">Click + to add your first measurement item</p>
          </div>
        )}

        {items.map((item) => {
          const isActive = item.id === activeItemId
          const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)

          return (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`cursor-pointer transition-colors border-b border-gray-800/60 ${
                isActive
                  ? 'bg-[#1a1a1a] border-l-2 border-l-amber-500'
                  : 'bg-[#111] hover:bg-[#161616] border-l-2 border-l-transparent'
              }`}
            >
              {/* Top row: dot + name + badge + delete */}
              <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />

                {editingId === item.id ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishRename(item.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 bg-[#222] border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-amber-500"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); finishRename(item.id) }}
                      className="p-0.5 text-green-400 hover:text-green-300"
                    >
                      <CheckIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(item) }}
                      className={`flex-1 text-xs font-medium truncate ${isActive ? 'text-white' : 'text-gray-400'}`}
                    >
                      {item.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                      item.type === 'linear' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
                    }`}>
                      {item.type === 'linear' ? 'LINEAR' : 'AREA'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id) }}
                      className="p-0.5 text-gray-700 hover:text-red-400 flex-shrink-0 transition-colors"
                    >
                      <Trash2Icon className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Measurements (always visible when active) */}
              {isActive && item.measurements.length > 0 && (
                <div className="px-3 pb-1">
                  {item.measurements.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between py-0.5 group">
                      <span className="text-[10px] text-gray-500">{m.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteMeasurement(item.id, m.id) }}
                        className="p-0.5 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              <div className={`px-3 pb-2 text-[11px] font-bold ${isActive ? 'text-amber-400' : 'text-gray-600'}`}>
                Total: {item.type === 'linear' ? fmtFtIn(total) : `${total.toFixed(1)} sq ft`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
