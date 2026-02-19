'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquareIcon, CameraIcon, ClipboardListIcon, XIcon, SendIcon, UploadIcon } from 'lucide-react'

type Tab = 'text' | 'photo' | 'daily_report'

interface AddPostPanelProps {
  projectId: string
  userId: string
  onPosted: () => void
}

export default function AddPostPanel({ projectId, userId, onPosted }: AddPostPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('text')
  const [message, setMessage] = useState('')
  const [caption, setCaption] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Daily report fields
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [crewMembers, setCrewMembers] = useState('')
  const [surfacePrep, setSurfacePrep] = useState('')
  const [epoxyProduct, setEpoxyProduct] = useState('')
  const [coatsApplied, setCoatsApplied] = useState('')
  const [weather, setWeather] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setFiles(selected)
    const urls = selected.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
  }

  function removeFile(index: number) {
    const newFiles = files.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)
    setFiles(newFiles)
    setPreviews(newPreviews)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (activeTab === 'text') {
        if (!message.trim()) throw new Error('Please enter a message')
        await supabase.from('feed_posts').insert({
          project_id: projectId,
          user_id: userId,
          post_type: 'text',
          content: { message: message.trim() },
          is_pinned: false,
        })
        setMessage('')
      }

      if (activeTab === 'photo') {
        if (!files.length) throw new Error('Please select at least one photo')
        const paths: string[] = []
        for (const file of files) {
          const ext = file.name.split('.').pop()
          const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('post-photos')
            .upload(path, file)
          if (uploadError) throw uploadError
          paths.push(path)
        }
        await supabase.from('feed_posts').insert({
          project_id: projectId,
          user_id: userId,
          post_type: 'photo',
          content: { photos: paths, caption: caption.trim() || undefined },
          is_pinned: false,
        })
        setFiles([])
        setPreviews([])
        setCaption('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }

      if (activeTab === 'daily_report') {
        if (!crewMembers.trim()) throw new Error('Please enter crew members')
        await supabase.from('feed_posts').insert({
          project_id: projectId,
          user_id: userId,
          post_type: 'daily_report',
          content: {
            date: reportDate,
            crew_members: crewMembers.trim(),
            surface_prep_notes: surfacePrep.trim(),
            epoxy_product_used: epoxyProduct.trim(),
            coats_applied: coatsApplied.trim(),
            weather_conditions: weather.trim(),
            additional_notes: additionalNotes.trim(),
          },
          is_pinned: false,
        })
        setCrewMembers('')
        setSurfacePrep('')
        setEpoxyProduct('')
        setCoatsApplied('')
        setWeather('')
        setAdditionalNotes('')
        setReportDate(new Date().toISOString().split('T')[0])
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

        {/* Text post */}
        {activeTab === 'text' && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message..."
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
          />
        )}

        {/* Photo post */}
        {activeTab === 'photo' && (
          <div className="space-y-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <UploadIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Click to upload</span> photos
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC up to 10MB each</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {previews.length > 0 && (
              <div className={`grid gap-2 ${previews.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {previews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Daily Report */}
        {activeTab === 'daily_report' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Crew Members <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={crewMembers}
                  onChange={(e) => setCrewMembers(e.target.value)}
                  placeholder="e.g. Mike, Jason, Carlos"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Epoxy Product Used
                </label>
                <input
                  type="text"
                  value={epoxyProduct}
                  onChange={(e) => setEpoxyProduct(e.target.value)}
                  placeholder="e.g. Rust-Oleum EpoxyShield"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Coats Applied
                </label>
                <input
                  type="text"
                  value={coatsApplied}
                  onChange={(e) => setCoatsApplied(e.target.value)}
                  placeholder="e.g. 2 coats base + 1 topcoat"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Weather Conditions
              </label>
              <input
                type="text"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                placeholder="e.g. 78°F, low humidity, overcast"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Surface Prep Notes
              </label>
              <textarea
                value={surfacePrep}
                onChange={(e) => setSurfacePrep(e.target.value)}
                placeholder="Describe surface prep performed..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Additional Notes
              </label>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any other notes, issues, or observations..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            <SendIcon className="w-4 h-4" />
            {loading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
