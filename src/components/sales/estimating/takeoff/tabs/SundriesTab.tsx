'use client'

import { PlusIcon, ShoppingBagIcon } from 'lucide-react'

const SAMPLE_ITEMS = [
  { product: '18" Roller covers', desc: '3/8" nap solvent-resistant', qty: 24, cost: 12, total: 288 },
  { product: 'Notched squeegees', desc: '24" V-notch', qty: 6, cost: 18, total: 108 },
  { product: 'Masking tape 2"', desc: 'High-adhesion painters tape', qty: 12, cost: 8, total: 96 },
  { product: 'Spike shoes', desc: 'Steel spike soles — pair', qty: 4, cost: 35, total: 140 },
]

export default function SundriesTab() {
  const subtotal = SAMPLE_ITEMS.reduce((s, m) => s + m.total, 0)
  const taxRate = 0.0925
  const tax = Math.round(subtotal * taxRate)
  const total = subtotal + tax

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <ShoppingBagIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Sundries</h3>
          </div>
          <button className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition">
            <PlusIcon className="w-3.5 h-3.5" />
            Add item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-3 font-medium">Product</th>
                <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Description</th>
                <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SAMPLE_ITEMS.map((m, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{m.product}</td>
                  <td className="py-2.5 pr-3 text-gray-500 hidden sm:table-cell">{m.desc}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-600">{m.qty}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-600">${m.cost.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-medium text-gray-900">${m.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition">
          <PlusIcon className="w-3.5 h-3.5" />
          Add line item
        </button>

        <div className="mt-4 border-t border-gray-200 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-700">${subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tax (9.25%)</span>
            <span className="text-gray-700">${tax.toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div className="flex justify-between font-semibold">
            <span className="text-gray-900">Sundries total</span>
            <span className="text-gray-900">${total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
