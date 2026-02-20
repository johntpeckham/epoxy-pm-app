'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon } from 'lucide-react'
import Image from 'next/image'
import { DailyReportContent } from '@/types'

interface EditDailyReportModalProps {
  postId: string
  initialContent: DailyReportContent
  onClose: () => void
  onUpdated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function EditDailyReportModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditDailyReportModalProps) {
  const supabase = createClient()

  // Header
  const [projectName, setProjectName] = useState(initialContent.project_name ?? '')
  const [date, setDate] = useState(initialContent.date ?? '')
  const [address, setAddress] = useState(initialContent.address ?? '')
  // Crew
  const [reportedBy, setReportedBy] = useState(initialContent.reported_by ?? '')
  const [foreman, setForeman] = useState(initialContent.project_foreman ?? '')
  const [weather, setWeather] = useState(initialContent.weather ?? '')
  // Progress
  const [progress, setProgress] = useState(initialContent.progress ?? '')
  const [delays, setDelays] = useState(initialContent.delays ?? '')
  const [safety, setSafety] = useState(initialContent.safety ?? '')
  const [materials, setMaterials] = useState(initialContent.materials_used ?? '')
  const [employees, setEmployees] = useState(initialContent.employees ?? '')

  // Photos: existing paths, removals, new files
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initialContent.photos ?? [])
  const [removedPaths, setRemovedPaths] = useState<string[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve existing photo URLs
  const existingUrls = existingPhotos.map((path) => ({
    path,
    url: supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl,
  }))

  function handleNewPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setNewFiles((p) => [...p, ...selected])
    setNewPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removeExistingPhoto(path: string) {
    setExistingPhotos((p) => p.filter((x) => x !== path))
    setRemovedPaths((p) => [...p, path])
  }

  function removeNewPhoto(i: number) {
    setNewFiles((p) => p.filter((_, idx) => idx !== i))
    setNewPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    try {
      // Delete removed photos from storage
      if (removedPaths.length > 0) {
        await supabase.storage.from('post-photos').remove(removedPaths)
      }

      // Upload new photos
      const newPaths: string[] = []
      for (const file of newFiles) {
        const ext = file.name.split('.').pop()
        const path = `reports/${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, file)
        if (uploadErr) throw uploadErr
        newPaths.push(path)
      }

      const finalPhotos = [...existingPhotos, ...newPaths]

      const updatedContent: DailyReportContent = {
        project_name: projectName.trim(),
        date,
        address: address.trim(),
        reported_by: reportedBy.trim(),
        project_foreman: foreman.trim(),
        weather: weather.trim(),
        progress: progress.trim(),
        delays: delays.trim(),
        safety: safety.trim(),
        materials_used: materials.trim(),
        employees: employees.trim(),
        photos: finalPhotos,
      }

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content: updatedContent })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Edit Daily Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Header section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Header</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
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
                <input type="text" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Project Foreman</label>
                <input type="text" value={foreman} onChange={(e) => setForeman(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <input type="text" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="e.g. 72°F" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Progress section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Progress</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Progress</label>
                <textarea rows={3} value={progress} onChange={(e) => setProgress(e.target.value)} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Delays</label>
                <textarea rows={2} value={delays} onChange={(e) => setDelays(e.target.value)} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Safety</label>
                <textarea rows={2} value={safety} onChange={(e) => setSafety(e.target.value)} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Materials Used</label>
                <textarea rows={2} value={materials} onChange={(e) => setMaterials(e.target.value)} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Employees</label>
                <textarea rows={2} value={employees} onChange={(e) => setEmployees(e.target.value)} className={textareaCls} />
              </div>
            </div>
          </div>

          {/* Photos section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>

            {existingUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {existingUrls.map(({ path, url }) => (
                  <div key={path} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <Image src={url} alt="Report photo" fill className="object-cover" sizes="120px" />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(path)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newPreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {newPreviews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 ring-amber-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              <CameraIcon className="w-4 h-4" /> Add photos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleNewPhotos}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
