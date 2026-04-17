'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckSquareIcon, PlusIcon, ChevronDownIcon, CameraIcon, XIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Project, Task, TaskStatus, Profile } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import Portal from '@/components/ui/Portal'
import Image from 'next/image'

interface TasksWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  new_task: { label: 'New', bg: 'bg-blue-100', text: 'text-blue-800' },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800' },
  unable_to_complete: { label: 'Unable', bg: 'bg-red-100', text: 'text-red-800' },
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'new_task', label: 'New Task' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'unable_to_complete', label: 'Unable to Complete' },
]

export default function TasksWorkspace({ project, userId, onBack }: TasksWorkspaceProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const fetchTasks = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    if (error) console.error('[TasksWorkspace] Fetch failed:', error)
    setTasks((data as Task[]) ?? [])
    setLoading(false)
  }, [project.id])

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
    fetchProfiles()
  }, [fetchTasks, fetchProfiles])

  const handleStatusChange = useCallback(async (task: Task, newStatus: TaskStatus) => {
    const supabase = createClient()
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t))
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    if (error) {
      console.error('[TasksWorkspace] Status update failed:', error)
      fetchTasks()
    }
  }, [fetchTasks])

  const togglePublished = useCallback(async (task: Task) => {
    const newVal = !(task as Task & { is_published?: boolean }).is_published
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, is_published: newVal } as Task : t))
    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({ is_published: newVal }).eq('id', task.id)
    if (error) {
      console.error('[TasksWorkspace] Publish toggle failed:', error)
      fetchTasks()
    }
  }, [fetchTasks])

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const getAssigneeName = (assignedTo: string | null) => {
    if (!assignedTo) return '—'
    const profile = profileMap.get(assignedTo)
    return profile?.display_name ?? 'Unknown'
  }

  return (
    <WorkspaceShell
      title="Field Tasks"
      icon={<CheckSquareIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Add Task
        </button>
      }
    >
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <CheckSquareIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No tasks for this project yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Create the first task
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const published = (task as Task & { is_published?: boolean }).is_published !== false
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer ${!published ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{task.title}</h4>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_CONFIG[task.status].bg} ${STATUS_CONFIG[task.status].text}`}>
                          {STATUS_CONFIG[task.status].label}
                        </span>
                        {!published && <span className="text-xs text-gray-400 italic">Hidden from feed</span>}
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>Assigned: {getAssigneeName(task.assigned_to)}</span>
                        {task.due_date && (
                          <span>Due: {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePublished(task) }}
                        className={`p-1.5 rounded transition ${published ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                        title={published ? 'Published — visible in Job Feed' : 'Hidden — not visible in Job Feed'}
                      >
                        {published ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                      </button>
                      <select
                        value={task.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          project={project}
          userId={userId}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchTasks() }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          profileMap={profileMap}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(status) => {
            handleStatusChange(selectedTask, status)
            setSelectedTask({ ...selectedTask, status })
          }}
        />
      )}
    </WorkspaceShell>
  )
}

/* ── Create Task Modal ──────────────────────────────────────────────── */

function CreateTaskModal({
  project,
  userId,
  profiles,
  onClose,
  onCreated,
}: {
  project: Project
  userId: string
  profiles: Profile[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [status, setStatus] = useState<TaskStatus>('new_task')
  const [dueDate, setDueDate] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()

    let photoUrl: string | null = null
    if (photoFile) {
      const ext = photoFile.name.split('.').pop() || 'jpg'
      const path = `${project.id}/tasks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, photoFile)
      if (uploadErr) { setError('Photo upload failed'); setSaving(false); return }
      photoUrl = path
    }

    const { error: insertErr } = await supabase.from('tasks').insert({
      project_id: project.id,
      created_by: userId,
      assigned_to: assignedTo || null,
      title: title.trim(),
      description: description.trim(),
      status,
      photo_url: photoUrl,
      due_date: dueDate || null,
    })

    if (insertErr) {
      setError('Failed to create task')
      setSaving(false)
      return
    }

    // Send notification if assigned
    if (assignedTo && assignedTo !== userId) {
      const creatorProfile = profiles.find((p) => p.id === userId)
      const creatorName = creatorProfile?.display_name ?? 'Someone'
      await supabase.from('notifications').insert({
        user_id: assignedTo,
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `${creatorName} assigned you: ${title.trim()}`,
        link: '/tasks',
      }).then(() => {})
    }

    onCreated()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">New Task</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="p-4 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" placeholder="Task title" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="Optional description" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assign To</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      status === s.value
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Photo</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
              {photoPreview ? (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                  <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                  <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }} className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white"><XIcon className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-2">
                  <CameraIcon className="w-4 h-4" />
                  Attach photo
                </button>
              )}
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

/* ── Task Detail Modal ──────────────────────────────────────────────── */

function TaskDetailModal({
  task,
  profileMap,
  onClose,
  onStatusChange,
}: {
  task: Task
  profileMap: Map<string, Profile>
  onClose: () => void
  onStatusChange: (status: TaskStatus) => void
}) {
  const supabase = createClient()

  const getPhotoUrl = (path: string) => supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl

  const getDisplayName = (id: string | null) => {
    if (!id) return '—'
    return profileMap.get(id)?.display_name ?? 'Unknown'
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 truncate pr-2">{task.title}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="p-4 space-y-4">
            {/* Status buttons */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => onStatusChange(s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      task.status === s.value
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {task.description && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Assigned To</p>
                <p className="text-sm text-gray-900">{getDisplayName(task.assigned_to)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Created By</p>
                <p className="text-sm text-gray-900">{getDisplayName(task.created_by)}</p>
              </div>
              {task.due_date && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">Due Date</p>
                  <p className="text-sm text-gray-900">{new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Created</p>
                <p className="text-sm text-gray-900">{new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>

            {task.photo_url && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Photo</label>
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-gray-200">
                  <Image src={getPhotoUrl(task.photo_url)} alt="Task photo" fill className="object-contain bg-gray-50" />
                </div>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Close</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
