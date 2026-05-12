'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import type { JobWalk } from './JobWalkClient'
import type {
  AppointmentContactOption,
  AppointmentAssigneeOption,
} from '@/components/sales/NewAppointmentModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import ConvertToLeadModal from '@/components/sales/leads/ConvertToLeadModal'
import ConvertToAppointmentModal from '@/components/sales/ConvertToAppointmentModal'

interface JobWalkPushMenuProps {
  walk: JobWalk
  userId: string
  contacts?: AppointmentContactOption[]
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  onPatch: (patch: Partial<JobWalk>) => void
}

export default function JobWalkPushMenu({
  walk,
  userId,
  contacts = [],
  assignees = [],
  categories = [],
  onPatch,
}: JobWalkPushMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
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
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
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
                setShowAppointmentModal(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to appointment
            </button>
          </div>
        )}
      </div>

      {showLeadModal && (
        <ConvertToLeadModal
          userId={userId}
          categories={categories}
          assignees={assignees}
          source={{ type: 'job_walk', id: walk.id }}
          onClose={() => setShowLeadModal(false)}
          onSourcePushed={(newLeadId) => {
            // job_walk→lead writes 'pushed_to_lead' per the 2D status
            // flip map. pushed_to column is skipped because
            // job_walks.pushed_to CHECK does not permit 'lead'.
            onPatch({ status: 'pushed_to_lead' })
            router.push(`/sales/leads/${newLeadId}`)
          }}
        />
      )}

      {showAppointmentModal && (
        <ConvertToAppointmentModal
          userId={userId}
          contacts={contacts}
          assignees={assignees}
          categories={categories}
          source={{ type: 'job_walk', id: walk.id }}
          onClose={() => setShowAppointmentModal(false)}
          onSourcePushed={(newApptId) => {
            // job_walk→appointment writes 'pushed_to_appointment' per
            // the 2D status flip map. pushed_to column is skipped because
            // job_walks.pushed_to CHECK does not permit 'appointment'.
            onPatch({ status: 'pushed_to_appointment' })
            router.push(`/sales/appointments/${newApptId}`)
          }}
        />
      )}
    </>
  )
}
