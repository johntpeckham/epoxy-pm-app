'use client'

import { useState } from 'react'
import { XIcon, SlidersHorizontalIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface TakeoffDefaultsEditorProps {
  onClose: () => void
}

export default function TakeoffDefaultsEditor({ onClose }: TakeoffDefaultsEditorProps) {
  const [taxRate, setTaxRate] = useState('9.25')
  const [mobilization, setMobilization] = useState('500')
  const [overhead, setOverhead] = useState('15')
  const [profit, setProfit] = useState('30')

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontalIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">Takeoff Defaults</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-500">
              Set default values used when creating new takeoffs.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobilization cost ($)
              </label>
              <input
                type="number"
                step="1"
                value={mobilization}
                onChange={(e) => setMobilization(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overhead (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={overhead}
                onChange={(e) => setOverhead(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profit (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={profit}
                onChange={(e) => setProfit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>

          <div
            className="flex-none flex justify-end gap-2 p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
