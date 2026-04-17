'use client'

import { useEffect, useRef, useState } from 'react'
import { PencilIcon, PlusIcon, Trash2Icon, XIcon, CheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { UnitType } from '@/types'

interface Props {
  unitTypes: UnitType[]
  onClose: () => void
  onUnitTypesChange: (unitTypes: UnitType[]) => void
}

export default function InventorySettingsModal({
  unitTypes: initialUnitTypes,
  onClose,
  onUnitTypesChange,
}: Props) {
  const supabase = createClient()
  const [unitTypes, setUnitTypes] = useState<UnitType[]>(initialUnitTypes)

  // Inline add form
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAbbr, setAddAbbr] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const addNameRef = useRef<HTMLInputElement>(null)

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAbbr, setEditAbbr] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const editNameRef = useRef<HTMLInputElement>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<UnitType | null>(null)
  const [deleteProductCount, setDeleteProductCount] = useState(0)
  const [deleting, setDeleting] = useState(false)

  // Sync parent whenever local state changes
  function updateAndSync(next: UnitType[]) {
    setUnitTypes(next)
    onUnitTypesChange(next)
  }

  useEffect(() => {
    if (adding) addNameRef.current?.focus()
  }, [adding])

  useEffect(() => {
    if (editId) editNameRef.current?.focus()
  }, [editId])

  async function handleAdd() {
    const name = addName.trim()
    const abbr = addAbbr.trim()
    if (!name || !abbr) return
    setAddSaving(true)
    const maxSort = unitTypes.reduce((m, u) => Math.max(m, u.sort_order), 0)
    const { data, error } = await supabase
      .from('unit_types')
      .insert({ name, abbreviation: abbr, sort_order: maxSort + 1 })
      .select()
      .single()
    setAddSaving(false)
    if (!error && data) {
      updateAndSync([...unitTypes, data as UnitType])
      setAddName('')
      setAddAbbr('')
      setAdding(false)
    }
  }

  function startEdit(ut: UnitType) {
    setEditId(ut.id)
    setEditName(ut.name)
    setEditAbbr(ut.abbreviation)
  }

  async function handleEditSave() {
    if (!editId) return
    const name = editName.trim()
    const abbr = editAbbr.trim()
    if (!name || !abbr) return
    setEditSaving(true)
    const { error } = await supabase
      .from('unit_types')
      .update({ name, abbreviation: abbr })
      .eq('id', editId)
    setEditSaving(false)
    if (!error) {
      updateAndSync(
        unitTypes.map((u) => (u.id === editId ? { ...u, name, abbreviation: abbr } : u))
      )
      setEditId(null)
    }
  }

  async function handleDeleteClick(ut: UnitType) {
    // Check how many products use this unit
    const { count } = await supabase
      .from('inventory_products')
      .select('id', { count: 'exact', head: true })
      .eq('unit', ut.abbreviation)
    setDeleteProductCount(count ?? 0)
    setDeleteTarget(ut)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase
      .from('unit_types')
      .delete()
      .eq('id', deleteTarget.id)
    setDeleting(false)
    if (!error) {
      updateAndSync(unitTypes.filter((u) => u.id !== deleteTarget.id))
    }
    setDeleteTarget(null)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto md:max-h-[85vh] bg-white dark:bg-[#242424] md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Inventory Settings
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-2">
                Unit Types
              </label>

              {unitTypes.length === 0 && !adding && (
                <p className="text-sm text-gray-400 dark:text-[#6b6b6b] mb-2">
                  No unit types yet.
                </p>
              )}

              <div className="space-y-1">
                {unitTypes.map((ut) =>
                  editId === ut.id ? (
                    <div key={ut.id} className="flex items-center gap-2">
                      <input
                        ref={editNameRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                        className="flex-1 min-w-0 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave()
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                      <input
                        type="text"
                        value={editAbbr}
                        onChange={(e) => setEditAbbr(e.target.value)}
                        placeholder="Abbr"
                        className="w-20 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave()
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                      <button
                        onClick={handleEditSave}
                        disabled={editSaving || !editName.trim() || !editAbbr.trim()}
                        className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50 transition-colors"
                        title="Save"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white transition-colors"
                        title="Cancel"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={ut.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2e2e2e] group transition-colors"
                    >
                      <span className="text-sm text-gray-900 dark:text-white flex-1 min-w-0 truncate">
                        {ut.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-[#6b6b6b] font-mono">
                        {ut.abbreviation}
                      </span>
                      <button
                        onClick={() => startEdit(ut)}
                        className="p-1 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(ut)}
                        className="p-1 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  )
                )}
              </div>

              {adding ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    ref={addNameRef}
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Name (e.g. Gallons)"
                    className="flex-1 min-w-0 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd()
                      if (e.key === 'Escape') setAdding(false)
                    }}
                  />
                  <input
                    type="text"
                    value={addAbbr}
                    onChange={(e) => setAddAbbr(e.target.value)}
                    placeholder="Abbr (e.g. gal)"
                    className="w-24 border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#2e2e2e]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd()
                      if (e.key === 'Escape') setAdding(false)
                    }}
                  />
                  <button
                    onClick={handleAdd}
                    disabled={addSaving || !addName.trim() || !addAbbr.trim()}
                    className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50 transition-colors"
                    title="Save"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setAdding(false); setAddName(''); setAddAbbr('') }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white transition-colors"
                    title="Cancel"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Unit Type
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-none flex justify-end px-5 py-4 border-t border-gray-200 dark:border-[#3a3a3a]">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#3a3a3a] transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Unit Type"
          message={
            deleteProductCount > 0
              ? `${deleteProductCount} product${deleteProductCount === 1 ? '' : 's'} use${deleteProductCount === 1 ? 's' : ''} this unit type. They will keep their current unit text but it won't appear in dropdowns anymore. Delete "${deleteTarget.name}" anyway?`
              : `Delete unit type "${deleteTarget.name}"?`
          }
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </Portal>
  )
}
