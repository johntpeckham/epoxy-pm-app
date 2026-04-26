'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TableIcon, PlusIcon, ChevronRightIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/estimates/types'
import type { EstimatingProject, Takeoff, TAKEOFF_STATUS_STYLES } from './types'
import NewTakeoffModal from './NewTakeoffModal'

interface ProjectTakeoffSheetsCardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-700' },
}

export default function ProjectTakeoffSheetsCard({
  project,
  customer,
  userId,
}: ProjectTakeoffSheetsCardProps) {
  const router = useRouter()
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    async function fetchTakeoffs() {
      const supabase = createClient()
      const { data } = await supabase
        .from('takeoffs')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
      setTakeoffs((data as Takeoff[]) ?? [])
      setLoading(false)
    }
    fetchTakeoffs()
  }, [project.id])

  function handleTakeoffCreated(takeoff: Takeoff) {
    setTakeoffs((prev) => [takeoff, ...prev])
    setShowNewModal(false)
    router.push(`/sales/estimating/takeoff/${takeoff.id}`)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <TableIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">
            Estimate
          </h3>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New takeoff
          </button>
        </div>

        {loading ? (
          <p className="text-center text-xs text-gray-400 py-6">Loading...</p>
        ) : takeoffs.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">
            No takeoffs yet for this project.
          </p>
        ) : (
          <div className="space-y-1.5">
            {takeoffs.map((t) => {
              const status = STATUS_STYLES[t.status] ?? STATUS_STYLES.draft
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    router.push(`/sales/estimating/takeoff/${t.id}`)
                  }
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewTakeoffModal
          projectId={project.id}
          customerId={customer.id}
          userId={userId}
          onClose={() => setShowNewModal(false)}
          onCreated={handleTakeoffCreated}
        />
      )}
    </>
  )
}
