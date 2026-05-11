'use client'

import AddLeadModal from './AddLeadModal'
import type { LockedCustomer } from '@/components/shared/CreationFormModal'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import type { Lead, LeadCategory } from './LeadsClient'
import type { Customer } from '@/components/proposals/types'

interface ConvertToLeadModalProps {
  userId: string
  isAdmin?: boolean
  categories: LeadCategory[]
  assignees?: AppointmentAssigneeOption[]
  lockedCustomer: LockedCustomer
  onClose: () => void
  onCreated: (lead: Lead, newCustomer?: Customer | null) => void
}

export default function ConvertToLeadModal(props: ConvertToLeadModalProps) {
  return (
    <AddLeadModal
      userId={props.userId}
      isAdmin={props.isAdmin}
      customers={[]}
      categories={props.categories}
      assignees={props.assignees}
      lockedCustomer={props.lockedCustomer}
      onClose={props.onClose}
      onCreated={props.onCreated}
    />
  )
}
