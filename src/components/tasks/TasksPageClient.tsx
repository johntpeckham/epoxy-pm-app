'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import {
  CheckSquareIcon,
  CalendarIcon,
  UserIcon,
  XIcon,
  PlusIcon,
  CameraIcon,
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

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  new_task: { label: 'New Task', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  unable_to_complete: { label: 'Unable to Complete', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
}

const STATUS_BUTTONS: { value: TaskStatus; label: string; inactiveColor: string; activeColor: string }[] = [
  { value: 'new_task', label: 'New Task', inactiveColor: 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100', activeColor: 'border-blue-500 bg-blue-500 text-white' },
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

  // ── New Task modal state ─────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newProjectId, setNewProjectId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newAssignedTo, setNewAssignedTo] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('new_task')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null)
  const newPhotoInputRef = useRef<HTMLInputElement>(null)

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  function getProfileName(uid: string | null) {
    if (!uid) return 'Unassigned'
    const profile = profileMap.get(uid)
    return profile?.display_name || uid.slice(0, 8)
  }

  function getPhotoUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  async function handleStatusChange(task: TaskWithProject, newSt: TaskStatus) {
    setUpdatingStatus(true)
    const { error } = await supabase
      .from('tasks')
      .update({ status: newSt })
      .eq('id', task.id)

    if (!error) {
      setSelectedTask({ ...task, status: newSt })
      router.refresh()
    }
    setUpdatingStatus(false)
  }

  // ── New Task handlers ────────────────────────────────────────────────────
  function resetCreateForm() {
    setNewProjectId('')
    setNewTitle('')
    setNewDescription('')
    setNewAssignedTo('')
    setNewStatus('new_task')
    setNewDueDate('')
    setNewPhotoFile(null)
    setNewPhotoPreview(null)
    setCreateError(null)
  }

  function openCreateModal() {
    resetCreateForm()
    setShowCreateModal(true)
  }

  function handleNewPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewPhotoFile(file)
    setNewPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  async function handleCreateTask() {
    setCreating(true)
    setCreateError(null)

    try {
      if (!newProjectId) throw new Error('Please select a project')
      if (!newTitle.trim()) throw new Error('Please enter a task title')

      let photoUrl: string | null = null
      if (newPhotoFile) {
        const ext = newPhotoFile.name.split('.').pop()
        const path = `${newProjectId}/tasks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, newPhotoFile)
        if (uploadErr) throw uploadErr
        photoUrl = path
      }

      const { error: insertErr } = await supabase.from('tasks').insert({
        project_id: newProjectId,
        created_by: userId,
        assigned_to: newAssignedTo || null,
        title: newTitle.trim(),
        description: newDescription.trim(),
        status: newStatus,
        photo_url: photoUrl,
        due_date: newDueDate || null,
      })
      if (insertErr) throw insertErr

      setShowCreateModal(false)
      resetCreateForm()
      router.refresh()
    } catch (err: unknown) {
      console.error('[TasksPageClient] Create failed:', err)
      let msg = 'Failed to create task'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
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
        <button
          onClick={openCreateModal}
          disabled={projects.length === 0}
          title={projects.length === 0 ? 'Create a project first' : undefined}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Task list */}
      {initialTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckSquareIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No tasks yet</p>
          <p className="text-gray-400 text-sm mt-1">
            {projects.length > 0
              ? 'Click "New Task" to create the first one.'
              : 'Create a project first, then add tasks.'}
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

      {/* ── New Task modal ───────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{createError}</span>
                  <button onClick={() => setCreateError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Project */}
              <div>
                <label className={labelCls}>Project *</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className={labelCls}>Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Task title..."
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Task details..."
                  className={textareaCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Assign To */}
                <div>
                  <label className={labelCls}>Assign To</label>
                  <select
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Unassigned</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || p.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <label className={labelCls}>Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className={labelCls}>Status</label>
                <div className="flex gap-2">
                  {STATUS_BUTTONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewStatus(opt.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition ${
                        newStatus === opt.value ? opt.activeColor : opt.inactiveColor
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo */}
              <div>
                <label className={labelCls}>Photo</label>
                <input
                  ref={newPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleNewPhotoChange}
                />
                {newPhotoPreview ? (
                  <div className="relative inline-block">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newPhotoPreview} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => { setNewPhotoFile(null); setNewPhotoPreview(null) }}
                      className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => newPhotoInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
                  >
                    <CameraIcon className="w-4 h-4" />
                    Add photo
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={creating}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
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
