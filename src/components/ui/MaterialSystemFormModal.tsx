'use client'

import { useState } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import UnitSizeSelect from './UnitSizeSelect'
import Portal from './Portal'

export interface FormItemRow {
  material_name: string
  unit_size: string
  coverage_rate: string
}

export interface MaterialSystemFormState {
  name: string
  notes: string
  items: FormItemRow[]
}

const emptyItem: FormItemRow = { material_name: '', unit_size: '', coverage_rate: '' }

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
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition">
              <XIcon className="w-4 h-4" />
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
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <input
                        type="text"
                        value={item.material_name}
                        onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                        placeholder="Material Name"
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                      <UnitSizeSelect
                        value={item.unit_size}
                        onChange={(v) => updateItem(idx, { unit_size: v })}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white w-full text-left"
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
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
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
