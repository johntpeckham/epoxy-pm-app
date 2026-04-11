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
} from 'lucide-react'
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

export default function ServiceManualModal({
  equipmentId,
  equipmentName,
  userId,
  canManage,
  docs,
  onClose,
  onChanged,
}: Props) {
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const manuals = docs
    .filter((d) => d.document_type === 'manual')
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))

  async function handleUpload() {
    if (!label.trim()) {
      setError('Please enter a name for the manual.')
      return
    }
    if (!file) {
      setError('Please select a PDF file.')
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Service manuals must be PDF files.')
      return
    }

    setError(null)
    setUploading(true)

    const supabase = createClient()
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `${equipmentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('equipment-documents')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadErr) throw uploadErr

      const fileUrl = supabase.storage
        .from('equipment-documents')
        .getPublicUrl(path).data.publicUrl

      const { error: insertErr } = await supabase
        .from('equipment_documents')
        .insert({
          equipment_id: equipmentId,
          label: label.trim(),
          file_url: fileUrl,
          uploaded_by: userId,
          document_type: 'manual',
        })
      if (insertErr) throw insertErr

      setLabel('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Service Manual</h2>
              <p className="text-xs text-gray-500 truncate">{equipmentName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Upload form (hidden if the user cannot manage equipment) */}
            {canManage && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload a new manual</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Owner's Manual, Parts Catalog, Service Guide"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      PDF *
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-gray-900 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 file:transition-colors"
                    />
                    <p className="text-xs text-gray-400 mt-1">PDF files only</p>
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !label.trim() || !file}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UploadCloudIcon className="w-4 h-4" />
                    )}
                    {uploading ? 'Uploading...' : 'Upload PDF'}
                  </button>
                </div>
              </div>
            )}

            {/* Manuals list */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Uploaded manuals {manuals.length > 0 && <span className="text-gray-400 font-normal">({manuals.length})</span>}
              </h3>
              {manuals.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No service manuals uploaded yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {manuals.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                        <FileTextIcon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.label}</p>
                        <p className="text-xs text-gray-500">Uploaded {formatUploadedAt(m.uploaded_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handlePreview(m.file_url)}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                          title="View"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLinkIcon className="w-4 h-4" />
                        </a>
                        {canManage && (
                          <button
                            onClick={() => handleDelete(m.id)}
                            disabled={deletingId === m.id}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
