'use client'

import { FileTextIcon } from 'lucide-react'
import type { Estimate } from './types'

interface EstimatesListProps {
  estimates: Estimate[]
  onSelect: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-amber-100 text-amber-700',
}

export default function EstimatesList({ estimates, onSelect }: EstimatesListProps) {
  if (estimates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No estimates for this customer yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2">
      {estimates.map((est) => (
        <button
          key={est.id}
          onClick={() => onSelect(est.id)}
          className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-900">
              #{est.estimate_number}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[est.status] ?? STATUS_COLORS.Draft}`}>
              {est.status}
            </span>
          </div>
          {est.project_name && (
            <p className="text-sm text-gray-700 truncate">{est.project_name}</p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">{est.date}</span>
            <span className="text-sm font-medium text-gray-900">
              ${(est.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
