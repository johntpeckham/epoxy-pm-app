'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import type {
  Customer,
  Estimate,
  EstimateSettings,
} from '@/components/estimates/types'
import type { EstimatingProject } from './types'

interface EstimateEditorClientProps {
  mode: 'new' | 'edit'
  estimate: Estimate
  customer: Customer
  project: EstimatingProject | null
  settings: EstimateSettings | null
  userId: string
  canEdit: boolean
}

function statusBadgeClasses(status: string): string {
  const base =
    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap'
  if (status === 'Sent') return `${base} bg-amber-100 text-amber-700`
  if (status === 'Accepted') return `${base} bg-green-100 text-green-700`
  if (status === 'Declined') return `${base} bg-red-100 text-red-700`
  if (status === 'Invoiced') return `${base} bg-blue-100 text-blue-700`
  return `${base} bg-gray-100 text-gray-600`
}

export default function EstimateEditorClient({
  mode,
  estimate: initialEstimate,
  customer,
  project,
  // settings and userId reserved for follow-up prompts (save logic, send modal)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  settings: _settings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: _userId,
  canEdit: _canEdit,
}: EstimateEditorClientProps) {
  const [estimate] = useState<Estimate>(initialEstimate)

  const backHref = project
    ? `/sales/estimating?project=${project.id}`
    : '/sales/estimating'
  const backLabel = project ? `Back to ${project.name || 'project'}` : 'Back to Estimating'

  const title =
    mode === 'new' && !estimate.estimate_number
      ? 'New Estimate'
      : `Estimate #${estimate.estimate_number}`

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-4">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {backLabel}
        </Link>

        <div className="flex-1 min-w-0 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              {title}
            </h1>
            <span className={statusBadgeClasses(estimate.status || 'Draft')}>
              {estimate.status || 'Draft'}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{customer.name}</p>
        </div>

        {/* Action slot — Save / Send / Export PDF buttons added in follow-up prompts. */}
        <div className="flex items-center gap-2 flex-shrink-0" />
      </div>

      {/* Body — replaced in 1A-2 with the full editor form. */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">Editor body coming soon</p>
        </div>
      </div>
    </div>
  )
}
