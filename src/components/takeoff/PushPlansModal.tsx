'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, SearchIcon, Loader2Icon, SendIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { TakeoffPage, TakeoffItem, TakeoffSection } from './types'
import { generateReportBlob } from './takeoffExport'

interface Job {
  id: string
  name: string
  client_name: string
}

interface PushPlansModalProps {
  projectName: string
  pages: TakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  pageRenderedSizes: Record<string, { w: number; h: number }>
  sections?: TakeoffSection[]
  onClose: () => void
  onSuccess: (jobName: string) => void
  onError: (message: string) => void
}

export default function PushPlansModal({
  projectName,
  pages,
  items,
  pageScales,
  sections,
  pageRenderedSizes,
  onClose,
  onSuccess,
  onError,
}: PushPlansModalProps) {
  const supabase = createClient()
  const searchRef = useRef<HTMLInputElement>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Fetch all jobs
  useEffect(() => {
    async function fetchJobs() {
      setLoading(true)
      const { data } = await supabase
        .from('projects')
        .select('id, name, client_name')
        .order('name', { ascending: true })
      setJobs((data as Job[]) ?? [])
      setLoading(false)
    }
    fetchJobs()
  }, [supabase])

  // Auto-focus search on mount
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100)
  }, [])

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase()
    return j.name.toLowerCase().includes(q) || j.client_name.toLowerCase().includes(q)
  })

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null

  const handleSend = useCallback(async () => {
    if (!selectedJob) return
    setSending(true)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Generate the PDF report blob
      const blob = await generateReportBlob(projectName, pages, items, pageScales, pageRenderedSizes, sections ?? [])

      // Upload to Supabase storage
      const fileName = `${projectName} - Takeoff Report.pdf`
      const ext = 'pdf'
      const storagePath = `${selectedJob.id}/plan/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('project-plans')
        .upload(storagePath, blob, { contentType: 'application/pdf' })
      if (uploadErr) throw uploadErr

      // Insert record into project_documents table
      const { error: insertErr } = await supabase.from('project_documents').insert({
        project_id: selectedJob.id,
        user_id: user.id,
        bucket: 'project-plans',
        file_path: storagePath,
        file_name: fileName,
        file_type: 'application/pdf',
        document_type: 'plans',
      })
      if (insertErr) throw insertErr

      onSuccess(selectedJob.name)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to send plans')
    } finally {
      setSending(false)
    }
  }, [selectedJob, supabase, projectName, pages, items, pageScales, pageRenderedSizes, onSuccess, onError])

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <h2 className="text-lg font-semibold text-gray-900">Push Plans to Job</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Sending indicator */}
            <p className="text-sm text-gray-500">
              Sending: <span className="font-medium text-gray-700">{projectName} Report</span>
            </p>

            {/* Search input */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by job name or client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
              />
            </div>

            {/* Job list */}
            <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2Icon className="w-5 h-5 text-gray-300 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">
                  {search ? 'No matching jobs found' : 'No jobs available'}
                </p>
              ) : (
                filtered.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left px-4 py-2.5 flex flex-col border-b border-gray-100 last:border-b-0 transition ${
                      selectedJobId === job.id
                        ? 'bg-gray-50 border-l-2 border-l-gray-400'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{job.name}</span>
                    <span className="text-xs text-gray-500">{job.client_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-none flex gap-3 px-5 py-4 border-t border-gray-200" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
            <button
              onClick={onClose}
              disabled={sending}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!selectedJobId || sending}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-300 text-white rounded-lg py-2.5 text-sm font-semibold transition"
            >
              {sending ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
