'use client'

import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import type { LineItem } from '../estimates/types'

interface ChangeOrderModalProps {
  onSave: (data: { description: string; lineItems: LineItem[]; notes: string }) => void
  onClose: () => void
  saving?: boolean
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function calcAmount(item: LineItem): number {
  if (!item.ft || item.ft === 0) return item.rate ?? 0
  return (item.ft ?? 0) * (item.rate ?? 0)
}

export default function ChangeOrderModal({ onSave, onClose, saving }: ChangeOrderModalProps) {
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: genId(), description: '', ft: null, rate: null, amount: 0 },
  ])

  const subtotal = lineItems.reduce((sum, item) => sum + calcAmount(item), 0)

  function updateLineItem(id: string, updates: Partial<LineItem>) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    )
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { id: genId(), description: '', ft: null, rate: null, amount: 0 },
    ])
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  function handleSave() {
    const items = lineItems.map((item) => ({ ...item, amount: calcAmount(item) }))
    onSave({ description, lineItems: items, notes })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">New Change Order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              placeholder="Change order description..."
            />
          </div>

          {/* Line items */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</label>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-amber-500">
                  <th className="text-left text-xs font-semibold text-amber-700 uppercase tracking-wide py-2">Description</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-20">QTY</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-24">Rate</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-28">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 group">
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                        className="w-full text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="Item description..."
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={item.ft ?? ''}
                        onChange={(e) => updateLineItem(item.id, { ft: e.target.value ? Number(e.target.value) : null })}
                        className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={item.rate ?? ''}
                        onChange={(e) => updateLineItem(item.id, { rate: e.target.value ? Number(e.target.value) : null })}
                        className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-2 text-right text-sm font-medium text-gray-900 px-2">
                      ${calcAmount(item).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeLineItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={addLineItem}
              className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Line Item
            </button>
            <div className="flex justify-end mt-3">
              <div className="text-sm font-medium text-gray-900">
                Subtotal: ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              placeholder="Additional notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Change Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
