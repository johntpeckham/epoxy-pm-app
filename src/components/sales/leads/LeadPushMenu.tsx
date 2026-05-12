'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import type { Lead } from './LeadsClient'
import type { LeadCategory } from './LeadsClient'
import type {
  AppointmentContactOption,
  AppointmentAssigneeOption,
} from '../NewAppointmentModal'
import ConvertToAppointmentModal from '../ConvertToAppointmentModal'
import ConvertToJobWalkModal from '@/components/job-walk/ConvertToJobWalkModal'

interface LeadPushMenuProps {
  lead: Lead
  userId: string
  // Optional: the detail page may already have these cached. The Convert
  // modals fall back to fetching what they need if these are empty.
  contacts?: AppointmentContactOption[]
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  onPatch: (patch: Partial<Lead>) => void
}

export default function LeadPushMenu({
  lead,
  userId,
  contacts = [],
  assignees = [],
  categories = [],
  onPatch,
}: LeadPushMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
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
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
        >
          Push to…
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowAppointmentModal(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to appointment
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

      {showAppointmentModal && (
        <ConvertToAppointmentModal
          userId={userId}
          contacts={contacts}
          assignees={assignees}
          categories={categories}
          source={{ type: 'lead', id: lead.id }}
          onClose={() => setShowAppointmentModal(false)}
          onSourcePushed={(newApptId) => {
            // Mirror what the lateral utility just wrote so the detail
            // page UI matches without a refetch. Per the 2D status flip
            // map in lateralConversion.ts, lead→appointment writes
            // 'appointment_set' on the source. pushed_to is permitted by
            // leads.pushed_to CHECK for both lateral targets.
            onPatch({
              status: 'appointment_set',
              pushed_to: 'appointment',
              pushed_ref_id: newApptId,
            })
            router.push(`/sales/appointments/${newApptId}`)
          }}
        />
      )}

      {showJobWalkModal && (
        <ConvertToJobWalkModal
          userId={userId}
          assignees={assignees}
          categories={categories}
          source={{ type: 'lead', id: lead.id }}
          onClose={() => setShowJobWalkModal(false)}
          onSourcePushed={(newWalkId) => {
            // lead→job_walk writes 'job_walk_scheduled' per the 2D status
            // flip map. pushed_to allowed by leads.pushed_to CHECK.
            onPatch({
              status: 'job_walk_scheduled',
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
