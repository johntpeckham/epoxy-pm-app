'use client'

import NewJobWalkModal from './NewJobWalkModal'
import type { LockedCustomer } from '@/components/shared/CreationFormModal'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import type { Customer } from '@/components/proposals/types'
import type { JobWalk } from './JobWalkClient'

interface ConvertToJobWalkModalProps {
  userId: string
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  lockedCustomer: LockedCustomer
  onClose: () => void
  onCreated: (walk: JobWalk, newCustomer?: Customer | null) => void
}

export default function ConvertToJobWalkModal(props: ConvertToJobWalkModalProps) {
  return (
    <NewJobWalkModal
      userId={props.userId}
      customers={[]}
      assignees={props.assignees}
      categories={props.categories}
      lockedCustomer={props.lockedCustomer}
      onClose={props.onClose}
      onCreated={props.onCreated}
    />
  )
}
