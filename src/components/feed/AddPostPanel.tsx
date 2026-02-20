'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquareIcon,
  CameraIcon,
  ClipboardListIcon,
  XIcon,
  SendIcon,
  UploadIcon,
} from 'lucide-react'
import { Project } from '@/types'

type Tab = 'text' | 'photo' | 'daily_report'

interface AddPostPanelProps {
  project: Project
  userId: string
  onPosted: () => void
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function AddPostPanel({ project, userId, onPosted }: AddPostPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('text')
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

  // ── Photo helpers ──────────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setPhotoFiles(selected)
    setPhotoPreviews(selected.map((f) => URL.createObjectURL(f)))
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
      const { error: err } = await supabase.storage.from('post-photos').upload(path, file)
      if (err) throw err
      paths.push(path)
    }
    return paths
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (activeTab === 'text') {
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

      if (activeTab === 'photo') {
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
      }

      if (activeTab === 'daily_report') {
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
        // Reset report fields (keep project name/address for next report)
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
      }

      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'text', label: 'Message', icon: <MessageSquareIcon className="w-4 h-4" /> },
    { id: 'photo', label: 'Photos', icon: <CameraIcon className="w-4 h-4" /> },
    { id: 'daily_report', label: 'Daily Report', icon: <ClipboardListIcon className="w-4 h-4" /> },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex-1 justify-center ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600 bg-amber-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-600 px-3 py-2.5 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Text post ──────────────────────────────────────────────────── */}
        {activeTab === 'text' && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message..."
            rows={3}
            className={textareaCls}
          />
        )}

        {/* ── Photo post ─────────────────────────────────────────────────── */}
        {activeTab === 'photo' && (
          <div className="space-y-3">
            <div
              onClick={() => photoInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <UploadIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Click to upload</span> photos
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC up to 10MB each</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            {photoPreviews.length > 0 && (
              <div className={`grid gap-2 ${photoPreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {photoPreviews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              className={inputCls}
            />
          </div>
        )}

        {/* ── Daily Report ───────────────────────────────────────────────── */}
        {activeTab === 'daily_report' && (
          <div className="space-y-5">

            {/* Header section */}
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

            {/* Crew section */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Crew</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            {/* Progress section */}
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

            {/* Photos section */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
              <div
                onClick={() => reportPhotoInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
              >
                <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1.5" />
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-amber-600">Add photos</span> to this report
                </p>
                <input
                  ref={reportPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleReportPhotoChange}
                />
              </div>

              {rPreviews.length > 0 && (
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {rPreviews.map((url, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
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

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            <SendIcon className="w-4 h-4" />
            {loading ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
