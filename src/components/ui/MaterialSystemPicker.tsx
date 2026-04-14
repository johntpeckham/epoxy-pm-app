'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, XIcon, SettingsIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { MasterProduct } from '@/types'
import type { MaterialSystem, MaterialSystemInput } from '@/lib/useMaterialSystems'
import MaterialSystemFormModal from './MaterialSystemFormModal'
import type { MaterialSystemFormState } from './MaterialSystemFormModal'

export interface MaterialSystemItemRow {
  material_name: string
  thickness: string
  coverage_rate: string
  item_notes: string
  quantity: string
}

export interface MaterialSystemRow {
  id: string
  systemName: string
  notes: string
  items: MaterialSystemItemRow[]
}

interface MaterialSystemPickerProps {
  rows: MaterialSystemRow[]
  onChange: (rows: MaterialSystemRow[]) => void
  systems: MaterialSystem[]
  onAddNew: (input: MaterialSystemInput) => Promise<MaterialSystem | null>
  onUpdateSystem: (id: string, input: MaterialSystemInput) => Promise<void>
  readOnly?: boolean
  showQuantity?: boolean
}

function genRowId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function systemToRow(system: MaterialSystem): MaterialSystemRow {
  return {
    id: genRowId(),
    systemName: system.name,
    notes: system.notes ?? '',
    items: system.items.map((item) => ({
      material_name: item.material_name,
      thickness: item.thickness ?? '',
      coverage_rate: item.coverage_rate ?? '',
      item_notes: item.item_notes ?? '',
      quantity: '',
    })),
  }
}

