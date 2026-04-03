'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileTextIcon, UploadCloudIcon, DownloadIcon, Trash2Icon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Project, ProjectDocument } from '@/types'
import { moveToTrash } from '@/lib/trashBin'
import Image from 'next/image'
import WorkspaceShell from '../WorkspaceShell'
import PdfThumbnail from '@/components/documents/PdfThumbnail'

interface PlansWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlansWorkspace({ project, userId, onBack }: PlansWorkspaceProps) {
  const [docs, setDocs] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const bucket = 'project-plans'
  const documentType = 'plans'
  const supabase = createClient()

  const fetchDocs = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from('project_documents')
      .select('*')
      .eq('project_id', project.id)
      .eq('document_type', documentType)
      .order('created_at', { ascending: false })
    setDocs((data as ProjectDocument[]) ?? [])
    setLoading(false)
  }, [project.id])

  const togglePublished = useCallback(async (doc: ProjectDocument) => {
    const newVal = !(doc as ProjectDocument & { is_published?: boolean }).is_published
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, is_published: newVal } as ProjectDocument : d))
    const sb = createClient()
    const { error } = await sb.from('project_documents').update({ is_published: newVal }).eq('id', doc.id)
    if (error) {
      console.error('[PlansWorkspace] Publish toggle failed:', error)
      fetchDocs()
    }
  }, [fetchDocs])

  useEffect(() => {
    setLoading(true)
    fetchDocs()
  }, [fetchDocs])

  const getPublicUrl = (filePath: string) => supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl

  const isPdf = (doc: ProjectDocument) => doc.file_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf')
  const isImage = (doc: ProjectDocument) => doc.file_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(doc.file_name)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const storagePath = `${project.id}/plan/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from(bucket).upload(storagePath, file)
        if (uploadErr) throw uploadErr
        const { error: insertErr } = await supabase.from('project_documents').insert({
          project_id: project.id,
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
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(doc: ProjectDocument) {
    setDeletingId(doc.id)

    // Snapshot the record for trash bin
    const { data: snapshot } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', doc.id)
      .single()

    // Remove storage file first (can't be restored)
    await supabase.storage.from(bucket).remove([doc.file_path])

    // Move to trash (handles DB deletion)
    const { error: trashErr } = await moveToTrash(
      supabase,
      'document',
      doc.id,
      doc.file_name,
      userId,
      (snapshot as Record<string, unknown>) ?? { id: doc.id, file_name: doc.file_name },
      project.name,
    )
    if (trashErr) {
      setError('Failed to delete: ' + trashErr)
    } else {
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    }
    setDeletingId(null)
  }

  function handlePreview(doc: ProjectDocument) {
    const url = getPublicUrl(doc.file_path)
    if (isPdf(doc) && window.innerWidth < 768) {
      window.open(url, '_blank')
    } else {
      setPreviewUrl(url)
    }
  }

  return (
    <WorkspaceShell
      title="Plans"
      icon={<FileTextIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" multiple onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadCloudIcon className="w-3.5 h-3.5" />
            )}
            Upload
          </button>
        </>
      }
    >
      <div className="p-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
            <FileTextIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No plans uploaded yet</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Upload the first plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {docs.map((doc) => {
              const published = (doc as ProjectDocument & { is_published?: boolean }).is_published !== false
              return (
                <div key={doc.id} className={`bg-white rounded-xl border border-gray-200 overflow-hidden group hover:shadow-sm hover:border-gray-300 transition-all ${!published ? 'opacity-60' : ''}`}>
                  {/* Thumbnail */}
                  <div className="aspect-[3/4] relative bg-gray-50 cursor-pointer" onClick={() => handlePreview(doc)}>
                    {isPdf(doc) ? (
                      <PdfThumbnail url={getPublicUrl(doc.file_path)} onClick={() => handlePreview(doc)} />
                    ) : isImage(doc) ? (
                      <Image src={getPublicUrl(doc.file_path)} alt={doc.file_name} fill className="object-contain" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <FileTextIcon className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium text-gray-900 truncate flex-1">{doc.file_name}</p>
                      {!published && <span className="text-xs text-gray-400 italic flex-shrink-0">Hidden</span>}
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(doc.created_at)}</p>
                    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handlePreview(doc)} className="p-1 text-gray-400 hover:text-amber-600 rounded" title="Preview">
                        <EyeIcon className="w-3.5 h-3.5" />
                      </button>
                      <a href={getPublicUrl(doc.file_path)} download={doc.file_name} className="p-1 text-gray-400 hover:text-amber-600 rounded" title="Download">
                        <DownloadIcon className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => togglePublished(doc)}
                        className={`p-1 rounded transition ${published ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                        title={published ? 'Published' : 'Hidden from feed'}
                      >
                        {published ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PDF/Image preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
          <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-2 -right-2 z-10 bg-white rounded-full p-1 shadow text-gray-600 hover:text-gray-900"
            >
              ✕
            </button>
            {previewUrl.toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewUrl} className="w-full h-full rounded-lg" />
            ) : (
              <div className="relative w-full h-full">
                <Image src={previewUrl} alt="Preview" fill className="object-contain" />
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceShell>
  )
}
