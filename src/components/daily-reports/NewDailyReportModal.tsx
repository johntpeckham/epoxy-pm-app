'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon } from 'lucide-react'
import { Project } from '@/types'

interface NewDailyReportModalProps {
  projects: Project[]
  userId: string
  onClose: () => void
  onCreated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function NewDailyReportModal({
  projects,
  userId,
  onClose,
  onCreated,
}: NewDailyReportModalProps) {
  const today = new Date().toISOString().split('T')[0]

  // Project selector
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')

  // Header (auto-filled from project, editable)
  const [projectName, setProjectName] = useState(projects[0]?.name ?? '')
  const [date, setDate] = useState(today)
  const [address, setAddress] = useState(projects[0]?.address ?? '')

  // Crew
  const [reportedBy, setReportedBy] = useState('')
  const [foreman, setForeman] = useState('')
  const [weather, setWeather] = useState('')

  // Progress
  const [progress, setProgress] = useState('')
  const [delays, setDelays] = useState('')
  const [safety, setSafety] = useState('')
  const [materials, setMaterials] = useState('')
  const [employees, setEmployees] = useState('')

  // Photos
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId)
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setProjectName(project.name)
      setAddress(project.address)
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setFiles((p) => [...p, ...selected])
    setPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removePhoto(i: number) {
    setFiles((p) => p.filter((_, idx) => idx !== i))
    setPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    if (!selectedProjectId) {
      setError('Please select a project')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      // Upload photos
      const photoPaths: string[] = []
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${selectedProjectId}/reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, file)
        if (uploadErr) throw uploadErr
        photoPaths.push(path)
      }

      const { error: insertErr } = await supabase.from('feed_posts').insert({
        project_id: selectedProjectId,
        user_id: userId,
        post_type: 'daily_report',
        is_pinned: false,
        content: {
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
          photos: photoPaths,
        },
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">New Daily Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Project selector */}
          <div>
            <label className={labelCls}>
              Project <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={inputCls}
            >
              {projects.length === 0 && (
                <option value="">No active projects</option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Header section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Header</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputCls}
                  />
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
                <input
                  type="text"
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                  placeholder="Name"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Project Foreman</label>
                <input
                  type="text"
                  value={foreman}
                  onChange={(e) => setForeman(e.target.value)}
                  placeholder="Name"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <input
                  type="text"
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  placeholder="e.g. 72°F, clear"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Progress section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Progress</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Progress</label>
                <textarea
                  rows={3}
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  placeholder="Describe work completed today..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Delays</label>
                <textarea
                  rows={2}
                  value={delays}
                  onChange={(e) => setDelays(e.target.value)}
                  placeholder="Any delays or issues..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Safety</label>
                <textarea
                  rows={2}
                  value={safety}
                  onChange={(e) => setSafety(e.target.value)}
                  placeholder="Safety observations, incidents, PPE notes..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Materials Used</label>
                <textarea
                  rows={2}
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  placeholder="Epoxy products, quantities, other materials..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Employees</label>
                <textarea
                  rows={2}
                  value={employees}
                  onChange={(e) => setEmployees(e.target.value)}
                  placeholder="Names of employees on site today..."
                  className={textareaCls}
                />
              </div>
            </div>
          </div>

          {/* Photos section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1.5" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Add photos</span> to this report
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            {previews.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {previews.map((url, i) => (
                  <div
                    key={i}
                    className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
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
            disabled={loading || projects.length === 0}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
