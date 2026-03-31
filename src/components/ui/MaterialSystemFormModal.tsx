'use client'

import { useState } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import Portal from './Portal'

export interface FormItemRow {
  material_name: string
  thickness: string
  coverage_rate: string
  item_notes: string
}

export interface MaterialSystemFormState {
  name: string
  notes: string
  items: FormItemRow[]
}

const emptyItem: FormItemRow = { material_name: '', thickness: '', coverage_rate: '', item_notes: '' }

interface MaterialSystemFormModalProps {
  title: string
  initial?: MaterialSystemFormState
  onSave: (form: MaterialSystemFormState) => Promise<void>
  onClose: () => void
}

const defaultInitial: MaterialSystemFormState = {
  name: '',
  notes: '',
  items: [{ ...emptyItem }],
}

export default function MaterialSystemFormModal({
  title,
  initial,
  onSave,
  onClose,
}: MaterialSystemFormModalProps) {
  const [form, setForm] = useState<MaterialSystemFormState>(initial ?? { ...defaultInitial })
  const [saving, setSaving] = useState(false)

  function updateItem(idx: number, updates: Partial<FormItemRow>) {
    const updated = [...form.items]
    updated[idx] = { ...updated[idx], ...updates }
    setForm({ ...form, items: updated })
  }

  function removeItem(idx: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ...emptyItem }] })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* System Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                System Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Epoxy Broadcast, Polyurea, MMA..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Materials */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Materials</label>
              {/* Column headers */}
              <div className="flex items-start gap-2 mb-1">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <span className="text-[10px] font-medium text-gray-500 px-1">Material Name</span>
                  <span className="text-[10px] font-medium text-gray-500 px-1">Thickness</span>
                  <span className="text-[10px] font-medium text-gray-500 px-1">Coverage Rate</span>
                </div>
                <div className="w-[26px]" />
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-start gap-2">
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        <input
                          type="text"
                          value={item.material_name}
                          onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                          placeholder="Material Name"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={item.thickness}
                          onChange={(e) => updateItem(idx, { thickness: e.target.value })}
                          placeholder="Thickness"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={item.coverage_rate}
                          onChange={(e) => updateItem(idx, { coverage_rate: e.target.value })}
                          placeholder="Coverage Rate"
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                      </div>
                      <button
                        onClick={() => removeItem(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition mt-0.5"
                        title="Remove material"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Per-material notes */}
                    <div className="ml-0 mr-[34px] mt-1">
                      <textarea
                        value={item.item_notes}
                        onChange={(e) => updateItem(idx, { item_notes: e.target.value })}
                        placeholder="Add material notes..."
                        rows={1}
                        className="w-full border border-gray-100 rounded px-2 py-1 text-xs text-gray-500 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Material
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes for this system..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
