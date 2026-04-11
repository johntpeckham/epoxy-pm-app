'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon,
  UploadCloudIcon,
  FileTextIcon,
  Trash2Icon,
  ExternalLinkIcon,
  EyeIcon,
  Loader2Icon,
  BookOpenIcon,
} from 'lucide-react'
import { Document, Page } from 'react-pdf'
import '@/lib/pdfWorker'
import Portal from '@/components/ui/Portal'
import type { EquipmentDocumentRow } from '@/app/(dashboard)/equipment/[id]/page'

interface Props {
  equipmentId: string
  equipmentName: string
  userId: string
  canManage: boolean
  /** All equipment_documents rows for this equipment. The modal filters to
   *  document_type === 'manual' itself so the parent can pass a single list. */
  docs: EquipmentDocumentRow[]
  onClose: () => void
  /** Called after successful upload / delete so the parent can refetch. */
  onChanged: () => void
}

function formatUploadedAt(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Strip a .pdf extension so the default manual name is cleaner. */
function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '')
}

export default function ServiceManualModal({
  equipmentId,
  equipmentName,
  userId,
  canManage,
  docs,
  onClose,
  onChanged,
}: Props) {
  // Upload flow state: after the user picks a file, `pendingFile` is set and
  // a small inline name prompt appears below the header asking for the
  // manual name. Empty name defaults to the filename.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const manuals = docs
    .filter((d) => d.document_type === 'manual')
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))

  function handleUploadClick() {
    setError(null)
    fileRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    if (!picked) return

    const nameEndsWithPdf = picked.name.toLowerCase().endsWith('.pdf')
    const mimeIsPdf =
      picked.type === 'application/pdf' || picked.type === 'application/x-pdf'
    if (!mimeIsPdf && !nameEndsWithPdf) {
      setError('Service manuals must be PDF files.')
      // Clear the input so picking the same file again still fires onChange.
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setError(null)
    setPendingFile(picked)
    setPendingName(stripPdfExtension(picked.name))
  }

  function cancelPending() {
    setPendingFile(null)
    setPendingName('')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function savePending() {
    if (!pendingFile) return

    const finalName = pendingName.trim() || stripPdfExtension(pendingFile.name)

    setError(null)
    setUploading(true)

    const supabase = createClient()
    try {
      const ext = pendingFile.name.split('.').pop() || 'pdf'
      const path = `${equipmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('equipment-documents')
        .upload(path, pendingFile, { contentType: 'application/pdf' })
      if (uploadErr) throw uploadErr

      const fileUrl = supabase.storage
        .from('equipment-documents')
        .getPublicUrl(path).data.publicUrl

      const { error: insertErr } = await supabase
        .from('equipment_documents')
        .insert({
          equipment_id: equipmentId,
          label: finalName,
          file_url: fileUrl,
          uploaded_by: userId,
          document_type: 'manual',
        })
      if (insertErr) throw insertErr

      cancelPending()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload manual.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Delete this service manual? This cannot be undone.')
    if (!confirmed) return
    setDeletingId(id)
    const supabase = createClient()
    try {
      const { error: delErr } = await supabase
        .from('equipment_documents')
        .delete()
        .eq('id', id)
      if (delErr) throw delErr
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete manual.')
    } finally {
      setDeletingId(null)
    }
  }

  function handlePreview(url: string) {
    // On mobile the embedded iframe preview is unreliable — pop the PDF
    // in a new tab instead. Mirrors the ContractsWorkspace pattern.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    setPreviewUrl(url)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Service Manual</h2>
              <p className="text-xs text-gray-500 truncate">{equipmentName}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canManage && (
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={uploading || !!pendingFile}
                  title="Upload a new manual"
                  aria-label="Upload a new manual"
                  className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UploadCloudIcon className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Close"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Hidden file input — triggered by the header upload button */}
          {canManage && (
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileSelected}
              className="hidden"
            />
          )}

          {/* Pending upload prompt — asks for a manual name after the user
              picks a file. Sits directly under the header. */}
          {canManage && pendingFile && (
            <div className="px-5 py-3 border-b border-amber-200 bg-amber-50/70 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2 text-xs text-amber-900">
                <FileTextIcon className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium truncate">{pendingFile.name}</span>
                <span className="text-amber-700 flex-shrink-0">
                  ({(pendingFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Manual name (defaults to filename)"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !uploading) {
                      e.preventDefault()
                      savePending()
                    } else if (e.key === 'Escape') {
                      cancelPending()
                    }
                  }}
                  className="flex-1 min-w-0 border border-amber-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                />
                <button
                  type="button"
                  onClick={savePending}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {uploading ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UploadCloudIcon className="w-3.5 h-3.5" />
                  )}
                  {uploading ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelPending}
                  disabled={uploading}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {manuals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <BookOpenIcon className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-600">No service manuals yet</p>
                {canManage && (
                  <p className="text-xs text-gray-400 mt-1">
                    Click the upload button above to add one
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {manuals.map((m) => (
                  <ManualCard
                    key={m.id}
                    manual={m}
                    canManage={canManage}
                    deleting={deletingId === m.id}
                    onPreview={() => handlePreview(m.file_url)}
                    onDelete={() => handleDelete(m.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Desktop PDF preview overlay — mirrors the Contracts workspace pattern. */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative w-full h-full max-w-5xl max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1.5 shadow text-gray-600 hover:text-gray-900"
              aria-label="Close preview"
            >
              <XIcon className="w-4 h-4" />
            </button>
            <iframe src={previewUrl} className="w-full h-full rounded-lg bg-white" title="Service manual preview" />
          </div>
        </div>
      )}
    </Portal>
  )
}

/**
 * A single manual rendered as a PDF thumbnail card with hover actions.
 * Renders page 1 of the PDF via react-pdf. Falls back to a document icon
 * if the render fails (corrupt file, unreachable URL, etc.).
 */
function ManualCard({
  manual,
  canManage,
  deleting,
  onPreview,
  onDelete,
}: {
  manual: EquipmentDocumentRow
  canManage: boolean
  deleting: boolean
  onPreview: () => void
  onDelete: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const thumbWidth = 180

  return (
    <div className="group flex flex-col">
      <div
        className="relative rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-amber-300 hover:shadow-md transition cursor-pointer"
        style={{ aspectRatio: '3 / 4' }}
        onClick={onPreview}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPreview()
          }
        }}
      >
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 p-3 text-center">
            <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
            <span className="text-[10px] text-gray-400 line-clamp-2">{manual.label}</span>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-0">
                <Loader2Icon className="w-5 h-5 text-gray-300 animate-spin" />
              </div>
            )}
            <div className="absolute inset-0 flex items-start justify-center overflow-hidden">
              <Document
                file={manual.file_url}
                onLoadSuccess={() => setLoading(false)}
                onLoadError={() => {
                  setLoading(false)
                  setFailed(true)
                }}
                loading={null}
              >
                <Page
                  pageNumber={1}
                  width={thumbWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          </>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPreview()
            }}
            title="View"
            aria-label="View"
            className="pointer-events-auto p-2 bg-white/95 hover:bg-white text-gray-700 hover:text-amber-600 rounded-full shadow-md transition-colors"
          >
            <EyeIcon className="w-4 h-4" />
          </button>
          <a
            href={manual.file_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open in new tab"
            aria-label="Open in new tab"
            className="pointer-events-auto p-2 bg-white/95 hover:bg-white text-gray-700 hover:text-amber-600 rounded-full shadow-md transition-colors"
          >
            <ExternalLinkIcon className="w-4 h-4" />
          </a>
          {canManage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={deleting}
              title="Delete"
              aria-label="Delete"
              className="pointer-events-auto p-2 bg-white/95 hover:bg-white text-gray-700 hover:text-red-600 rounded-full shadow-md transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2Icon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      <p
        className="mt-2 text-sm font-medium text-gray-900 text-center line-clamp-2"
        title={manual.label}
      >
        {manual.label}
      </p>
      <p className="text-xs text-gray-400 text-center">
        {formatUploadedAt(manual.uploaded_at)}
      </p>
    </div>
  )
}
