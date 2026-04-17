'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  RulerIcon,
  UploadIcon,
  XIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PdfThumbnail from '@/components/documents/PdfThumbnail'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import type { JobWalk } from './JobWalkClient'

interface JobWalkMeasurementsCardProps {
  walk: JobWalk
  userId: string
  onPatch: (patch: Partial<JobWalk>) => void
}

interface MeasurementPdf {
  id: string
  job_walk_id: string
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

const BUCKET = 'job-walk-measurements'

export default function JobWalkMeasurementsCard({
  walk,
  userId,
  onPatch,
}: JobWalkMeasurementsCardProps) {
  const [measurements, setMeasurements] = useState(walk.measurements ?? '')
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
      .from('job_walk_measurement_pdfs')
      .select('*')
      .eq('job_walk_id', walk.id)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[JobWalkMeasurements] Fetch PDFs failed:', error)
    } else if (data) {
      setPdfs(data as MeasurementPdf[])
    }
    setLoadingPdfs(false)
  }, [walk.id])

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
        .from('job_walks')
        .update({ measurements: value || null })
        .eq('id', walk.id)
      if (error) {
        console.error('[JobWalkMeasurements] Save failed:', error)
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
            const path = `${walk.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from(BUCKET)
              .upload(path, file, {
                contentType: file.type || 'application/pdf',
              })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
            const publicUrl = urlData.publicUrl

            const { data: inserted, error: insertErr } = await supabase
              .from('job_walk_measurement_pdfs')
              .insert({
                job_walk_id: walk.id,
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
            console.error('[JobWalkMeasurements] Upload failed:', err)
          } finally {
            setPending((prev) => prev.filter((p) => p.tempId !== placeholder.tempId))
          }
        })
      )
    },
    [walk.id, userId]
  )

  async function handleDeletePdf(pdf: MeasurementPdf) {
    setDeleting(true)
    const supabase = createClient()
    try {
      await supabase.storage.from(BUCKET).remove([pdf.storage_path])
      const { error } = await supabase
        .from('job_walk_measurement_pdfs')
        .delete()
        .eq('id', pdf.id)
      if (error) throw error
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id))
      setConfirmDelete(null)
    } catch (err) {
      console.error('[JobWalkMeasurements] Delete failed:', err)
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
          placeholder="Add measurement notes from your job walk..."
          className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
        />

        {/* PDF thumbnails */}
        <div className="mt-3">
          {loadingPdfs ? (
            <div className="py-4 flex items-center justify-center text-gray-400">
              <Loader2Icon className="w-4 h-4 animate-spin" />
            </div>
          ) : pdfs.length === 0 && pending.length === 0 ? null : (
            <div className="flex flex-wrap gap-3">
              {pdfs.map((pdf) => (
                <div key={pdf.id} className="flex flex-col gap-1.5 w-[120px]">
                  <div className="relative group">
                    <PdfThumbnail
                      url={pdf.file_url}
                      width={120}
                      onClick={() => window.open(pdf.file_url, '_blank', 'noopener,noreferrer')}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDelete(pdf)
                      }}
                      aria-label="Delete PDF"
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500 transition opacity-80 group-hover:opacity-100"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <p
                    className="text-xs text-gray-600 truncate"
                    title={pdf.file_name}
                  >
                    {pdf.file_name}
                  </p>
                </div>
              ))}
              {pending.map((p) => (
                <div key={p.tempId} className="flex flex-col gap-1.5 w-[120px]">
                  <div
                    style={{ width: 120, height: 160 }}
                    className="rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2"
                  >
                    <Loader2Icon className="w-5 h-5 text-gray-400 animate-spin" />
                    <span className="text-[10px] text-gray-400">Uploading…</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate" title={p.fileName}>
                    {p.fileName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload button */}
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
