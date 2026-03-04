'use client'

import { useState } from 'react'
import { PlusIcon, Trash2Icon, PencilIcon, CheckIcon } from 'lucide-react'
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

function formatFeetInches(totalFeet: number): string {
  const feet = Math.floor(totalFeet)
  const inches = Math.round((totalFeet - feet) * 12)
  if (inches === 12) return `${feet + 1}'-0"`
  return `${feet}'-${inches}"`
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
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MeasurementType>('linear')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function handleAdd() {
    if (!newName.trim()) return
    onAddItem(newName.trim(), newType)
    setNewName('')
    setNewType('linear')
    setShowAddForm(false)
  }

  function handleStartRename(item: TakeoffItem) {
    setEditingId(item.id)
    setEditName(item.name)
  }

  function handleFinishRename(id: string) {
    if (editName.trim()) {
      onRenameItem(id, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="w-[300px] bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">Measurement Items</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Add Item"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b border-gray-700 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Item name..."
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as MeasurementType)}
              className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="linear">Linear (ft)</option>
              <option value="area">Area (sq ft)</option>
            </select>
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-2 py-1.5 text-gray-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No items yet. Click + to add a measurement item.
          </div>
        )}
        {items.map((item) => {
          const isActive = item.id === activeItemId
          const total = item.measurements.reduce((sum, m) => sum + m.valueInFeet, 0)
          return (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`border-b border-gray-800 cursor-pointer transition-colors ${
                isActive ? 'bg-gray-800' : 'hover:bg-gray-800/50'
              }`}
            >
              {/* Item header */}
              <div className="px-4 py-2.5 flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                {editingId === item.id ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFinishRename(item.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-amber-500"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFinishRename(item.id)
                      }}
                      className="p-1 text-green-400 hover:text-green-300"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={`flex-1 text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                      {item.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      item.type === 'linear' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {item.type === 'linear' ? 'LIN' : 'AREA'}
                    </span>
                    {isActive && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartRename(item)
                          }}
                          className="p-1 text-gray-500 hover:text-white"
                          title="Rename"
                        >
                          <PencilIcon className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteItem(item.id)
                          }}
                          className="p-1 text-gray-500 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2Icon className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Measurements list (only when active) */}
              {isActive && item.measurements.length > 0 && (
                <div className="px-4 pb-2">
                  {item.measurements.map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-1 text-xs text-gray-400 group"
                    >
                      <span>
                        #{idx + 1}: {m.label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteMeasurement(item.id, m.id)
                        }}
                        className="p-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2Icon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              <div className={`px-4 py-1.5 text-xs font-medium ${isActive ? 'text-amber-400' : 'text-gray-500'}`}>
                Total: {item.type === 'linear' ? formatFeetInches(total) : `${total.toFixed(1)} sq ft`}
                {item.measurements.length > 0 && ` (${item.measurements.length})`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
