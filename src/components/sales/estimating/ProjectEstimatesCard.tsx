'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileTextIcon, PlusIcon, Loader2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Estimate } from '@/components/estimates/types'

interface ProjectEstimatesCardProps {
  customerId: string
  userId: string
}

const STATUS_COLOR: Record<Estimate['status'], string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-amber-100 text-amber-700',
  Accepted: 'bg-green-100 text-green-700',
  Invoiced: 'bg-blue-100 text-blue-700',
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProjectEstimatesCard({
  customerId,
  userId,
}: ProjectEstimatesCardProps) {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEstimates = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', customerId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setEstimates((data as Estimate[]) ?? [])
    setLoading(false)
  }, [customerId, userId])

  useEffect(() => {
    fetchEstimates()
  }, [fetchEstimates])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <FileTextIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Estimates</h3>
        <Link
          href={`/estimates?customer=${customerId}&new=1`}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New estimate
        </Link>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-gray-400">
          <Loader2Icon className="w-4 h-4 animate-spin" />
        </div>
      ) : estimates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No estimates yet for this customer.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {estimates.map((e) => (
            <Link
              key={e.id}
              href={`/estimates?customer=${customerId}&estimate=${e.id}`}
              className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-md transition"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  #{e.estimate_number}
                  {e.project_name ? ` · ${e.project_name}` : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(e.date).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[e.status]}`}
              >
                {e.status}
              </span>
              <span className="text-sm font-medium text-gray-900 tabular-nums">
                {formatMoney(e.total)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
