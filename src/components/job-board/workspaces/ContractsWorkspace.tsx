'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileSignatureIcon,
  UploadCloudIcon,
  DownloadIcon,
  Trash2Icon,
  FileTextIcon,
  ImageIcon,
  FileSpreadsheetIcon,
  FileIcon,
  XIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { Project, Profile } from '@/types'
import { moveToTrash } from '@/lib/trashBin'
import Image from 'next/image'
import WorkspaceShell from '../WorkspaceShell'
import PdfThumbnail from '@/components/documents/PdfThumbnail'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Portal from '@/components/ui/Portal'

interface ContractFile {
  id: string
  project_id: string
  name: string
  file_url: string
  file_type: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

interface ContractsWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(fileType: string) {
  if (fileType === 'application/pdf' || fileType === 'pdf') return <FileTextIcon className="w-4 h-4 text-red-500" />
  if (fileType.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-500" />
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType === 'text/csv') return <FileSpreadsheetIcon className="w-4 h-4 text-green-600" />
  if (fileType.includes('word') || fileType.includes('document')) return <FileTextIcon className="w-4 h-4 text-blue-600" />
  return <FileIcon className="w-4 h-4 text-gray-400" />
}

function getTypeBadge(fileType: string) {
  if (fileType === 'application/pdf' || fileType === 'pdf') return { label: 'PDF', cls: 'bg-red-100 text-red-700' }
  if (fileType.startsWith('image/')) return { label: 'Image', cls: 'bg-blue-100 text-blue-700' }
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType === 'text/csv') return { label: 'Spreadsheet', cls: 'bg-green-100 text-green-700' }
  if (fileType.includes('word') || fileType.includes('document')) return { label: 'Document', cls: 'bg-blue-100 text-blue-700' }
  if (fileType === 'text/plain') return { label: 'Text', cls: 'bg-gray-100 text-gray-600' }
  return { label: 'File', cls: 'bg-gray-100 text-gray-600' }
}

function isPdf(fileType: string) {
  return fileType === 'application/pdf' || fileType === 'pdf'
}

function isImage(fileType: string) {
  return fileType.startsWith('image/')
}

