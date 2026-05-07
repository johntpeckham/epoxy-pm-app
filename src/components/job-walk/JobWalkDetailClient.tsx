'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  FootprintsIcon,
  Trash2Icon,
} from 'lucide-react'
import Link from 'next/link'
import { usePermissions } from '@/lib/usePermissions'
import { softDeleteJobWalk } from '@/lib/trashBin'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { JobWalk, JobWalkStatus } from './JobWalkClient'
import { JOB_WALK_STATUS_COLORS, JOB_WALK_STATUS_OPTIONS } from './JobWalkClient'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import KebabMenu from '@/components/ui/KebabMenu'
import UnifiedInfoCard, {
  type UnifiedInfoFields,
  type LeadCategoryOption,
} from '@/components/shared/UnifiedInfoCard'
import ProjectDetailsCard from '@/components/shared/ProjectDetailsCard'
import PhotosCard from '@/components/shared/PhotosCard'
import MeasurementsCard from '@/components/shared/MeasurementsCard'
import JobWalkCamToPlanCard from './JobWalkCamToPlanCard'
import JobWalkPushMenu from './JobWalkPushMenu'

interface JobWalkDetailClientProps {
  initialWalk: JobWalk
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  initialCategories: LeadCategoryOption[]
  userId: string
  isAdmin: boolean
}

export default function JobWalkDetailClient({
  initialWalk,
  customers,
  assignees,
  initialCategories,
  userId,
  isAdmin,
}: JobWalkDetailClientProps) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const canManage = canEdit('job_walk')

  const [walk, setWalk] = useState<JobWalk>(initialWalk)
  const [categories, setCategories] = useState<LeadCategoryOption[]>(initialCategories)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteToast, setDeleteToast] = useState<string | null>(null)

  const handleUpdate = (patch: Partial<JobWalk>) =>
    setWalk((prev) => ({ ...prev, ...patch }))

  const handleInfoPatch = (patch: Partial<UnifiedInfoFields>) =>
    setWalk((prev) => ({ ...prev, ...patch } as JobWalk))

  const setWalkStatus = async (next: JobWalkStatus) => {
    if (next === walk.status) return
    setWalk((prev) => ({ ...prev, status: next }))
    const supabase = createClient()
    const { error } = await supabase
      .from('job_walks')
      .update({ status: next })
      .eq('id', walk.id)
    if (error) {
      console.error('[JobWalk] Status update failed:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      setWalk((prev) => ({ ...prev, status: walk.status }))
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const supabase = createClient()
    const result = await softDeleteJobWalk(supabase, walk.id, walk.project_name, userId)
    if (result.error) {
      setDeleting(false)
      setConfirmDelete(false)
      setDeleteToast(result.error)
      setTimeout(() => setDeleteToast(null), 6000)
      return
    }
    router.push('/job-walk')
  }

  const infoData: UnifiedInfoFields = {
    project_name: walk.project_name,
    company_id: walk.company_id,
    customer_name: walk.customer_name,
    customer_email: walk.customer_email,
    customer_phone: walk.customer_phone,
    address: walk.address,
    date: walk.date,
    assigned_to: walk.assigned_to,
    lead_source: walk.lead_source,
    lead_category_id: walk.lead_category_id,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href="/job-walk"
              className="flex-shrink-0 p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <FootprintsIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {walk.project_name || 'Job Walk'}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={walk.status}
              onChange={(e) => setWalkStatus(e.target.value as JobWalkStatus)}
              style={{
                backgroundColor: JOB_WALK_STATUS_COLORS[walk.status as JobWalkStatus].bg,
                borderColor: JOB_WALK_STATUS_COLORS[walk.status as JobWalkStatus].border,
                color: JOB_WALK_STATUS_COLORS[walk.status as JobWalkStatus].text,
              }}
              className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
            >
              {JOB_WALK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {canManage && (
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
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <JobWalkPushMenu
            walk={walk}
            userId={userId}
            onPatch={handleUpdate}
          />
        </div>
        <UnifiedInfoCard
          parentType="job_walk"
          parentId={walk.id}
          data={infoData}
          customers={customers}
          assignees={assignees}
          categories={categories}
          isAdmin={isAdmin}
          onPatch={handleInfoPatch}
          onCategoriesChanged={(next) => setCategories(next)}
        />
        <ProjectDetailsCard
          parentType="job_walk"
          parentId={walk.id}
          projectDetails={walk.project_details}
          onPatch={(value) => handleUpdate({ project_details: value })}
        />
        <MeasurementsCard
          parentType="job_walk"
          parentId={walk.id}
          userId={userId}
          measurements={walk.measurements}
          onMeasurementsPatch={(value) => handleUpdate({ measurements: value })}
        />
        <PhotosCard parentType="job_walk" parentId={walk.id} userId={userId} />
        <JobWalkCamToPlanCard />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Job Walk"
          message={`Are you sure you want to delete "${walk.project_name}"? It will be moved to the trash bin and can be restored within 1 year.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => (deleting ? null : setConfirmDelete(false))}
        />
      )}

      {deleteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-md w-full px-4">
          <div className="bg-red-600 text-white text-sm rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
            <span className="flex-1 break-words">{deleteToast}</span>
            <button
              onClick={() => setDeleteToast(null)}
              className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
