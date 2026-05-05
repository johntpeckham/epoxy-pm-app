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
import JobWalkInfoCard from './JobWalkInfoCard'
import JobWalkPhotosCard from './JobWalkPhotosCard'
import JobWalkNotesCard from './JobWalkNotesCard'
import JobWalkMeasurementsCard from './JobWalkMeasurementsCard'
import JobWalkCamToPlanCard from './JobWalkCamToPlanCard'
import JobWalkPushMenu from './JobWalkPushMenu'

interface JobWalkDetailClientProps {
  initialWalk: JobWalk
  customers: Customer[]
  assignees: AppointmentAssigneeOption[]
  userId: string
}

export default function JobWalkDetailClient({
  initialWalk,
  customers,
  assignees,
  userId,
}: JobWalkDetailClientProps) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const canManage = canEdit('job_walk')

  const [walk, setWalk] = useState<JobWalk>(initialWalk)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteToast, setDeleteToast] = useState<string | null>(null)

  const handleUpdate = (patch: Partial<JobWalk>) =>
    setWalk((prev) => ({ ...prev, ...patch }))

  const setWalkStatus = async (next: JobWalkStatus) => {
    if (next === walk.status) return
    setWalk((prev) => ({ ...prev, status: next }))
    const supabase = createClient()
    const { error } = await supabase
      .from('job_walks')
      .update({ status: next })
      .eq('id', walk.id)
    if (error) {
      console.error('[JobWalk] Status update failed:', error)
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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header bar — full-width background, content constrained to max-w-3xl */}
      <div className="border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
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
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Delete job walk"
                aria-label="Delete job walk"
                className="p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <JobWalkPushMenu
            walk={walk}
            userId={userId}
            onPatch={handleUpdate}
          />
        </div>
        <JobWalkInfoCard
          walk={walk}
          customers={customers}
          assignees={assignees}
          onPatch={handleUpdate}
        />
        <JobWalkPhotosCard walkId={walk.id} userId={userId} />
        <JobWalkNotesCard walk={walk} onPatch={handleUpdate} />
        <JobWalkMeasurementsCard walk={walk} userId={userId} onPatch={handleUpdate} />
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