export default function ContractsWorkspace({ project, userId, onBack }: ContractsWorkspaceProps) {
  const [files, setFiles] = useState<ContractFile[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  // Upload state
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Delete state
  const [fileToDelete, setFileToDelete] = useState<ContractFile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<string>('')

  const supabase = createClient()
  const bucket = 'contracts'

  const fetchFiles = useCallback(async () => {
    const sb = createClient()
    const { data, error: fetchErr } = await sb
      .from('project_contracts')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    if (fetchErr) {
      console.error('[Contracts] Fetch failed:', fetchErr)
      setError('Failed to load documents')
    }
    setFiles((data as ContractFile[]) ?? [])
    setLoading(false)
  }, [project.id])

  const fetchProfiles = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchFiles()
    fetchProfiles()
  }, [fetchFiles, fetchProfiles])

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const getPublicUrl = (fileUrl: string) => {
    // If it's already a full URL, return as-is
    if (fileUrl.startsWith('http')) return fileUrl
    return supabase.storage.from(bucket).getPublicUrl(fileUrl).data.publicUrl
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${formatFileSize(file.size)}). Maximum size is 25MB.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploadFile(file)
    // Auto-fill name from filename if empty
    if (!uploadName.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
      setUploadName(nameWithoutExt)
    }
    setError(null)
  }

  async function handleUpload() {
    if (!uploadName.trim()) { setError('Please enter a document name'); return }
    if (!uploadFile) { setError('Please select a file'); return }

    setUploading(true)
    setError(null)

    try {
      const ext = uploadFile.name.split('.').pop()
      const storagePath = `${project.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage.from(bucket).upload(storagePath, uploadFile)
      if (uploadErr) throw uploadErr

      const { error: insertErr } = await supabase.from('project_contracts').insert({
        project_id: project.id,
        name: uploadName.trim(),
        file_url: storagePath,
        file_type: uploadFile.type || 'application/octet-stream',
        file_size: uploadFile.size,
        uploaded_by: userId,
      })
      if (insertErr) throw insertErr

      // Reset form
      setShowUploadForm(false)
      setUploadName('')
      setUploadFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await fetchFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!fileToDelete) return
    setDeleting(true)

    // Snapshot the record for trash bin
    const { data: snapshot } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', fileToDelete.id)
      .single()

    // Delete from storage first (can't be restored)
    await supabase.storage.from(bucket).remove([fileToDelete.file_url])

    // Move to trash (handles DB deletion)
    const { error: trashErr } = await moveToTrash(
      supabase,
      'contract',
      fileToDelete.id,
      fileToDelete.name,
      userId,
      (snapshot as Record<string, unknown>) ?? { id: fileToDelete.id, name: fileToDelete.name },
      project.name,
    )
    if (trashErr) {
      setError('Failed to delete document')
    } else {
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id))
    }

    setDeleting(false)
    setFileToDelete(null)
  }

  function handlePreview(file: ContractFile) {
    const url = getPublicUrl(file.file_url)

    if (isPdf(file.file_type)) {
      if (window.innerWidth < 768) {
        window.open(url, '_blank')
      } else {
        setPreviewUrl(url)
        setPreviewType(file.file_type)
      }
    } else if (isImage(file.file_type)) {
      setPreviewUrl(url)
      setPreviewType(file.file_type)
    } else {
      // Download for non-previewable types
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.target = '_blank'
      a.click()
    }
  }

  return (
    <WorkspaceShell
      title="Contracts & POs"
      icon={<FileSignatureIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={() => setShowUploadForm(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <UploadCloudIcon className="w-4 h-4" />
          Upload
        </button>
      }
    >
      <div className="p-4">
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-0.5">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload form */}
        {showUploadForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload Document</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Document Name *</label>
                <input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g., Subcontractor Agreement, PO #1234"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />
                <p className="text-xs text-gray-400 mt-1">PDF, Images, Word, Excel, CSV, Text — Max 25MB</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadFile || !uploadName.trim()}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {uploading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UploadCloudIcon className="w-4 h-4" />
                  )}
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  onClick={() => { setShowUploadForm(false); setUploadName(''); setUploadFile(null); setError(null) }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* File list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-20">
            <FileSignatureIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No documents uploaded yet</p>
            <button
              onClick={() => setShowUploadForm(true)}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Upload the first document
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const badge = getTypeBadge(file.file_type)
              const uploader = file.uploaded_by ? profileMap.get(file.uploaded_by) : null
              return (
                <div
                  key={file.id}
                  className="bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    {/* Thumbnail / Icon */}
                    <div
                      className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden"
                      onClick={() => handlePreview(file)}
                    >
                      {isPdf(file.file_type) ? (
                        <PdfThumbnail url={getPublicUrl(file.file_url)} onClick={() => handlePreview(file)} width={48} />
                      ) : isImage(file.file_type) ? (
                        <Image src={getPublicUrl(file.file_url)} alt={file.name} width={48} height={48} className="object-cover w-full h-full rounded-lg" />
                      ) : (
                        getFileIcon(file.file_type)
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePreview(file)}>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span>{formatDate(file.created_at)}</span>
                        {file.file_size && <span>· {formatFileSize(file.file_size)}</span>}
                        {uploader && <span>· {uploader.display_name || 'Unknown'}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={getPublicUrl(file.file_url)}
                        download={file.name}
                        className="p-1.5 text-gray-400 hover:text-amber-600 rounded transition"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DownloadIcon className="w-4 h-4" />
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFileToDelete(file) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded transition"
                        title="Delete"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview overlay */}
      {previewUrl && (
        <Portal>
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
            <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPreviewUrl(null)}
                className="absolute -top-2 -right-2 z-10 bg-white rounded-full p-1.5 shadow text-gray-600 hover:text-gray-900"
              >
                <XIcon className="w-4 h-4" />
              </button>
              {isPdf(previewType) ? (
                <iframe src={previewUrl} className="w-full h-full rounded-lg" />
              ) : (
                <div className="relative w-full h-full">
                  <Image src={previewUrl} alt="Preview" fill className="object-contain" />
                </div>
              )}
            </div>
          </div>
        </Portal>
      )}

      {/* Delete confirmation */}
      {fileToDelete && (
        <ConfirmDialog
          title="Delete Document"
          message={`Delete "${fileToDelete.name}"? It will be moved to the trash bin and can be restored within 1 year.`}
          onConfirm={handleDelete}
          onCancel={() => setFileToDelete(null)}
          loading={deleting}
        />
      )}
    </WorkspaceShell>
  )
}
