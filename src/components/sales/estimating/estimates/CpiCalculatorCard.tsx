'use client'

import { XIcon, CalculatorIcon } from 'lucide-react'

interface CpiCalculatorCardProps {
  onRemove: () => void
}

const FINAL_TOTAL = 27694
const CPI_PERCENT = 0.6
const CLIENT_PERCENT = 0.4

export default function CpiCalculatorCard({ onRemove }: CpiCalculatorCardProps) {
  const cpiAmount = Math.round(FINAL_TOTAL * CPI_PERCENT)
  const clientAmount = FINAL_TOTAL - cpiAmount

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <CalculatorIcon className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            CPI Calculator
          </h4>
        </div>
        <button
          onClick={onRemove}
          className="text-gray-300 hover:text-gray-500 p-0.5 rounded transition"
          title="Remove module"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Final total</span>
          <span className="font-semibold text-gray-900">
            ${FINAL_TOTAL.toLocaleString()}
          </span>
        </div>

        <div className="border-t border-gray-200" />

        <div className="flex justify-between">
          <span className="text-gray-600">60% CPI</span>
          <span className="font-medium text-gray-900">
            ${cpiAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">40% Client</span>
          <span className="font-medium text-gray-900">
            ${clientAmount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
