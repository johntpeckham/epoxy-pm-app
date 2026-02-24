'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon,
  XIcon,
  CameraIcon,
  ClipboardListIcon,
  UploadIcon,
  FileTextIcon,
  PlusIcon,
} from 'lucide-react'
import { Project } from '@/types'

export type Mode = 'text' | 'photo' | 'daily_report'

interface AddPostPanelProps {
  project: Project
  userId: string
  onPosted: () => void
  mode: Mode
  onModeChange: (mode: Mode) => void
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function AddPostPanel({ project, userId, onPosted, mode, onModeChange }: AddPostPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const [rProgress, setRProgress] = useState('')
  const [rDelays, setRDelays] = useState('')
  const [rSafety, setRSafety] = useState('')
  const [rMaterials, setRMaterials] = useState('')
  const [rEmployees, setREmployees] = useState('')
  const [rFiles, setRFiles] = useState<File[]>([])
  const [rPreviews, setRPreviews] = useState<string[]>([])
  const reportPhotoInputRef = useRef<HTMLInputElement>(null)

  // ── File helpers ──────────────────────────────────────────────────────────
  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setPhotoFiles((p) => [...p, ...selected])
    setPhotoPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
    // Reset input so the same file can be re-selected if removed
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
        onModeChange('text')
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
        onModeChange('text')
      }

      onPosted()
    } catch (err) {
      console.error('[AddPostPanel] Submit failed:', err)
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to post'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">

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

      {/* ── Photo upload compact thumbnail strip ─────────────────────────── */}
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
            /* No photos yet — small prompt */
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
            >
              <UploadIcon className="w-4 h-4" />
              Select photos or PDFs to upload
            </button>
          ) : (
            /* Thumbnail strip */
            <div className="flex items-center gap-2 flex-wrap">
              {photoPreviews.map((url, i) => (
                <div
                  key={i}
                  className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
                >
                  {photoFiles[i] && isPdf(photoFiles[i]) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                      <FileTextIcon className="w-6 h-6 text-red-400" />
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
              {/* Add more tile */}
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex-shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-amber-400 hover:text-amber-500 transition"
              >
                <PlusIcon className="w-5 h-5" />
                <span className="text-xs mt-0.5">Add</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Daily report expanded form ────────────────────────────────────── */}
      {mode === 'daily_report' && (
        <div className="px-4 pt-3 pb-2 max-h-[52vh] overflow-y-auto space-y-5">

          {/* Header */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Header</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={rProjectName} onChange={(e) => setRProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={inputCls} />
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
            <div className="grid grid-cols-3 gap-3">
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
                <input type="text" value={rWeather} onChange={(e) => setRWeather(e.target.value)} placeholder="e.g. 72°F, clear" className={inputCls} />
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
      )}

      {/* ── Composer bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">

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
              Project Report — {rDate}
            </span>
          </div>
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
