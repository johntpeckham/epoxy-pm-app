'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, XIcon, SettingsIcon } from 'lucide-react'
import type { MaterialSystem, MaterialSystemInput, MaterialSystemVersion } from '@/lib/useMaterialSystems'
import { getItemsByVersion, getColumnsByVersion } from '@/lib/useMaterialSystems'
import MaterialSystemFormModal from './MaterialSystemFormModal'
import type { MaterialSystemFormState } from './MaterialSystemFormModal'

export interface MaterialSystemItemRow {
  material_name: string
  unit_size: string
  coverage_rate: string
  quantity: string
  custom_column_values?: Record<string, string>
}

export interface MaterialSystemRow {
  id: string
  systemName: string
  notes: string
  items: MaterialSystemItemRow[]
  custom_columns?: string[]
}

interface MaterialSystemPickerProps {
  rows: MaterialSystemRow[]
  onChange: (rows: MaterialSystemRow[]) => void
  systems: MaterialSystem[]
  onAddNew: (input: MaterialSystemInput) => Promise<MaterialSystem | null>
  onUpdateSystem: (id: string, input: MaterialSystemInput) => Promise<void>
  readOnly?: boolean
  showQuantity?: boolean
  version?: MaterialSystemVersion
}

function genRowId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function systemToRow(system: MaterialSystem, version: MaterialSystemVersion = 'internal'): MaterialSystemRow {
  const versionItems = getItemsByVersion(system, version)
  const versionColumns = getColumnsByVersion(system, version)
  return {
    id: genRowId(),
    systemName: system.name,
    notes: system.notes ?? '',
    items: versionItems.map((item) => ({
      material_name: item.material_name,
      unit_size: item.unit_size ?? '',
      coverage_rate: item.coverage_rate ?? '',
      quantity: '',
      custom_column_values: item.custom_column_values ?? {},
    })),
    custom_columns: versionColumns.map((c) => c.column_name),
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
  version = 'internal',
}: MaterialSystemPickerProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSystem, setEditingSystem] = useState<MaterialSystem | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

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
    onChange([...rows, systemToRow(system, version)])
    setShowDropdown(false)
    setSearchQuery('')
  }

  function buildInput(form: MaterialSystemFormState): MaterialSystemInput {
    return {
      name: form.name,
      notes: form.notes,
      internal_items: form.internal_items.map((i, idx) => ({
        material_name: i.material_name,
        unit_size: i.unit_size,
        coverage_rate: i.coverage_rate,
        sort_order: idx,
        custom_column_values: i.custom_column_values,
      })),
      client_items: form.client_items.map((i, idx) => ({
        material_name: i.material_name,
        unit_size: i.unit_size,
        coverage_rate: i.coverage_rate,
        sort_order: idx,
        custom_column_values: i.custom_column_values,
      })),
      internal_columns: form.internal_columns.map((c, idx) => ({
        column_name: c.column_name,
        sort_order: idx,
      })),
      client_columns: form.client_columns.map((c, idx) => ({
        column_name: c.column_name,
        sort_order: idx,
      })),
    }
  }

  async function handleAddNewSave(form: MaterialSystemFormState) {
    const input = buildInput(form)
    const result = await onAddNew(input)
    if (result) {
      onChange([...rows, systemToRow(result, version)])
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
      const versionItems = version === 'internal' ? form.internal_items : form.client_items
      const versionColumns = version === 'internal' ? form.internal_columns : form.client_columns
      onChange(rows.map((r) => {
        if (r.id !== editingRowId) return r
        return {
          ...r,
          systemName: form.name,
          notes: form.notes,
          items: versionItems.map((i) => ({
            material_name: i.material_name,
            unit_size: i.unit_size,
            coverage_rate: i.coverage_rate,
            quantity: r.items.find((ri) => ri.material_name === i.material_name)?.quantity ?? '',
            custom_column_values: i.custom_column_values ?? {},
          })),
          custom_columns: versionColumns.filter((c) => c.column_name.trim()).map((c) => c.column_name),
        }
      }))
    }
    setEditingSystem(null)
    setEditingRowId(null)
  }

  function systemToFormState(system: MaterialSystem): MaterialSystemFormState {
    const internalItems = getItemsByVersion(system, 'internal')
    const clientItems = getItemsByVersion(system, 'client')
    const internalCols = getColumnsByVersion(system, 'internal')
    const clientCols = getColumnsByVersion(system, 'client')
    return {
      name: system.name,
      notes: system.notes ?? '',
      internal_items: internalItems.length > 0
        ? internalItems.map((i) => ({
            material_name: i.material_name,
            unit_size: i.unit_size ?? '',
            coverage_rate: i.coverage_rate ?? '',
            custom_column_values: i.custom_column_values ?? {},
          }))
        : [{ material_name: '', unit_size: '', coverage_rate: '', custom_column_values: {} }],
      client_items: clientItems.length > 0
        ? clientItems.map((i) => ({
            material_name: i.material_name,
            unit_size: i.unit_size ?? '',
            coverage_rate: i.coverage_rate ?? '',
            custom_column_values: i.custom_column_values ?? {},
          }))
        : [{ material_name: '', unit_size: '', coverage_rate: '', custom_column_values: {} }],
      internal_columns: internalCols.map((c) => ({ column_name: c.column_name, sort_order: c.sort_order })),
      client_columns: clientCols.map((c) => ({ column_name: c.column_name, sort_order: c.sort_order })),
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

  function updateItemCustomValue(rowId: string, itemIdx: number, colName: string, value: string) {
    onChange(rows.map((r) => {
      if (r.id !== rowId) return r
      const items = [...r.items]
      items[itemIdx] = {
        ...items[itemIdx],
        custom_column_values: { ...items[itemIdx].custom_column_values, [colName]: value },
      }
      return { ...r, items }
    }))
  }

  function removeRow(rowId: string) {
    onChange(rows.filter((r) => r.id !== rowId))
  }

  const addedNames = new Set(rows.map((r) => r.systemName))
  const availableSystems = systems.filter((s) => !addedNames.has(s.name))

  // Count base columns (Material, Unit Size, Coverage Rate) + custom + optional Quantity
  function getGridCols(row: MaterialSystemRow) {
    const customCount = (row.custom_columns ?? []).length
    const base = 3 + customCount + (showQuantity ? 1 : 0)
    return base
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const gridCols = getGridCols(row)
        const customCols = row.custom_columns ?? []
        return (
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
                <span className="text-[10px] font-medium text-gray-500">Unit Size</span>
                <span className="text-[10px] font-medium text-gray-500">Coverage Rate</span>
                {customCols.map((colName) => (
                  <span key={colName} className="text-[10px] font-medium text-gray-500">{colName}</span>
                ))}
                {showQuantity && <span className="text-[10px] font-medium text-gray-500">Quantity</span>}
              </div>
              {row.items.map((item, idx) => (
                <div key={idx} className="grid gap-2 px-3 py-1.5" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                  <span className="text-sm text-gray-900">{item.material_name}</span>
                  <span className="text-sm text-gray-600">{item.unit_size || '\u2014'}</span>
                  <span className="text-sm text-gray-600">{item.coverage_rate || '\u2014'}</span>
                  {customCols.map((colName) => (
                    <span key={colName} className="text-sm text-gray-600">
                      {item.custom_column_values?.[colName] || '\u2014'}
                    </span>
                  ))}
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
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="px-3 py-2 border-t border-gray-100">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
            <input
              type="text"
              value={row.notes}
              onChange={(e) => updateRow(row.id, { notes: e.target.value })}
              readOnly={readOnly}
              placeholder="Notes..."
              className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
            />
          </div>
        </div>
        )
      })}

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
                  {getItemsByVersion(s, version).length > 0 && (
                    <span className="text-xs text-gray-400 ml-1">({getItemsByVersion(s, version).length} materials)</span>
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
          onSave={handleAddNewSave}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit system modal */}
      {editingSystem && (
        <MaterialSystemFormModal
          title="Edit Material System"
          initial={systemToFormState(editingSystem)}
          onSave={handleEditSave}
          onClose={() => { setEditingSystem(null); setEditingRowId(null) }}
        />
      )}
    </div>
  )
}
