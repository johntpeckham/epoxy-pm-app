'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import {
  CheckSquareIcon,
  CalendarIcon,
  UserIcon,
  XIcon,
} from 'lucide-react'
import { Task, TaskStatus, Profile, Project } from '@/types'

interface TaskWithProject extends Task {
  project_name: string
}

interface TasksPageClientProps {
  initialTasks: TaskWithProject[]
  profiles: Profile[]
  projects: Project[]
  userId: string
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  unable_to_complete: { label: 'Unable to Complete', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
}

const STATUS_BUTTONS: { value: TaskStatus; label: string; inactiveColor: string; activeColor: string }[] = [
  { value: 'in_progress', label: 'In Progress', inactiveColor: 'border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100', activeColor: 'border-yellow-500 bg-yellow-500 text-white' },
  { value: 'completed', label: 'Completed', inactiveColor: 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100', activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'unable_to_complete', label: 'Unable to Complete', inactiveColor: 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100', activeColor: 'border-red-500 bg-red-500 text-white' },
]

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function TasksPageClient({
  initialTasks,
  profiles,
  projects,
  userId,
}: TasksPageClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  function getProfileName(userId: string | null) {
    if (!userId) return 'Unassigned'
    const profile = profileMap.get(userId)
    return profile?.display_name || userId.slice(0, 8)
  }

  function getPhotoUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  async function handleStatusChange(task: TaskWithProject, newStatus: TaskStatus) {
    setUpdatingStatus(true)
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id)

    if (!error) {
      // Update the selected task in place
      setSelectedTask({ ...task, status: newStatus })
      router.refresh()
    }
    setUpdatingStatus(false)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {initialTasks.length} task{initialTasks.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {/* Task list */}
      {initialTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckSquareIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No tasks yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Create tasks from a project feed using the + menu.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialTasks.map((task) => {
            const statusCfg = STATUS_CONFIG[task.status]
            const assignedName = getProfileName(task.assigned_to)

            return (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-amber-300 hover:shadow-sm transition group"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  {/* Photo thumbnail */}
                  {task.photo_url && (
                    <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        src={getPhotoUrl(task.photo_url)}
                        alt=""
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{task.title}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      <span className="text-xs text-gray-500">{task.project_name}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <UserIcon className="w-3 h-3" />
                        {assignedName}
                      </span>
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Task detail modal ─────────────────────────────────────────────────── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedTask(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">{selectedTask.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedTask.project_name}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition flex-shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Status buttons */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</p>
                <div className="flex gap-2">
                  {STATUS_BUTTONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(selectedTask, opt.value)}
                      disabled={updatingStatus}
                      className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition disabled:opacity-60 ${
                        selectedTask.status === opt.value ? opt.activeColor : opt.inactiveColor
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTask.description}</p>
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assigned To</p>
                  <p className="text-sm text-gray-700">{getProfileName(selectedTask.assigned_to)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created By</p>
                  <p className="text-sm text-gray-700">{getProfileName(selectedTask.created_by)}</p>
                </div>
                {selectedTask.due_date && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                    <p className="text-sm text-gray-700">{formatDate(selectedTask.due_date)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created</p>
                  <p className="text-sm text-gray-700">{formatTimestamp(selectedTask.created_at)}</p>
                </div>
              </div>

              {/* Photo */}
              {selectedTask.photo_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photo</p>
                  <button
                    onClick={() => setPreviewImage(getPhotoUrl(selectedTask.photo_url!))}
                    className="block"
                  >
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        src={getPhotoUrl(selectedTask.photo_url)}
                        alt="Task photo"
                        fill
                        className="object-cover hover:opacity-90 transition"
                        sizes="128px"
                      />
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setSelectedTask(null)}
                className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image preview overlay ─────────────────────────────────────────────── */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPreviewImage(null)} />
          <div className="relative max-w-3xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg text-gray-500 hover:text-gray-800 transition z-10"
            >
              <XIcon className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Task photo preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
