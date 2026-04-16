'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { FileTextIcon, PlusIcon } from 'lucide-react'
import type { Estimate } from '../estimates/types'

interface ProjectEstimatesCardProps {
  customerName: string
  estimates: Estimate[]
  onNewEstimate: () => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-amber-100 text-amber-700',
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function ProjectEstimatesCard({
  customerName,
  estimates,
  onNewEstimate,
}: ProjectEstimatesCardProps) {
  const sorted = useMemo(
    () =>
      [...estimates].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [estimates]
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <FileTextIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Estimates</h3>
        <button
          onClick={onNewEstimate}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New estimate
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-400">
            No estimates for {customerName} yet.
          </p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-[11px] font-medium text-gray-500 px-3 py-2">
                  #
                </th>
                <th className="text-left text-[11px] font-medium text-gray-500 px-3 py-2">
                  Project
                </th>
                <th className="text-right text-[11px] font-medium text-gray-500 px-3 py-2">
                  Amount
                </th>
                <th className="text-right text-[11px] font-medium text-gray-500 px-3 py-2">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((est) => (
                <tr
                  key={est.id}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-amber-50 transition-colors"
                >
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">
                    <Link href="/estimates" className="block">
                      #{est.estimate_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href="/estimates" className="block">
                      <p className="text-sm text-gray-900 truncate max-w-xs">
                        {est.project_name || '—'}
                      </p>
                      <p className="text-xs text-gray-500">{est.date}</p>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 text-right">
                    <Link href="/estimates" className="block">
                      ${formatCurrency(est.total ?? 0)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href="/estimates" className="block">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          STATUS_COLORS[est.status] ?? STATUS_COLORS.Draft
                        }`}
                      >
                        {est.status}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
