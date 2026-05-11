'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRightIcon,
  RulerIcon,
  UploadIcon,
  XIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PdfThumbnail from '@/components/documents/PdfThumbnail'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import TakeoffSummaryPreview from '@/components/shared/TakeoffSummaryPreview'

export type MeasurementsParentType = 'lead' | 'appointment' | 'job_walk' | 'project'

// 'takeoff' values are uploaded via the Takeoff tool; 'site' values are
// carried over from a Lead / Appointment / Job Walk conversion. Only the
// Project parentType actually populates this column (default 'takeoff' on
// rows from the Takeoff tool, 'site' on rows from conversion).
type PdfSource = 'takeoff' | 'site'

interface MeasurementsCardProps {
  parentType: MeasurementsParentType
  parentId: string
  userId: string
  // Optional for parents whose row table has no `measurements` text column,
  // or when dualSourceMode is true (we hide the textarea entirely on
  // Project). When omitted, the textarea is not rendered and no parent-row
  // updates are made.
  measurements?: string | null
  onMeasurementsPatch?: (value: string | null) => void
  // When true, the PDF list splits into two labeled sub-sections —
  // "Takeoff Measurements" and "Site Measurements" — each with its own
  // upload button that tags inserts with the corresponding source value.
  // Only meaningful when the underlying pdfTable has a `source` column
  // (currently: estimating_project_measurement_pdfs).
  dualSourceMode?: boolean
}

interface MeasurementPdf {
  id: string
  file_name: string
  file_url: string
  storage_path: string
  created_by: string | null
  created_at: string
  // Only populated for tables that carry a source column. The Project
  // tables do; Lead / Appointment / Job Walk tables don't — supabase
  // returns undefined for those, which we treat as a flat (non-grouped)
  // list everywhere except dualSourceMode.
  source?: PdfSource
}

interface PendingUpload {
  tempId: string
  fileName: string
  // Only set in dualSourceMode — lets the render filter in-flight uploads
  // into the same sub-section the user kicked them off from.
  source?: PdfSource
}

const CONFIG: Record<
  MeasurementsParentType,
  {
    parentTable: string
    pdfTable: string
    fk: string
    bucket: string
  }
> = {
  lead: {
    parentTable: 'leads',
    pdfTable: 'lead_measurement_pdfs',
    fk: 'lead_id',
    bucket: 'lead-measurement-pdfs',
  },
  appointment: {
    parentTable: 'crm_appointments',
    pdfTable: 'appointment_measurement_pdfs',
    fk: 'appointment_id',
    bucket: 'appointment-measurement-pdfs',
  },
  job_walk: {
    parentTable: 'job_walks',
    pdfTable: 'job_walk_measurement_pdfs',
    fk: 'job_walk_id',
    bucket: 'job-walk-measurements',
  },
  project: {
    parentTable: 'estimating_projects',
    pdfTable: 'estimating_project_measurement_pdfs',
    fk: 'project_id',
    // Reuses the existing Takeoff-tool bucket. The migration that
    // introduced the source column intentionally did not create a separate
    // bucket — both takeoff and site PDFs live in estimating-project-files.
    bucket: 'estimating-project-files',
  },
}

