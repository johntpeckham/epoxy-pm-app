'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  RulerIcon,
  UploadIcon,
  XIcon,
  Loader2Icon,
  FileTextIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import type { Lead } from './LeadsClient'

interface LeadMeasurementsCardProps {
  lead: Lead
  userId: string
  onPatch: (patch: Partial<Lead>) => void
}

interface MeasurementPdf {
  id: string
  lead_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_by: string | null
  created_at: string
}

interface PendingUpload {
  tempId: string
  fileName: string
}

const BUCKET = 'lead-measurement-pdfs'

export default function LeadMeasurementsCard({
  lead,
  userId,
  onPatch,
}: LeadMeasurementsCardProps) {
  const [measurements, setMeasurements] = useState(lead.measurements ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pdfs, setPdfs] = useState<MeasurementPdf[]>([])
  const [loadingPdfs, setLoadingPdfs] = useState(true)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [confirmDelete, setConfirmDelete] = useState<MeasurementPdf | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPdfs = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('lead_measurement_pdfs')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[LeadMeasurements] Fetch PDFs failed:', error)
    } else if (data) {
      setPdfs(data as MeasurementPdf[])
    }
    setLoadingPdfs(false)
  }, [lead.id])

  useEffect(() => {
    fetchPdfs()
  }, [fetchPdfs])

  function handleTextChange(value: string) {
    setMeasurements(value)
    onPatch({ measurements: value || null })
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from('leads')
        .update({ measurements: value || null })
        .eq('id', lead.id)
      if (error) {
        console.error('[LeadMeasurements] Save failed:', error)
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(() => setSaveState('idle'), 1500)
      }
    }, 1000)
  }

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList)
      const supabase = createClient()

      const pendingList: PendingUpload[] = files.map((f) => ({
        tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: f.name,
      }))
      setPending((prev) => [...prev, ...pendingList])

      await Promise.all(
        files.map(async (file, idx) => {
          const placeholder = pendingList[idx]
          try {
            const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
            const path = `${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from(BUCKET)
              .upload(path, file, {
                contentType: file.type || 'application/pdf',
              })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
            const publicUrl = urlData.publicUrl

            const { data: inserted, error: insertErr } = await supabase
              .from('lead_measurement_pdfs')
              .insert({
                lead_id: lead.id,
                file_name: file.name,
                file_url: publicUrl,
                storage_path: path,
                created_by: userId,
              })
              .select('*')
              .single()
            if (insertErr) throw insertErr

            if (inserted) {
              setPdfs((prev) => [...prev, inserted as MeasurementPdf])
            }
          } catch (err) {
            console.error('[LeadMeasurements] Upload failed:', err)
          } finally {
            setPending((prev) => prev.filter((p) => p.tempId !== placeholder.tempId))
          }
        })
      )
    },
    [lead.id, userId]
  )

  async function handleDeletePdf(pdf: MeasurementPdf) {
    setDeleting(true)
    const supabase = createClient()
    try {
      await supabase.storage.from(BUCKET).remove([pdf.storage_path])
      const { error } = await supabase
        .from('lead_measurement_pdfs')
        .delete()
        .eq('id', pdf.id)
      if (error) throw error
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id))
      setConfirmDelete(null)
    } catch (err) {
      console.error('[LeadMeasurements] Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <RulerIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Measurements</h3>
          <AutoSaveIndicator isSaving={saveState === 'saving'} />
        </div>

        <textarea
          value={measurements}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Add measurements..."
          className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
        />

        <div className="mt-3 space-y-2">
          {loadingPdfs ? (
            <div className="py-4 flex items-center justify-center text-gray-400">
              <Loader2Icon className="w-4 h-4 animate-spin" />
            </div>
          ) : pdfs.length === 0 && pending.length === 0 ? null : (
            <ul className="space-y-1.5">
              {pdfs.map((pdf) => (
                <li
                  key={pdf.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 bg-gray-50/60 hover:border-gray-300 transition"
                >
                  <FileTextIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <a
                    href={pdf.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-sm text-amber-600 hover:underline truncate"
                  >
                    {pdf.file_name}
                  </a>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(pdf)}
                    aria-label="Delete PDF"
                    className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {pending.map((p) => (
                <li
                  key={p.tempId}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 bg-gray-50/60"
                >
                  <Loader2Icon className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-gray-500 truncate">
                    Uploading {p.fileName}…
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition"
          >
            <UploadIcon className="w-4 h-4" />
            Upload PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete PDF"
          message={`This will permanently remove "${confirmDelete.file_name}". This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={() => handleDeletePdf(confirmDelete)}
          onCancel={() => (deleting ? null : setConfirmDelete(null))}
        />
      )}
    </>
  )
}
