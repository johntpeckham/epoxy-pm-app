'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  TargetIcon,
  Trash2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import KebabMenu from '@/components/ui/KebabMenu'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import type { Lead, LeadStatus, LeadCategory as LeadCategoryRow } from './LeadsClient'
import UnifiedInfoCard, {
  type UnifiedInfoFields,
} from '@/components/shared/UnifiedInfoCard'
import ProjectDetailsCard from '@/components/shared/ProjectDetailsCard'
import PhotosCard from '@/components/shared/PhotosCard'
import MeasurementsCard from '@/components/shared/MeasurementsCard'
import LeadPushMenu from './LeadPushMenu'
import ConvertToProjectModal from '@/components/sales/estimating/ConvertToProjectModal'

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating' },
  { value: 'unable_to_reach', label: 'Unable to Reach' },
  { value: 'disqualified', label: 'Disqualified' },
]

const LEAD_STATUS_COLORS: Record<LeadStatus, { bg: string; border: string; text: string }> = {
  new: { bg: 'rgba(156,163,175,0.22)', border: 'rgba(156,163,175,0.55)', text: '#d1d5db' },
  appointment_set: { bg: 'rgba(74,222,128,0.22)', border: 'rgba(74,222,128,0.55)', text: '#4ade80' },
  sent_to_estimating: { bg: 'rgba(96,165,250,0.22)', border: 'rgba(96,165,250,0.55)', text: '#60a5fa' },
  unable_to_reach: { bg: 'rgba(251,191,36,0.22)', border: 'rgba(251,191,36,0.55)', text: '#fbbf24' },
  disqualified: { bg: 'rgba(248,113,113,0.22)', border: 'rgba(248,113,113,0.55)', text: '#f87171' },
}

interface LeadDetailClientProps {
  initialLead: Lead
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  initialCategories: LeadCategoryRow[]
  userId: string
  isAdmin: boolean
}

export default function LeadDetailClient({
  initialLead,
  customers,
  assignees,
  initialCategories,
  userId,
  isAdmin,
}: LeadDetailClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [lead, setLead] = useState<Lead>(initialLead)
  const categories = initialCategories
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)
  const [showConvertModal, setShowConvertModal] = useState(false)

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

  function handleUpdate(patch: Partial<Lead>) {
    setLead((prev) => ({ ...prev, ...patch }))
  }

  function handleInfoPatch(patch: Partial<UnifiedInfoFields>) {
    setLead((prev) => ({ ...prev, ...patch } as Lead))
  }

  async function setLeadStatus(next: LeadStatus) {
    if (next === lead.status) return
    const previous = lead.status
    setLead((prev) => ({ ...prev, status: next }))
    const { error } = await supabase
      .from('leads')
      .update({ status: next })
      .eq('id', lead.id)
    if (error) {
      console.error('[LEAD STATUS UPDATE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      setLead((prev) => ({ ...prev, status: previous }))
      showToast(`Status update failed: ${error.message}`)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    setDeleting(false)
    if (error) {
      console.error('[LEAD DELETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      showToast(`Delete failed: ${error.message}`)
      setConfirmDelete(false)
      return
    }
    router.push('/sales/leads')
  }

  const colors = LEAD_STATUS_COLORS[lead.status]

  const infoData: UnifiedInfoFields = {
    project_name: lead.project_name,
    company_id: lead.company_id,
    customer_name: lead.customer_name,
    customer_email: lead.customer_email,
    customer_phone: lead.customer_phone,
    address: lead.address,
    project_address: lead.project_address,
    date: lead.date,
    assigned_to: lead.assigned_to,
    lead_source: lead.lead_source,
    lead_category_id: lead.lead_category_id,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href="/sales/leads"
              className="flex-shrink-0 p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <TargetIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {lead.project_name || 'Lead'}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={lead.status}
              onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
                color: colors.text,
              }}
              className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
            >
              {LEAD_STATUS_OPTIONS.map((o) => (
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
          <LeadPushMenu
            lead={lead}
            userId={userId}
            assignees={assignees}
            categories={categories}
            onPatch={handleUpdate}
          />
          {lead.converted_to_project_id ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/estimating?customer=${lead.company_id}&project=${lead.converted_to_project_id}`
                )
              }
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
            >
              View Project
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowConvertModal(true)}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
            >
              Create Project
            </button>
          )}
        </div>
        <UnifiedInfoCard
          parentType="lead"
          parentId={lead.id}
          data={infoData}
          customers={customers}
          assignees={assignees}
          categories={categories}
          isAdmin={isAdmin}
          onPatch={handleInfoPatch}
        />
        <ProjectDetailsCard
          parentType="lead"
          parentId={lead.id}
          projectDetails={lead.project_details}
          onPatch={(value) => handleUpdate({ project_details: value })}
        />
        <MeasurementsCard
          parentType="lead"
          parentId={lead.id}
          userId={userId}
          measurements={lead.measurements}
          onMeasurementsPatch={(value) => handleUpdate({ measurements: value })}
        />
        <PhotosCard parentType="lead" parentId={lead.id} userId={userId} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Lead"
          message="Are you sure you want to delete this lead? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => (deleting ? null : setConfirmDelete(false))}
        />
      )}

      {showConvertModal && (
        <ConvertToProjectModal
          userId={userId}
          sourceType="lead"
          sourceId={lead.id}
          customers={customers}
          onClose={() => setShowConvertModal(false)}
          onConverted={(project) => {
            // Update local lead state so the button flips to "View Project"
            // immediately. The conversion util also bumped the source's
            // status to 'sent_to_estimating' server-side — mirror that
            // here so the status dropdown shows the new value without a
            // refetch.
            handleUpdate({
              converted_to_project_id: project.id,
              status: 'sent_to_estimating',
            })
            setShowConvertModal(false)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg flex items-center gap-3">
          <span>{toast.message}</span>
          {toast.href && (
            <a href={toast.href} className="text-amber-300 hover:text-amber-100 underline">
              View
            </a>
          )}
        </div>
      )}
    </div>
  )
}
