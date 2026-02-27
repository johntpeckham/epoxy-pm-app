'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon,
  XIcon,
  CameraIcon,
  ClipboardListIcon,
  UploadIcon,
  FileTextIcon,
  PlusIcon,
  CheckSquareIcon,
  ShieldIcon,
  LoaderIcon,
  SettingsIcon,
} from 'lucide-react'
import { Project, TaskStatus, Profile, JsaTaskTemplate, JsaTaskEntry, JsaSignatureEntry } from '@/types'
import { fetchWeatherForAddress } from '@/lib/fetchWeather'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import JsaTemplateManagerModal from '@/components/jsa-reports/JsaTemplateManagerModal'
import JsaSignatureSection from '@/components/jsa-reports/JsaSignatureSection'

type Mode = 'text' | 'photo' | 'daily_report' | 'task' | 'pdf' | 'jsa_report'

interface AddPostPanelProps {
  project: Project
  userId: string
  onPosted: () => void
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string; activeColor: string }[] = [
  { value: 'new_task', label: 'New Task', color: 'border-blue-300 text-blue-700 bg-blue-50', activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'in_progress', label: 'In Progress', color: 'border-yellow-300 text-yellow-700 bg-yellow-50', activeColor: 'border-yellow-500 bg-yellow-500 text-white' },
  { value: 'completed', label: 'Completed', color: 'border-green-300 text-green-700 bg-green-50', activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'unable_to_complete', label: 'Unable to Complete', color: 'border-red-300 text-red-700 bg-red-50', activeColor: 'border-red-500 bg-red-500 text-white' },
]

