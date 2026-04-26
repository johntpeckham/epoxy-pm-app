'use client'

import { useState } from 'react'
import { SettingsIcon, PencilIcon } from 'lucide-react'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import type { Lead } from './LeadsClient'
import LeadEditInfoModal from './LeadEditInfoModal'

interface LeadInfoCardProps {
  lead: Lead
  customers: Customer[]
  assignees?: AppointmentAssigneeOption[]
  isAdmin?: boolean
  onPatch: (patch: Partial<Lead>) => void
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

export default function LeadInfoCard({ lead, customers, assignees = [], isAdmin = true, onPatch }: LeadInfoCardProps) {
  const [editOpen, setEditOpen] = useState(false)

  const emptyValue = <span className="text-sm text-gray-300">—</span>

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Project',
      value: lead.project_name ? (
        <span className="text-sm text-gray-900">{lead.project_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Customer',
      value: lead.customer_name ? (
        <span className="text-sm text-gray-900">{lead.customer_name}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Email',
      value: lead.customer_email ? (
        <a
          href={`mailto:${lead.customer_email}`}
          className="text-sm text-amber-600 hover:underline break-all"
        >
          {lead.customer_email}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Phone',
      value: lead.customer_phone ? (
        <a
          href={`tel:${lead.customer_phone}`}
          className="text-sm text-amber-600 hover:underline"
        >
          {lead.customer_phone}
        </a>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Address',
      value: lead.address ? (
        <span className="text-sm text-gray-900">{lead.address}</span>
      ) : (
        emptyValue
      ),
    },
    {
      label: 'Date',
      value: formatDate(lead.date) ? (
        <span className="text-sm text-gray-900">{formatDate(lead.date)}</span>
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
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Lead Info</h3>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label="Edit lead info"
            className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
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
        <LeadEditInfoModal
          lead={lead}
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
