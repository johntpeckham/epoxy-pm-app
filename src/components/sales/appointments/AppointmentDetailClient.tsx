'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  Trash2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import KebabMenu from '@/components/ui/KebabMenu'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import UnifiedInfoCard, {
  type UnifiedInfoFields,
  type LeadCategoryOption,
} from '@/components/shared/UnifiedInfoCard'
import ProjectDetailsCard from '@/components/shared/ProjectDetailsCard'
import PhotosCard from '@/components/shared/PhotosCard'
import MeasurementsCard from '@/components/shared/MeasurementsCard'
import AppointmentPushMenu from './AppointmentPushMenu'

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
export type AppointmentPushedTo = 'job_walk' | 'estimating' | 'proposal' | 'job'

export interface AppointmentRow {
  id: string
  company_id: string | null
  contact_id: string | null
  title: string | null
  project_name: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  date: string | null
  address: string | null
  project_address: string | null
  notes: string | null
  status: AppointmentStatus
  pushed_to: AppointmentPushedTo | null
  pushed_ref_id: string | null
  assigned_to: string | null
  lead_source: string | null
  lead_category_id: string | null
  project_details: string | null
  measurements: string | null
  created_by: string | null
  created_at: string
}

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'rgba(52,211,153,0.22)', border: 'rgba(52,211,153,0.55)', text: '#34d399' },
  completed: { bg: 'rgba(96,165,250,0.22)', border: 'rgba(96,165,250,0.55)', text: '#60a5fa' },
  cancelled: { bg: 'rgba(156,163,175,0.22)', border: 'rgba(156,163,175,0.55)', text: '#9ca3af' },
}

interface AppointmentDetailClientProps {
  initialAppointment: AppointmentRow
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  initialCategories: LeadCategoryOption[]
  userId: string
  isAdmin: boolean
}

export default function AppointmentDetailClient({
  initialAppointment,
  customers,
  assignees,
  initialCategories,
  userId,
  isAdmin,
}: AppointmentDetailClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [appt, setAppt] = useState<AppointmentRow>(initialAppointment)
  const [categories, setCategories] = useState<LeadCategoryOption[]>(initialCategories)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

  function handleUpdate(patch: Partial<AppointmentRow>) {
    setAppt((prev) => ({ ...prev, ...patch }))
  }

  function handleInfoPatch(patch: Partial<UnifiedInfoFields>) {
    setAppt((prev) => ({ ...prev, ...patch }))
  }

  async function setStatus(next: AppointmentStatus) {
    if (next === appt.status) return
    const previous = appt.status
    setAppt((prev) => ({ ...prev, status: next }))
    const { error } = await supabase
      .from('crm_appointments')
      .update({ status: next })
      .eq('id', appt.id)
    if (error) {
      console.error('[APPOINTMENT STATUS UPDATE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      setAppt((prev) => ({ ...prev, status: previous }))
      showToast(`Status update failed: ${error.message}`)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('crm_appointments').delete().eq('id', appt.id)
    setDeleting(false)
    if (error) {
      console.error('[APPOINTMENT DELETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      showToast(`Delete failed: ${error.message}`)
      setConfirmDelete(false)
      return
    }
    router.push('/sales/appointments')
  }

  const colors = STATUS_COLORS[appt.status]

  const infoData: UnifiedInfoFields = {
    project_name: appt.project_name,
    company_id: appt.company_id,
    customer_name: appt.customer_name,
    customer_email: appt.customer_email,
    customer_phone: appt.customer_phone,
    address: appt.address,
    project_address: appt.project_address,
    date: appt.date,
    assigned_to: appt.assigned_to,
    lead_source: appt.lead_source,
    lead_category_id: appt.lead_category_id,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href="/sales/appointments"
              className="flex-shrink-0 p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <CalendarCheckIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {appt.project_name || appt.title || 'Appointment'}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={appt.status}
              onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <KebabMenu
              variant="light"
              items={[
                {
                  label: 'Delete',
                  icon: <Trash2Icon className="w-4 h-4" />,
                  destructive: true,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <AppointmentPushMenu
            appointment={appt}
            userId={userId}
            onPatch={handleUpdate}
            showToast={showToast}
          />
        </div>
        <UnifiedInfoCard
          parentType="appointment"
          parentId={appt.id}
          data={infoData}
          customers={customers}
          assignees={assignees}
          categories={categories}
          isAdmin={isAdmin}
          onPatch={handleInfoPatch}
          onCategoriesChanged={(next) => setCategories(next)}
        />
        <ProjectDetailsCard
          parentType="appointment"
          parentId={appt.id}
          projectDetails={appt.project_details}
          onPatch={(value) => handleUpdate({ project_details: value })}
        />
        <MeasurementsCard
          parentType="appointment"
          parentId={appt.id}
          userId={userId}
          measurements={appt.measurements}
          onMeasurementsPatch={(value) => handleUpdate({ measurements: value })}
        />
        <PhotosCard parentType="appointment" parentId={appt.id} userId={userId} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Appointment"
          message="Are you sure you want to delete this appointment? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => (deleting ? null : setConfirmDelete(false))}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg flex items-center gap-3">
          <span>{toast.message}</span>
          {toast.href && (
            <Link href={toast.href} className="text-amber-300 hover:text-amber-100 underline">
              View
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
