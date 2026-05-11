'use client'

import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
  type LockedCompany,
} from './NewAppointmentModal'
import type { LeadCategory } from './leads/LeadsClient'

interface ConvertToAppointmentModalProps {
  userId: string
  isAdmin?: boolean
  contacts: AppointmentContactOption[]
  assignees: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  lockedCustomer: LockedCompany
  onClose: () => void
  onSaved: (createdId: string) => void
  onCompanyCreated?: (company: AppointmentCompanyOption) => void
}

export default function ConvertToAppointmentModal(props: ConvertToAppointmentModalProps) {
  return (
    <NewAppointmentModal
      userId={props.userId}
      isAdmin={props.isAdmin}
      companies={[]}
      contacts={props.contacts}
      assignees={props.assignees}
      categories={props.categories}
      lockedCustomer={props.lockedCustomer}
      onClose={props.onClose}
      onSaved={props.onSaved}
      onCompanyCreated={props.onCompanyCreated}
    />
  )
}
