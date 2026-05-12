'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import type { AppointmentRow } from './AppointmentDetailClient'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import type { LeadCategory } from '../leads/LeadsClient'
import ConvertToLeadModal from '../leads/ConvertToLeadModal'
import ConvertToJobWalkModal from '@/components/job-walk/ConvertToJobWalkModal'

interface AppointmentPushMenuProps {
  appointment: AppointmentRow
  userId: string
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  onPatch: (patch: Partial<AppointmentRow>) => void
}

export default function AppointmentPushMenu({
  appointment,
  userId,
  assignees = [],
  categories = [],
  onPatch,
}: AppointmentPushMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [showJobWalkModal, setShowJobWalkModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  return (
    <>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
        >
          Push to…
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowLeadModal(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to lead
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowJobWalkModal(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to job walk
            </button>
          </div>
        )}
      </div>

      {showLeadModal && (
        <ConvertToLeadModal
          userId={userId}
          categories={categories}
          assignees={assignees}
          source={{ type: 'appointment', id: appointment.id }}
          onClose={() => setShowLeadModal(false)}
          onSourcePushed={(newLeadId) => {
            // Appointment source's doneStatus is 'completed'. pushed_to
            // is not written because crm_appointments.pushed_to CHECK
            // forbids 'lead'.
            onPatch({ status: 'completed' })
            router.push(`/sales/leads/${newLeadId}`)
          }}
        />
      )}

      {showJobWalkModal && (
        <ConvertToJobWalkModal
          userId={userId}
          assignees={assignees}
          categories={categories}
          source={{ type: 'appointment', id: appointment.id }}
          onClose={() => setShowJobWalkModal(false)}
          onSourcePushed={(newWalkId) => {
            // Appointment source's doneStatus is 'completed'.
            // crm_appointments.pushed_to CHECK permits 'job_walk', so we
            // also write the pushed_to / pushed_ref_id back-reference.
            onPatch({
              status: 'completed',
              pushed_to: 'job_walk',
              pushed_ref_id: newWalkId,
            })
            router.push(`/job-walk/${newWalkId}`)
          }}
        />
      )}
    </>
  )
}
