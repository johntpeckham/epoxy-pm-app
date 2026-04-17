'use client'

import { PlusIcon, PackageIcon } from 'lucide-react'

const SAMPLE_MATERIALS = [
  { product: 'Polyurea 350', desc: 'Two-component polyurea basecoat', unit: 'gal', qty: 45, cost: 62, total: 2790 },
  { product: 'Epoxy Primer 100', desc: 'Moisture-tolerant epoxy primer', unit: 'gal', qty: 25, cost: 48, total: 1200 },
  { product: 'Topcoat UV-500', desc: 'UV-stable polyaspartic topcoat', unit: 'gal', qty: 30, cost: 78, total: 2340 },
  { product: 'Quartz Broadcast #40', desc: '40-mesh colored quartz aggregate', unit: 'bag', qty: 60, cost: 32, total: 1920 },
]

export default function MaterialsTab() {
  const subtotal = SAMPLE_MATERIALS.reduce((s, m) => s + m.total, 0)
  const shipping = 350
  const taxRate = 0.0925
  const tax = Math.round((subtotal + shipping) * taxRate)
  const materialsTotal = subtotal + shipping + tax

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <PackageIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Materials</h3>
          </div>
          <button className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition">
            <PlusIcon className="w-3.5 h-3.5" />
            Add from master list
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide">
                <th className="pb-2 pr-3 font-medium">Product</th>
                <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Description</th>
                <th className="pb-2 pr-3 font-medium text-center">Unit</th>
                <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SAMPLE_MATERIALS.map((m, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{m.product}</td>
                  <td className="py-2.5 pr-3 text-gray-500 hidden sm:table-cell">{m.desc}</td>
                  <td className="py-2.5 pr-3 text-center text-gray-500">{m.unit}</td>
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
            <span className="text-gray-500">Shipping</span>
            <span className="text-gray-700">${shipping.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tax (9.25%)</span>
            <span className="text-gray-700">${tax.toLocaleString()}</span>
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div className="flex justify-between font-semibold">
            <span className="text-gray-900">Materials total</span>
            <span className="text-gray-900">${materialsTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
