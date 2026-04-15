'use client'

import { useState, useRef, useEffect } from 'react'
import { TagIcon, ChevronDownIcon, CheckIcon, PlusIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Lead, LeadCategory } from './LeadsClient'

interface LeadCategoryCardProps {
  lead: Lead
  categories: LeadCategory[]
  isAdmin: boolean
  onPatch: (patch: Partial<Lead>) => void
  onCategoriesChanged: (next: LeadCategory[]) => void
}

export default function LeadCategoryCard({
  lead,
  categories,
  isAdmin,
  onPatch,
  onCategoriesChanged,
}: LeadCategoryCardProps) {
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingNew(false)
        setNewName('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  async function handleSelect(name: string) {
    setOpen(false)
    setAddingNew(false)
    setNewName('')
    if (lead.category === name) return
    onPatch({ category: name })
    const supabase = createClient()
    const { error } = await supabase
      .from('leads')
      .update({ category: name })
      .eq('id', lead.id)
    if (error) {
      console.error('[LeadCategory] Save failed:', error)
    }
  }

  async function handleAddNew() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    const supabase = createClient()
    // Check for existing
    const existing = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    )
    let category = existing
    if (!category) {
      const { data, error } = await supabase
        .from('lead_categories')
        .insert({ name: trimmed })
        .select('*')
        .single()
      if (error || !data) {
        console.error('[LeadCategory] Add new failed:', error)
        setSaving(false)
        return
      }
      category = data as LeadCategory
      const next = [...categories, category].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
      onCategoriesChanged(next)
    }
    await supabase.from('leads').update({ category: category.name }).eq('id', lead.id)
    onPatch({ category: category.name })
    setSaving(false)
    setAddingNew(false)
    setNewName('')
    setOpen(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <TagIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Lead Category</h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="text-xs text-gray-400 hover:text-amber-600"
          >
            Manage
          </button>
        )}
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors"
        >
          <span className={lead.category ? 'text-gray-900' : 'text-gray-400'}>
            {lead.category || 'Select a category…'}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-72 overflow-y-auto">
            {categories.length === 0 && !addingNew && (
              <div className="px-3 py-2 text-xs text-gray-400">
                No categories yet.
              </div>
            )}
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.name)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 flex items-center justify-between"
              >
                <span>{c.name}</span>
                {lead.category === c.name && (
                  <CheckIcon className="w-3.5 h-3.5 text-amber-500" />
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              {addingNew ? (
                <div className="px-2 py-1 flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddNew()
                      } else if (e.key === 'Escape') {
                        setAddingNew(false)
                        setNewName('')
                      }
                    }}
                    placeholder="New category name"
                    disabled={saving}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddNew}
                    disabled={saving || !newName.trim()}
                    className="px-2 py-1 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded disabled:opacity-50"
                  >
                    {saving ? '…' : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add new
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {manageOpen && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setManageOpen(false)}
          onCategoriesChanged={onCategoriesChanged}
        />
      )}
    </div>
  )
}

interface ManageCategoriesModalProps {
  categories: LeadCategory[]
  onClose: () => void
  onCategoriesChanged: (next: LeadCategory[]) => void
}

function ManageCategoriesModal({
  categories,
  onClose,
  onCategoriesChanged,
}: ManageCategoriesModalProps) {
  const [confirmDelete, setConfirmDelete] = useState<LeadCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('lead_categories')
      .delete()
      .eq('id', confirmDelete.id)
    setDeleting(false)
    if (error) {
      console.error('[LeadCategory] Delete failed:', error)
      setConfirmDelete(null)
      return
    }
    onCategoriesChanged(categories.filter((c) => c.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">Manage Categories</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">No categories defined.</p>
            ) : (
              categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-900">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c)}
                    className="text-gray-400 hover:text-red-600 p-1 rounded"
                    aria-label={`Delete ${c.name}`}
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div
            className="flex-none flex justify-end gap-3 p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="Existing leads that use this category will keep their current value. This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => (deleting ? null : setConfirmDelete(null))}
        />
      )}
    </Portal>
  )
}