export default function AddPostPanel({ project, userId, onPosted }: AddPostPanelProps) {
  const [mode, setMode] = useState<Mode>('text')
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Permissions ──────────────────────────────────────────────────────────────
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)

  // ── Text post ──────────────────────────────────────────────────────────────
  const [message, setMessage] = useState('')

  // ── Photo post ─────────────────────────────────────────────────────────────
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Daily report ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const [rProjectName, setRProjectName] = useState(project.name)
  const [rDate, setRDate] = useState(today)
  const [rAddress, setRAddress] = useState(project.address)
  const [rReportedBy, setRReportedBy] = useState('')
  const [rForeman, setRForeman] = useState('')
  const [rWeather, setRWeather] = useState('')
  const [rWeatherLoading, setRWeatherLoading] = useState(false)
  const [rProgress, setRProgress] = useState('')
  const [rDelays, setRDelays] = useState('')
  const [rSafety, setRSafety] = useState('')
  const [rMaterials, setRMaterials] = useState('')
  const [rEmployees, setREmployees] = useState('')
  const [rFiles, setRFiles] = useState<File[]>([])
  const [rPreviews, setRPreviews] = useState<string[]>([])
  const reportPhotoInputRef = useRef<HTMLInputElement>(null)

  // ── Task ─────────────────────────────────────────────────────────────────
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskAssignedTo, setTaskAssignedTo] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('new_task')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPhotoFile, setTaskPhotoFile] = useState<File | null>(null)
  const [taskPhotoPreview, setTaskPhotoPreview] = useState<string | null>(null)
  const taskPhotoInputRef = useRef<HTMLInputElement>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  // ── PDF post ──────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfCaption, setPdfCaption] = useState('')
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // ── JSA Report ──────────────────────────────────────────────────────────
  const [jsaProjectName, setJsaProjectName] = useState(project.name)
  const [jsaDate, setJsaDate] = useState(today)
  const [jsaAddress, setJsaAddress] = useState(project.address)
  const [jsaWeather, setJsaWeather] = useState('')
  const [jsaWeatherLoading, setJsaWeatherLoading] = useState(false)
  const [jsaPreparedBy, setJsaPreparedBy] = useState('')
  const [jsaSiteSupervisor, setJsaSiteSupervisor] = useState('')
  const [jsaCompetentPerson, setJsaCompetentPerson] = useState('')
  const [jsaTemplates, setJsaTemplates] = useState<JsaTaskTemplate[]>([])
  const [jsaTemplatesLoaded, setJsaTemplatesLoaded] = useState(false)
  const [jsaSelectedTasks, setJsaSelectedTasks] = useState<Record<string, JsaTaskEntry>>({})
  const [jsaSignatures, setJsaSignatures] = useState<JsaSignatureEntry[]>([])
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  // Fetch JSA templates when mode activates
  useEffect(() => {
    if (mode === 'jsa_report' && !jsaTemplatesLoaded) {
      const supabase = createClient()
      supabase
        .from('jsa_task_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .then(({ data }) => {
          setJsaTemplates((data as JsaTaskTemplate[]) ?? [])
          setJsaTemplatesLoaded(true)
        })
    }
  }, [mode, jsaTemplatesLoaded])

  // Auto-fetch weather when Daily Report mode activates
  useEffect(() => {
    if (mode === 'daily_report' && !rWeather && project.address) {
      console.log('[AddPostPanel] Daily Report mode activated, fetching weather for:', project.address)
      setRWeatherLoading(true)
      fetchWeatherForAddress(project.address).then((w) => {
        console.log('[AddPostPanel] Daily Report weather result:', w)
        if (w) setRWeather(w)
        setRWeatherLoading(false)
      })
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch weather when JSA mode activates
  useEffect(() => {
    if (mode === 'jsa_report' && !jsaWeather && project.address) {
      console.log('[AddPostPanel] JSA mode activated, fetching weather for:', project.address)
      setJsaWeatherLoading(true)
      fetchWeatherForAddress(project.address).then((w) => {
        console.log('[AddPostPanel] Weather result:', w)
        if (w) setJsaWeather(w)
        setJsaWeatherLoading(false)
      })
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleJsaTask(template: JsaTaskTemplate) {
    setJsaSelectedTasks((prev) => {
      const next = { ...prev }
      if (next[template.id]) {
        delete next[template.id]
      } else {
        next[template.id] = {
          templateId: template.id,
          name: template.name,
          hazards: template.default_hazards ?? '',
          precautions: template.default_precautions ?? '',
          ppe: template.default_ppe ?? '',
        }
      }
      return next
    })
  }

  function updateJsaTask(templateId: string, field: keyof JsaTaskEntry, value: string) {
    setJsaSelectedTasks((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [field]: value },
    }))
  }

  // Fetch profiles when task mode is activated
  useEffect(() => {
    if (mode === 'task' && !profilesLoaded) {
      const supabase = createClient()
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, updated_at')
        .then(({ data }) => {
          setProfiles((data as Profile[]) ?? [])
          setProfilesLoaded(true)
        })
    }
  }, [mode, profilesLoaded])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  function selectMode(m: Mode) {
    setMode(m)
    setShowMenu(false)
    setError(null)
  }

  function cancelMode() {
    setMode('text')
    setError(null)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setPhotoFiles((p) => [...p, ...selected])
    setPhotoPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removePhoto(i: number) {
    setPhotoFiles((p) => p.filter((_, idx) => idx !== i))
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  function handleReportPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setRFiles((p) => [...p, ...selected])
    setRPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removeReportPhoto(i: number) {
    setRFiles((p) => p.filter((_, idx) => idx !== i))
    setRPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  function handleTaskPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setTaskPhotoFile(file)
    setTaskPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeTaskPhoto() {
    setTaskPhotoFile(null)
    setTaskPhotoPreview(null)
  }

  // ── Upload helper ──────────────────────────────────────────────────────────
  async function uploadFiles(files: File[], folder: string): Promise<string[]> {
    const supabase = createClient()
    const paths: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${project.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      console.log('[AddPostPanel] Uploading file:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        bucket: 'post-photos',
        storagePath: path,
      })
      const { error: err } = await supabase.storage.from('post-photos').upload(path, file)
      if (err) {
        console.error('[AddPostPanel] Upload failed:', {
          message: err.message,
          name: err.name,
          error: err,
        })
        throw err
      }
      console.log('[AddPostPanel] Upload succeeded:', path)
      paths.push(path)
    }
    return paths
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (mode === 'text') {
        if (!message.trim()) throw new Error('Please enter a message')
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'text',
          content: { message: message.trim() },
          is_pinned: false,
        })
        setMessage('')
      }

      if (mode === 'photo') {
        if (!photoFiles.length) throw new Error('Please select at least one photo')
        const paths = await uploadFiles(photoFiles, 'photos')
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'photo',
          content: { photos: paths, caption: caption.trim() || undefined },
          is_pinned: false,
        })
        setPhotoFiles([])
        setPhotoPreviews([])
        setCaption('')
        if (photoInputRef.current) photoInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'daily_report') {
        const photoPaths = rFiles.length ? await uploadFiles(rFiles, 'reports') : []
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'daily_report',
          content: {
            project_name: rProjectName.trim(),
            date: rDate,
            address: rAddress.trim(),
            reported_by: rReportedBy.trim(),
            project_foreman: rForeman.trim(),
            weather: rWeather.trim(),
            progress: rProgress.trim(),
            delays: rDelays.trim(),
            safety: rSafety.trim(),
            materials_used: rMaterials.trim(),
            employees: rEmployees.trim(),
            photos: photoPaths,
          },
          is_pinned: false,
        })
        setRDate(new Date().toISOString().split('T')[0])
        setRReportedBy('')
        setRForeman('')
        setRWeather('')
        setRProgress('')
        setRDelays('')
        setRSafety('')
        setRMaterials('')
        setREmployees('')
        setRFiles([])
        setRPreviews([])
        if (reportPhotoInputRef.current) reportPhotoInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'task') {
        if (!taskTitle.trim()) throw new Error('Please enter a task title')

        let photoUrl: string | null = null
        if (taskPhotoFile) {
          const paths = await uploadFiles([taskPhotoFile], 'tasks')
          photoUrl = paths[0]
        }

        const { data: taskData, error: insertErr } = await supabase.from('tasks').insert({
          project_id: project.id,
          created_by: userId,
          assigned_to: taskAssignedTo || null,
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          status: taskStatus,
          photo_url: photoUrl,
          due_date: taskDueDate || null,
        }).select().single()
        if (insertErr) throw insertErr

        // Also create a feed post so the task appears in the chat feed
        const { error: feedPostErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'task',
          content: {
            task_id: taskData.id,
            title: taskData.title,
            description: taskData.description,
            status: taskData.status,
            assigned_to: taskData.assigned_to,
            due_date: taskData.due_date,
            photo_url: taskData.photo_url,
          },
          is_pinned: false,
        })
        if (feedPostErr) {
          console.error('[AddPostPanel] feed_posts insert failed:', feedPostErr)
          throw feedPostErr
        }
        console.log('[AddPostPanel] Task feed post created successfully for task:', taskData.id)

        // Send notification to assigned user
        if (taskAssignedTo) {
          const creatorProfile = profiles.find((p) => p.id === userId)
          const creatorName = creatorProfile?.display_name || 'Someone'
          const { error: notifErr } = await supabase.from('notifications').insert({
            user_id: taskAssignedTo,
            type: 'task_assigned',
            title: 'New task assigned',
            message: `${creatorName} assigned you: ${taskTitle.trim()}`,
            link: '/tasks',
          })
          if (notifErr) console.error('[AddPostPanel] Notification insert failed:', notifErr)
        }

        setTaskTitle('')
        setTaskDescription('')
        setTaskAssignedTo('')
        setTaskStatus('new_task')
        setTaskDueDate('')
        setTaskPhotoFile(null)
        setTaskPhotoPreview(null)
        setMode('text')
      }

      if (mode === 'pdf') {
        if (!pdfFile) throw new Error('Please select a PDF file')
        const paths = await uploadFiles([pdfFile], 'pdfs')
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'pdf',
          content: { file_url: paths[0], filename: pdfFile.name, caption: pdfCaption.trim() || undefined },
          is_pinned: false,
        })
        setPdfFile(null)
        setPdfCaption('')
        if (pdfInputRef.current) pdfInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'jsa_report') {
        const tasks = Object.values(jsaSelectedTasks)
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'jsa_report',
          content: {
            projectName: jsaProjectName.trim(),
            date: jsaDate,
            address: jsaAddress.trim(),
            weather: jsaWeather.trim(),
            preparedBy: jsaPreparedBy.trim(),
            siteSupervisor: jsaSiteSupervisor.trim(),
            competentPerson: jsaCompetentPerson.trim(),
            tasks,
            signatures: jsaSignatures,
          },
          is_pinned: false,
        })
        setJsaDate(new Date().toISOString().split('T')[0])
        setJsaWeather('')
        setJsaPreparedBy('')
        setJsaSiteSupervisor('')
        setJsaCompetentPerson('')
        setJsaSelectedTasks({})
        setJsaSignatures([])
        setMode('text')
      }

      onPosted()
    } catch (err: unknown) {
      console.error('[AddPostPanel] Submit failed:', err)
      let msg = 'Failed to post'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-none bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] safe-bottom">

      {/* Error toast */}
      {error && (
        <div className="px-4 pt-3">
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Photo upload thumbnail strip ────────────────────────────────────── */}
      {mode === 'photo' && (
        <div className="px-3 pt-3 pb-1">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            multiple
            className="hidden"
            onChange={handlePhotoChange}
          />

          {photoPreviews.length === 0 ? (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
            >
              <UploadIcon className="w-4 h-4" />
              Select photos or PDFs to upload
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {photoPreviews.map((url, i) => (
                <div
                  key={i}
                  className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100"
                >
                  {photoFiles[i] && isPdf(photoFiles[i]) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                      <FileTextIcon className="w-5 h-5 text-red-400" />
                      <span className="text-[10px] text-red-400 font-medium mt-0.5">PDF</span>
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-amber-400 hover:text-amber-500 transition"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="text-[10px] mt-0.5">Add</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Daily report expanded form ──────────────────────────────────────── */}
      {mode === 'daily_report' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Mobile header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 lg:hidden">
            <h2 className="text-lg font-bold text-gray-900">Daily Report</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Header */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Header</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={rProjectName} onChange={(e) => setRProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 overflow-hidden">
                <div className="min-w-0">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={`${inputCls} min-w-0 max-w-full`} style={{ maxWidth: '100%' }} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={rAddress} onChange={(e) => setRAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* Crew */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Crew</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Reported By</label>
                <input type="text" value={rReportedBy} onChange={(e) => setRReportedBy(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Project Foreman</label>
                <input type="text" value={rForeman} onChange={(e) => setRForeman(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <div className="relative">
                  <input type="text" value={rWeather} onChange={(e) => setRWeather(e.target.value)} placeholder={rWeatherLoading ? 'Fetching weather...' : 'e.g. 72°F, Partly Cloudy, Wind 8 mph'} className={inputCls} />
                  {rWeatherLoading && (
                    <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Progress</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Progress</label>
                <textarea rows={3} value={rProgress} onChange={(e) => setRProgress(e.target.value)} placeholder="Describe work completed today..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Delays</label>
                <textarea rows={2} value={rDelays} onChange={(e) => setRDelays(e.target.value)} placeholder="Any delays or issues..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Safety</label>
                <textarea rows={2} value={rSafety} onChange={(e) => setRSafety(e.target.value)} placeholder="Safety observations, incidents, PPE notes..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Materials Used</label>
                <textarea rows={2} value={rMaterials} onChange={(e) => setRMaterials(e.target.value)} placeholder="Epoxy products, quantities, other materials..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Employees</label>
                <textarea rows={2} value={rEmployees} onChange={(e) => setREmployees(e.target.value)} placeholder="Names of employees on site today..." className={textareaCls} />
              </div>
            </div>
          </div>

          {/* Photos */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
            <div
              onClick={() => reportPhotoInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <CameraIcon className="w-4 h-4 text-gray-400 mx-auto mb-1" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Add photos or PDFs</span> to this report
              </p>
              <input
                ref={reportPhotoInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                className="hidden"
                onChange={handleReportPhotoChange}
              />
            </div>

            {rPreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {rPreviews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {rFiles[i] && isPdf(rFiles[i]) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                        <FileTextIcon className="w-6 h-6 text-red-400" />
                        <span className="text-[10px] text-red-400 font-medium mt-0.5">PDF</span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeReportPhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Daily Report'}
            </button>
          </div>
        </div>
      )}

      {/* ── Task creation form ────────────────────────────────────────────────── */}
      {mode === 'task' && (
        <div className="px-4 pt-3 pb-2 max-h-[52vh] overflow-y-auto space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">New Task</p>

          {/* Title */}
          <div>
            <label className={labelCls}>Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title..."
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              rows={3}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Task details..."
              className={textareaCls}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Assign To */}
            <div>
              <label className={labelCls}>Assign To</label>
              <select
                value={taskAssignedTo}
                onChange={(e) => setTaskAssignedTo(e.target.value)}
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
            <div className="min-w-0">
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className={`${inputCls} min-w-0`}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTaskStatus(opt.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition ${
                    taskStatus === opt.value ? opt.activeColor : opt.color
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
              ref={taskPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleTaskPhotoChange}
            />
            {taskPhotoPreview ? (
              <div className="relative inline-block">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={taskPhotoPreview} alt="" className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={removeTaskPhoto}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => taskPhotoInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
              >
                <CameraIcon className="w-4 h-4" />
                Add photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── JSA Report expanded form ─────────────────────────────────────────── */}
      {mode === 'jsa_report' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Mobile header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 lg:hidden">
            <h2 className="text-lg font-bold text-gray-900">JSA Report</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Base Section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Info</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={jsaProjectName} onChange={(e) => setJsaProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="min-w-0">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={jsaDate} onChange={(e) => setJsaDate(e.target.value)} className={`${inputCls} min-w-0`} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={jsaAddress} onChange={(e) => setJsaAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <div className="relative">
                  <input
                    type="text"
                    value={jsaWeather}
                    onChange={(e) => setJsaWeather(e.target.value)}
                    placeholder={jsaWeatherLoading ? 'Fetching weather...' : 'e.g. 72°F, Partly Cloudy, Wind 8 mph'}
                    className={inputCls}
                  />
                  {jsaWeatherLoading && (
                    <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personnel */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Personnel</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Prepared By</label>
                <input type="text" value={jsaPreparedBy} onChange={(e) => setJsaPreparedBy(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Site Supervisor</label>
                <input type="text" value={jsaSiteSupervisor} onChange={(e) => setJsaSiteSupervisor(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Competent Person</label>
                <input type="text" value={jsaCompetentPerson} onChange={(e) => setJsaCompetentPerson(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Task Checkboxes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tasks</p>
              <button
                type="button"
                onClick={() => setShowTemplateManager(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition"
              >
                <SettingsIcon className="w-3 h-3" />
                Manage Tasks
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {jsaTemplates.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                    jsaSelectedTasks[t.id]
                      ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!jsaSelectedTasks[t.id]}
                    onChange={() => toggleJsaTask(t)}
                    className="sr-only"
                  />
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    jsaSelectedTasks[t.id] ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                  }`}>
                    {jsaSelectedTasks[t.id] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          {/* Dynamic Task Sections */}
          {jsaTemplates.filter((t) => jsaSelectedTasks[t.id]).map((t) => (
            <div key={t.id} className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
              <p className="text-sm font-bold text-amber-800">{t.name}</p>
              <div>
                <label className={labelCls}>Hazards</label>
                <textarea
                  rows={3}
                  value={jsaSelectedTasks[t.id]?.hazards ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'hazards', e.target.value)}
                  placeholder="Identified hazards..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Precautions</label>
                <textarea
                  rows={3}
                  value={jsaSelectedTasks[t.id]?.precautions ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'precautions', e.target.value)}
                  placeholder="Safety precautions..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>PPE Required</label>
                <textarea
                  rows={2}
                  value={jsaSelectedTasks[t.id]?.ppe ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'ppe', e.target.value)}
                  placeholder="Required PPE..."
                  className={textareaCls}
                />
              </div>
            </div>
          ))}

          {/* Employee Acknowledgment & Signatures */}
          <JsaSignatureSection onChange={setJsaSignatures} />

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit JSA Report'}
            </button>
          </div>
        </div>
      )}

      {showTemplateManager && (
        <JsaTemplateManagerModal
          onClose={() => {
            setShowTemplateManager(false)
            // Reload templates
            setJsaTemplatesLoaded(false)
          }}
        />
      )}

      {/* ── PDF upload strip ──────────────────────────────────────────────────── */}
      {mode === 'pdf' && (
        <div className="px-3 pt-3 pb-1">
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setPdfFile(file)
              e.target.value = ''
            }}
          />

          {!pdfFile ? (
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
            >
              <UploadIcon className="w-4 h-4" />
              Select a PDF to upload
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <FileTextIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{pdfFile.name}</span>
                <button
                  onClick={() => { setPdfFile(null); setPdfCaption(''); if (pdfInputRef.current) pdfInputRef.current.value = '' }}
                  className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={pdfCaption}
                onChange={(e) => setPdfCaption(e.target.value)}
                placeholder="Add a caption..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Composer bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">

        {/* + menu button */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              showMenu
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <PlusIcon className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 w-44">
                {canCreate('photos') && (
                  <button
                    onClick={() => selectMode('photo')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'photo'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <CameraIcon className="w-4 h-4 flex-shrink-0" />
                    Upload Photos
                  </button>
                )}
                {canCreate('daily_reports') && (
                  <button
                    onClick={() => selectMode('daily_report')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'daily_report'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ClipboardListIcon className="w-4 h-4 flex-shrink-0" />
                    Daily Report
                  </button>
                )}
                {canCreate('jsa_reports') && (
                  <button
                    onClick={() => selectMode('jsa_report')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'jsa_report'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShieldIcon className="w-4 h-4 flex-shrink-0" />
                    JSA Report
                  </button>
                )}
                {canCreate('tasks') && (
                  <button
                    onClick={() => selectMode('task')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'task'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <CheckSquareIcon className="w-4 h-4 flex-shrink-0" />
                    Task
                  </button>
                )}
                <button
                  onClick={() => selectMode('pdf')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    mode === 'pdf'
                      ? 'text-amber-600 bg-amber-50 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FileTextIcon className="w-4 h-4 flex-shrink-0" />
                  PDF
                </button>
              </div>
            </>
          )}
        </div>

        {/* Input area */}
        {mode === 'text' && (
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Write a message..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
          />
        )}

        {mode === 'photo' && (
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption... (optional)"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
          />
        )}

        {mode === 'daily_report' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <ClipboardListIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              Daily Report — {rDate}
            </span>
          </div>
        )}

        {mode === 'task' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <CheckSquareIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              New Task{taskTitle ? ` — ${taskTitle}` : ''}
            </span>
          </div>
        )}

        {mode === 'pdf' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-red-50 rounded-full border border-red-200">
            <FileTextIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-600 font-medium truncate">
              PDF{pdfFile ? ` — ${pdfFile.name}` : ''}
            </span>
          </div>
        )}

        {mode === 'jsa_report' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <ShieldIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              JSA Report — {jsaDate}
            </span>
          </div>
        )}

        {/* Cancel button for expanded modes */}
        {(mode === 'photo' || mode === 'daily_report' || mode === 'task' || mode === 'pdf' || mode === 'jsa_report') && (
          <button
            onClick={cancelMode}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white flex items-center justify-center transition"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
