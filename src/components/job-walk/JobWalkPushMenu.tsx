'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import { assignNextProjectNumber } from '@/lib/nextProjectNumber'
import type { JobWalk } from './JobWalkClient'

interface JobWalkMeasurementPdf {
  id: string
  walk_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_at: string
}

interface JobWalkPushMenuProps {
  walk: JobWalk
  userId: string
  onPatch: (patch: Partial<JobWalk>) => void
}

export default function JobWalkPushMenu({
  walk,
  userId,
  onPatch,
}: JobWalkPushMenuProps) {
  const [open, setOpen] = useState(false)
  const [showEstimatingConfirm, setShowEstimatingConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
        >
          Push to…
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowEstimatingConfirm(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to estimating
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                showToast('Coming soon')
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              Push to proposal
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                showToast('Coming soon')
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              Push to job
            </button>
          </div>
        )}
      </div>

      {showEstimatingConfirm && (
        <PushToEstimatingModal
          walk={walk}
          userId={userId}
          onClose={() => setShowEstimatingConfirm(false)}
          onPatch={onPatch}
          showToast={showToast}
        />
      )}

      {toast && (
        <Portal>
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg"
            role="status"
          >
            {toast.message}
            {toast.href && (
              <a
                href={toast.href}
                className="ml-3 text-amber-300 hover:text-amber-200 underline"
              >
                View
              </a>
            )}
          </div>
        </Portal>
      )}
    </>
  )
}

interface PushToEstimatingModalProps {
  walk: JobWalk
  userId: string
  onClose: () => void
  onPatch: (patch: Partial<JobWalk>) => void
  showToast: (message: string, href?: string | null) => void
}

function PushToEstimatingModal({
  walk,
  userId,
  onClose,
  onPatch,
  showToast,
}: PushToEstimatingModalProps) {
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeMeasurements, setIncludeMeasurements] = useState(true)
  const [includePdfs, setIncludePdfs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ensureCustomer(): Promise<string | null> {
    if (walk.company_id) return walk.company_id
    const supabase = createClient()
    const baseName = walk.customer_name ?? walk.project_name ?? 'New customer'
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('archived', false)
      .eq('name', baseName)
      .limit(1)
    if (existing && existing.length > 0) {
      return (existing[0] as { id: string }).id
    }
    const { data: created, error: custErr } = await supabase
      .from('companies')
      .insert({
        name: baseName,
        email: walk.customer_email,
        phone: walk.customer_phone,
        address: walk.address,
        archived: false,
      })
      .select('id')
      .single()
    if (custErr || !created) {
      setError(`Failed to create customer: ${custErr?.message ?? 'unknown error'}`)
      return null
    }
    return (created as { id: string }).id
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)

    const customerId = await ensureCustomer()
    if (!customerId) {
      setSaving(false)
      return
    }

    const supabase = createClient()
    const projectNumber = await assignNextProjectNumber(supabase, userId)

    const { data: newProject, error: projErr } = await supabase
      .from('estimating_projects')
      .insert({
        company_id: customerId,
        name: walk.project_name,
        description: includeNotes ? walk.notes : null,
        status: 'active',
        source: 'job_walk',
        source_ref_id: walk.id,
        measurements: includeMeasurements ? walk.measurements : null,
        project_number: projectNumber,
        created_by: userId,
      })
      .select('*')
      .single()

    if (projErr || !newProject) {
      setSaving(false)
      setError(`Failed to create project: ${projErr?.message ?? 'unknown error'}`)
      return
    }
    const projectId = (newProject as { id: string }).id

    if (includePdfs) {
      const { data: pdfs } = await supabase
        .from('job_walk_measurement_pdfs')
        .select('*')
        .eq('walk_id', walk.id)
      const pdfRows = (pdfs ?? []) as JobWalkMeasurementPdf[]
      if (pdfRows.length > 0) {
        const inserts = pdfRows.map((p) => ({
          project_id: projectId,
          file_name: p.file_name,
          file_url: p.file_url,
          storage_path: p.storage_path,
        }))
        await supabase.from('estimating_project_measurement_pdfs').insert(inserts)
      }
    }

    const { error: updErr } = await supabase
      .from('job_walks')
      .update({
        status: 'completed',
        pushed_to: 'estimating',
        pushed_ref_id: projectId,
      })
      .eq('id', walk.id)

    setSaving(false)
    if (updErr) {
      setError(`Failed to update job walk: ${updErr.message}`)
      return
    }
    onPatch({
      status: 'completed',
      pushed_to: 'estimating',
      pushed_ref_id: projectId,
    })
    showToast(
      'Estimating project created.',
      `/sales/estimating?customer=${customerId}&project=${projectId}`
    )
    onClose()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">Push to estimating</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <p className="text-sm text-gray-600">
              This will create a new estimating project for this customer
              {walk.company_id ? '' : ' (a company record will also be created)'}.
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-sm text-gray-700">Include notes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMeasurements}
                  onChange={(e) => setIncludeMeasurements(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-sm text-gray-700">Include measurements</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePdfs}
                  onChange={(e) => setIncludePdfs(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-sm text-gray-700">Include measurement PDFs</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
