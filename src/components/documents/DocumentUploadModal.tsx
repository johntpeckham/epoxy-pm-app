'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon,
  UploadCloudIcon,
  FileTextIcon,
  Trash2Icon,
  Loader2Icon,
  DownloadIcon,
  EyeIcon,
} from 'lucide-react'
import { DocumentCategory, ProjectDocument } from '@/types'
import PdfThumbnail from './PdfThumbnail'
import PlansViewer from './PlansViewer'

interface DocumentUploadModalProps {
  projectId: string
  projectName: string
  userId: string
  category: DocumentCategory
  onClose: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DocumentUploadModal({
  projectId,
  projectName,
  userId,
  category,
  onClose,
}: DocumentUploadModalProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null)

  const label = category === 'report' ? 'Reports' : 'Plans'
  const bucket = category === 'report' ? 'project-documents' : 'project-plans'
  const documentType = category === 'report' ? 'report' : 'plans'

  // Fetch existing documents on mount
  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true)
    const { data } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .eq('document_type', documentType)
      .order('created_at', { ascending: false })

    setDocs((data as ProjectDocument[]) ?? [])
    setLoadingDocs(false)
  }, [supabase, projectId, documentType])

  // Fetch on first render
  useState(() => {
    fetchDocs()
  })

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setUploading(true)
    setError(null)

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const storagePath = `${projectId}/${category}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(storagePath, file)
        if (uploadErr) throw uploadErr

        const { error: insertErr } = await supabase.from('project_documents').insert({
          project_id: projectId,
          user_id: userId,
          bucket,
          file_path: storagePath,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          document_type: documentType,
        })
        if (insertErr) throw insertErr
      }

      await fetchDocs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(doc: ProjectDocument) {
    setDeletingId(doc.id)
    setError(null)

    try {
      await supabase.storage.from(bucket).remove([doc.file_path])
      const { error: deleteErr } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', doc.id)
      if (deleteErr) throw deleteErr
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  function getPublicUrl(filePath: string) {
    return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
  }

  function isPdf(doc: ProjectDocument) {
    return doc.file_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf')
  }

  function isImage(doc: ProjectDocument) {
    return doc.file_type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp)$/i.test(doc.file_name)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* Upload area */}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition mb-4"
          >
            {uploading ? (
              <Loader2Icon className="w-6 h-6 text-amber-500 mx-auto mb-2 animate-spin" />
            ) : (
              <UploadCloudIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            )}
            <p className="text-sm text-gray-500">
              <span className="font-medium text-amber-600">
                {uploading ? 'Uploading...' : `Upload ${label.toLowerCase()}`}
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, images, or any file</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Document list */}
          {loadingDocs ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">
              No {label.toLowerCase()} uploaded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {/* PDF thumbnail grid */}
              {docs.some(isPdf) && (
                <div className="grid grid-cols-3 gap-3">
                  {docs.filter(isPdf).map((doc) => (
                    <div key={doc.id} className="group relative">
                      <PdfThumbnail
                        url={getPublicUrl(doc.file_path)}
                        onClick={() => setPreviewDoc(doc)}
                      />
                      <p className="text-[11px] text-gray-600 mt-1.5 truncate px-0.5" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <p className="text-[10px] text-gray-400 px-0.5">{formatDate(doc.created_at)}</p>
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                        <a
                          href={getPublicUrl(doc.file_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 bg-white/90 rounded shadow-sm text-gray-400 hover:text-amber-600 transition"
                          title="Download"
                        >
                          <DownloadIcon className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.id}
                          className="p-1 bg-white/90 rounded shadow-sm text-gray-400 hover:text-red-600 transition disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === doc.id ? (
                            <Loader2Icon className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2Icon className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Non-PDF files as rows */}
              {docs.filter((d) => !isPdf(d)).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 group cursor-pointer hover:border-amber-200 hover:bg-amber-50/30 transition"
                  onClick={() => setPreviewDoc(doc)}
                >
                  <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc) }}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition opacity-0 group-hover:opacity-100"
                      title="Preview"
                    >
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    <a
                      href={getPublicUrl(doc.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition opacity-0 group-hover:opacity-100"
                      title="Download"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                      disabled={deletingId === doc.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingId === doc.id ? (
                        <Loader2Icon className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            Done
          </button>
        </div>
      </div>

      {/* Full-screen PDF viewer */}
      {previewDoc && isPdf(previewDoc) && (
        <PlansViewer
          url={getPublicUrl(previewDoc.file_path)}
          fileName={previewDoc.file_name}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Non-PDF preview overlay */}
      {previewDoc && !isPdf(previewDoc) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center lg:p-6">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPreviewDoc(null)} />
          <div className="relative bg-white lg:rounded-xl shadow-2xl flex flex-col w-full h-full lg:w-[80vw] lg:h-[85vh]">
            <div className="flex items-center justify-between px-4 lg:px-6 pt-3 lg:pt-4 pb-2 lg:pb-3 border-b border-gray-100 flex-none">
              <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-gray-900 truncate">{previewDoc.file_name}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={getPublicUrl(previewDoc.file_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                  title="Download"
                >
                  <DownloadIcon className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {isImage(previewDoc) ? (
                <div className="flex items-center justify-center p-6 overflow-auto h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPublicUrl(previewDoc.file_path)}
                    alt={previewDoc.file_name}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <FileTextIcon className="w-12 h-12 text-gray-300 mb-4" />
                  <p className="text-sm text-gray-500 mb-1">Preview not available for this file type</p>
                  <p className="text-xs text-gray-400 mb-6">{previewDoc.file_name}</p>
                  <a
                    href={getPublicUrl(previewDoc.file_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
