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
} from 'lucide-react'
import { DocumentCategory, ProjectDocument } from '@/types'

interface DocumentUploadModalProps {
  projectId: string
  projectName: string
  userId: string
  category: DocumentCategory
  onClose: () => void
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

  const label = category === 'report' ? 'Reports' : 'Plans'
  const bucket = category === 'report' ? 'project-documents' : 'project-plans'

  // Fetch existing documents on mount
  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true)
    const { data } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .eq('category', category)
      .order('created_at', { ascending: false })

    setDocs((data as ProjectDocument[]) ?? [])
    setLoadingDocs(false)
  }, [supabase, projectId, category])

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
          category,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
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
      await supabase.storage.from(bucket).remove([doc.storage_path])
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

  function getPublicUrl(storagePath: string) {
    return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
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
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 group"
                >
                  <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(doc.created_at)}
                      {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={getPublicUrl(doc.storage_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition opacity-0 group-hover:opacity-100"
                      title="Download"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(doc)}
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
    </div>
  )
}