export default function MeasurementsCard({
  parentType,
  parentId,
  userId,
  measurements,
  onMeasurementsPatch,
  dualSourceMode = false,
}: MeasurementsCardProps) {
  const cfg = CONFIG[parentType]
  // When dualSourceMode is on (Project), the textarea is hidden entirely —
  // estimating_projects.measurements is intentionally not surfaced on the
  // project detail page; site/takeoff content lives in the PDF tables
  // instead. When the wrapper omits measurements/onMeasurementsPatch, the
  // textarea is also hidden — covers parents whose row has no measurements
  // column.
  const showMeasurementsTextarea =
    !dualSourceMode && measurements !== undefined && Boolean(onMeasurementsPatch)
  const [text, setText] = useState(measurements ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pdfs, setPdfs] = useState<MeasurementPdf[]>([])
  const [loadingPdfs, setLoadingPdfs] = useState(true)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [confirmDelete, setConfirmDelete] = useState<MeasurementPdf | null>(null)
  const [deleting, setDeleting] = useState(false)
  // One hidden file input per upload affordance. The flat (single-list)
  // mode uses fileInputRef; dualSourceMode only has a Site upload button
  // (Takeoff data flows in from the takeoff tool — no manual PDF upload
  // affordance there), so siteInputRef is the only dual-source ref.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const siteInputRef = useRef<HTMLInputElement>(null)

  const fetchPdfs = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from(cfg.pdfTable)
      .select('*')
      .eq(cfg.fk, parentId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[MeasurementsCard] Fetch PDFs failed:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
    } else if (data) {
      setPdfs(data as MeasurementPdf[])
    }
    setLoadingPdfs(false)
  }, [cfg.fk, cfg.pdfTable, parentId])

  useEffect(() => {
    fetchPdfs()
  }, [fetchPdfs])

  function handleTextChange(value: string) {
    setText(value)
    onMeasurementsPatch?.(value || null)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from(cfg.parentTable)
        .update({ measurements: value || null })
        .eq('id', parentId)
      if (error) {
        console.error('[MeasurementsCard] Text save failed:', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        })
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(() => setSaveState('idle'), 1500)
      }
    }, 1000)
  }

  const handleFiles = useCallback(
    async (fileList: FileList | null, source?: PdfSource) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList)
      const supabase = createClient()

      const pendingList: PendingUpload[] = files.map((f) => ({
        tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: f.name,
        source,
      }))
      setPending((prev) => [...prev, ...pendingList])

      await Promise.all(
        files.map(async (file, idx) => {
          const placeholder = pendingList[idx]
          try {
            const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
            const path = `${parentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from(cfg.bucket)
              .upload(path, file, {
                contentType: file.type || 'application/pdf',
              })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage.from(cfg.bucket).getPublicUrl(path)
            const publicUrl = urlData.publicUrl

            // Only include `source` in the insert payload if the caller asked
            // for a specific value (dualSourceMode uploads). The column has
            // a database-side default of 'takeoff' on tables where it
            // exists, and is silently ignored on tables where it doesn't —
            // which is the behavior we want for Lead/Appointment/Job Walk.
            const insertPayload: Record<string, unknown> = {
              [cfg.fk]: parentId,
              file_name: file.name,
              file_url: publicUrl,
              storage_path: path,
              created_by: userId,
            }
            if (source) insertPayload.source = source

            const { data: inserted, error: insertErr } = await supabase
              .from(cfg.pdfTable)
              .insert(insertPayload)
              .select('*')
              .single()
            if (insertErr) throw insertErr

            if (inserted) {
              setPdfs((prev) => [...prev, inserted as MeasurementPdf])
            }
          } catch (err) {
            console.error('[MeasurementsCard] Upload failed:', err)
          } finally {
            setPending((prev) => prev.filter((p) => p.tempId !== placeholder.tempId))
          }
        })
      )
    },
    [cfg.bucket, cfg.fk, cfg.pdfTable, parentId, userId]
  )

  async function handleDeletePdf(pdf: MeasurementPdf) {
    setDeleting(true)
    const supabase = createClient()
    try {
      await supabase.storage.from(cfg.bucket).remove([pdf.storage_path])
      const { error } = await supabase
        .from(cfg.pdfTable)
        .delete()
        .eq('id', pdf.id)
      if (error) throw error
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id))
      setConfirmDelete(null)
    } catch (err) {
      console.error('[MeasurementsCard] Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  // Renders one PDF tile + delete control. Shared by both the flat list and
  // each dualSourceMode sub-section.
  function renderPdfTile(pdf: MeasurementPdf) {
    return (
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
    )
  }

  function renderPendingTile(p: PendingUpload) {
    return (
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
    )
  }

  // Renders one PDF sub-section: title + grid + upload button + empty
  // state. Used three ways: flat (sectionTitle="Measurements" sub-area in
  // single mode), and two sub-sections in dualSourceMode.
  function renderSection(args: {
    sectionTitle: string | null
    sectionPdfs: MeasurementPdf[]
    sectionPending: PendingUpload[]
    onUploadClick: () => void
    emptyText: string
  }) {
    const { sectionTitle, sectionPdfs, sectionPending, onUploadClick, emptyText } = args
    const hasContent = sectionPdfs.length > 0 || sectionPending.length > 0
    return (
      <div className="space-y-3">
        {sectionTitle && (
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {sectionTitle}
          </h4>
        )}
        {loadingPdfs ? (
          <div className="py-4 flex items-center justify-center text-gray-400">
            <Loader2Icon className="w-4 h-4 animate-spin" />
          </div>
        ) : !hasContent ? (
          // Empty-string emptyText (used by the flat single-list mode)
          // renders nothing, preserving the pre-refactor look on
          // Lead/Appointment/Job Walk where the grid simply disappears
          // when there are no PDFs.
          emptyText ? (
            <p className="text-xs text-gray-400">{emptyText}</p>
          ) : null
        ) : (
          <div className="flex flex-wrap gap-3">
            {sectionPdfs.map(renderPdfTile)}
            {sectionPending.map(renderPendingTile)}
          </div>
        )}
        <button
          type="button"
          onClick={onUploadClick}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition"
        >
          <UploadIcon className="w-4 h-4" />
          Upload PDF
        </button>
      </div>
    )
  }

  // For dualSourceMode, filter to source='site' PDFs only — those go in
  // the Site Measurements sub-section. Takeoff-source PDFs are owned by
  // the takeoff tool itself (TakeoffSummaryPreview reads them via the
  // takeoff measurement tables, not via this card), so we don't surface
  // them here as a separate PDF list.
  const sitePdfs = pdfs.filter((p) => p.source === 'site')
  const sitePending = pending.filter((p) => p.source === 'site')

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

        {showMeasurementsTextarea && (
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Add measurements..."
            className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
          />
        )}

        {dualSourceMode ? (
          // Project layout: a Takeoff sub-section (summary + "View takeoff"
          // link, no upload, no textarea) and a Site sub-section
          // (textarea + Upload PDF + PDF list filtered to source='site').
          // The takeoff sub-section's data is read-only here; live edits
          // happen at /estimating/takeoff/{projectId}.
          <div className="space-y-4">
            {/* Takeoff Measurements sub-section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Takeoff Measurements
                </h4>
                <Link
                  href={`/estimating/takeoff/${parentId}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
                >
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                  View takeoff
                </Link>
              </div>
              <TakeoffSummaryPreview projectId={parentId} />
            </div>

            {/* Site Measurements sub-section */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Site Measurements
              </h4>
              {measurements !== undefined && onMeasurementsPatch && (
                <textarea
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Add measurements..."
                  className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
                />
              )}
              {loadingPdfs ? (
                <div className="py-4 flex items-center justify-center text-gray-400">
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                </div>
              ) : sitePdfs.length === 0 && sitePending.length === 0 ? null : (
                <div className="flex flex-wrap gap-3">
                  {sitePdfs.map(renderPdfTile)}
                  {sitePending.map(renderPendingTile)}
                </div>
              )}
              <button
                type="button"
                onClick={() => siteInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition"
              >
                <UploadIcon className="w-4 h-4" />
                Upload PDF
              </button>
            </div>

            <input
              ref={siteInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files, 'site')
                e.target.value = ''
              }}
            />
          </div>
        ) : (
          <div className={showMeasurementsTextarea ? 'mt-3' : ''}>
            {renderSection({
              sectionTitle: null,
              sectionPdfs: pdfs,
              sectionPending: pending,
              onUploadClick: () => fileInputRef.current?.click(),
              emptyText: '',
            })}
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
        )}
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