export default function MaterialSystemPicker({
  rows,
  onChange,
  systems,
  onAddNew,
  onUpdateSystem,
  readOnly = false,
  showQuantity = false,
}: MaterialSystemPickerProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSystem, setEditingSystem] = useState<MaterialSystem | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch master products for the form modal's searchable dropdown
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([])
  useEffect(() => {
    const supabase = createClient()
    supabase.from('master_products').select('*').order('sort_order').order('name')
      .then(({ data }) => setMasterProducts((data as MasterProduct[]) ?? []))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setSearchQuery('')
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  function selectSystem(system: MaterialSystem) {
    onChange([...rows, systemToRow(system)])
    setShowDropdown(false)
    setSearchQuery('')
  }

  function buildInput(form: MaterialSystemFormState): MaterialSystemInput {
    return {
      name: form.name,
      notes: form.notes,
      items: form.items.map((i, idx) => ({
        material_name: i.material_name,
        master_product_id: i.master_product_id,
        thickness: i.thickness,
        coverage_rate: i.coverage_rate,
        item_notes: i.item_notes,
        sort_order: idx,
      })),
    }
  }

  async function handleAddNewSave(form: MaterialSystemFormState) {
    const input = buildInput(form)
    const result = await onAddNew(input)
    if (result) {
      onChange([...rows, systemToRow(result)])
    }
    setShowAddModal(false)
    setShowDropdown(false)
    setSearchQuery('')
  }

  async function handleEditSave(form: MaterialSystemFormState) {
    if (!editingSystem) return
    const input = buildInput(form)
    await onUpdateSystem(editingSystem.id, input)
    // Refresh the row in the current form to reflect updated system data
    if (editingRowId) {
      onChange(rows.map((r) => {
        if (r.id !== editingRowId) return r
        return {
          ...r,
          systemName: form.name,
          notes: form.notes,
          items: form.items.map((i) => ({
            material_name: i.material_name,
            thickness: i.thickness,
            coverage_rate: i.coverage_rate,
            item_notes: i.item_notes,
            quantity: r.items.find((ri) => ri.material_name === i.material_name)?.quantity ?? '',
          })),
        }
      }))
    }
    setEditingSystem(null)
    setEditingRowId(null)
  }

  function systemToFormState(system: MaterialSystem): MaterialSystemFormState {
    return {
      name: system.name,
      notes: system.notes ?? '',
      items: system.items.length > 0
        ? system.items.map((i) => {
            // Resolve material name from master FK, fall back to saved text
            let materialName = i.material_name
            if (i.master_product_id) {
              const mp = masterProducts.find((p) => p.id === i.master_product_id)
              if (mp) materialName = mp.name
            }
            return {
              material_name: materialName,
              master_product_id: i.master_product_id ?? null,
              thickness: i.thickness ?? '',
              coverage_rate: i.coverage_rate ?? '',
              item_notes: i.item_notes ?? '',
            }
          })
        : [{ material_name: '', master_product_id: null, thickness: '', coverage_rate: '', item_notes: '' }],
    }
  }

  function openEditModal(row: MaterialSystemRow) {
    const system = systems.find((s) => s.name === row.systemName)
    if (!system) return
    setEditingSystem(system)
    setEditingRowId(row.id)
  }

  function updateRow(rowId: string, updates: Partial<MaterialSystemRow>) {
    onChange(rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)))
  }

  function updateItemInRow(rowId: string, itemIdx: number, updates: Partial<MaterialSystemItemRow>) {
    onChange(rows.map((r) => {
      if (r.id !== rowId) return r
      const items = [...r.items]
      items[itemIdx] = { ...items[itemIdx], ...updates }
      return { ...r, items }
    }))
  }

  function removeRow(rowId: string) {
    onChange(rows.filter((r) => r.id !== rowId))
  }

  const addedNames = new Set(rows.map((r) => r.systemName))
  const availableSystems = systems.filter((s) => !addedNames.has(s.name))

  const gridCols = 3 + (showQuantity ? 1 : 0)

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50"
        >
          {/* System header */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-900">{row.systemName}</span>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(row)}
                  className="text-gray-400 hover:text-amber-600 transition-colors"
                  title="Edit system"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeRow(row.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Material items */}
          {row.items.length > 0 && (
            <div className="divide-y divide-gray-100">
              <div className="grid gap-2 px-3 py-1.5" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                <span className="text-[10px] font-medium text-gray-500">Material</span>
                <span className="text-[10px] font-medium text-gray-500">Thickness</span>
                <span className="text-[10px] font-medium text-gray-500">Coverage Rate</span>
                {showQuantity && <span className="text-[10px] font-medium text-gray-500">Quantity</span>}
              </div>
              {row.items.map((item, idx) => (
                <div key={idx}>
                  <div className="grid gap-2 px-3 py-1.5" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                    <span className="text-sm text-gray-900">{item.material_name}</span>
                    <span className="text-sm text-gray-600">{item.thickness || '\u2014'}</span>
                    <span className="text-sm text-gray-600">{item.coverage_rate || '\u2014'}</span>
                    {showQuantity && (
                      <input
                        type="text"
                        value={item.quantity}
                        onChange={(e) => updateItemInRow(row.id, idx, { quantity: e.target.value })}
                        readOnly={readOnly}
                        placeholder="Qty"
                        className={`w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                      />
                    )}
                  </div>
                  {item.item_notes && (
                    <div className="px-3 pb-1.5">
                      <p className="text-xs text-gray-400 italic">{item.item_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="px-3 py-2 border-t border-gray-100">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
            <textarea
              value={row.notes}
              onChange={(e) => updateRow(row.id, { notes: e.target.value })}
              readOnly={readOnly}
              placeholder="Notes..."
              rows={4}
              className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none resize-y ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
            />
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Material System
          </button>

          {showDropdown && (() => {
            const query = searchQuery.toLowerCase()
            const filteredSystems = query
              ? availableSystems.filter((s) => s.name.toLowerCase().includes(query))
              : availableSystems
            return (
            <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-72 flex flex-col overflow-hidden">
              {/* Search input */}
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search systems..."
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                  autoFocus
                />
              </div>
              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto">
              {filteredSystems.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSystem(s)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium">{s.name}</span>
                  {s.items.length > 0 && (
                    <span className="text-xs text-gray-400 ml-1">({s.items.length} materials)</span>
                  )}
                </button>
              ))}
              {filteredSystems.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">No systems found</div>
              )}
              </div>
              {/* Add New - always visible */}
              <button
                onClick={() => { setShowAddModal(true); setShowDropdown(false); setSearchQuery('') }}
                className="flex-none w-full text-left px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 border-t border-gray-100 transition-colors flex items-center gap-1"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add New
              </button>
            </div>
            )
          })()}
        </div>
      )}

      {/* Add New modal */}
      {showAddModal && (
        <MaterialSystemFormModal
          title="Add Material System"
          masterProducts={masterProducts}
          onSave={handleAddNewSave}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit system modal */}
      {editingSystem && (
        <MaterialSystemFormModal
          title="Edit Material System"
          initial={systemToFormState(editingSystem)}
          masterProducts={masterProducts}
          onSave={handleEditSave}
          onClose={() => { setEditingSystem(null); setEditingRowId(null) }}
        />
      )}
    </div>
  )
}
