'use client'

import { useState } from 'react'
import { SettingsIcon, PencilIcon } from 'lucide-react'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { JobWalk } from './JobWalkClient'
import JobWalkEditInfoModal from './JobWalkEditInfoModal'
import { usePermissions } from '@/lib/usePermissions'

interface JobWalkInfoCardProps {
  walk: JobWalk
  customers: Customer[]
  assignees?: AppointmentAssigneeOption[]
  isAdmin?: boolean
  onPatch: (patch: Partial<JobWalk>) => void
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function JobWalkInfoCard({
  walk,
  customers,
  assignees = [],
  isAdmin = true,
  onPatch,
}: JobWalkInfoCardProps) {
  const { canEdit } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)

  const emptyValue = <span className="text-sm text-gray-300">—</span>

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Project',
      value: walk.project_name ? (
        <span className="text-sm text-gray-900">{walk.project_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Customer',
      value: walk.customer_name ? (
        <span className="text-sm text-gray-900">{walk.customer_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Email',
      value: walk.customer_email ? (
        <a
          href={`mailto:${walk.customer_email}`}
          className="text-sm text-amber-600 hover:underline break-all"
        >
          {walk.customer_email}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Phone',
      value: walk.customer_phone ? (
        <a
          href={`tel:${walk.customer_phone}`}
          className="text-sm text-amber-600 hover:underline"
        >
          {walk.customer_phone}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Address',
      value: walk.address ? (
        <span className="text-sm text-gray-900">{walk.address}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Date',
      value: formatDate(walk.date) ? (
        <span className="text-sm text-gray-900">{formatDate(walk.date)}</span>
      ) : (
        emptyValue
      ),
    },
  ]

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <SettingsIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Job Walk Info</h3>
          {canEdit('job_walk') && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit job walk info"
              className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <dl className="divide-y divide-gray-100">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <dt className="w-24 flex-shrink-0 text-[11px] font-semibold text-gray-400 uppercase tracking-wide pt-0.5">
                {row.label}
              </dt>
              <dd className="flex-1 min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {editOpen && (
        <JobWalkEditInfoModal
          walk={walk}
          customers={customers}
          assignees={assignees}
          isAdmin={isAdmin}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => onPatch(patch)}
        />
      )}
    </>
  )
}
