'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  ArrowLeftIcon,
  FileTextIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  XIcon,
  UploadIcon,
  FileIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'

interface Division {
  id: string
  name: string
  type: 'office' | 'field'
  sort_order: number
  created_at: string
}

interface SOP {
  id: string
  title: string
  type: 'office' | 'field'
  division_id: string | null
  status: 'draft' | 'published'
  sop_format: 'created' | 'uploaded'
  pdf_url: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface Props {
  userId: string
}

export default function SOPsClient({ userId }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [sops, setSOPs] = useState<SOP[]>([])
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'office' | 'field'>('office')
  const [editingDivision, setEditingDivision] = useState<Division | null>(null)
  const [divisionName, setDivisionName] = useState('')
  const [saving, setSaving] = useState(false)

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadType, setUploadType] = useState<'office' | 'field'>('office')
  const [uploadDivisionId, setUploadDivisionId] = useState<string>('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [viewingSOP, setViewingSOP] = useState<SOP | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<SOP | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const [divisionsRes, sopsRes, profilesRes] = await Promise.all([
      supabase.from('sop_divisions').select('*').order('sort_order').order('created_at'),
      supabase.from('sops').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name'),
    ])

    setDivisions((divisionsRes.data as Division[]) ?? [])
    setSOPs((sopsRes.data as SOP[]) ?? [])

    const map = new Map<string, string>()
    for (const p of (profilesRes.data ?? []) as { id: string; display_name: string | null }[]) {
      map.set(p.id, p.display_name ?? 'Unknown')
    }
    setProfiles(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreateModal = (type: 'office' | 'field') => {
    setModalType(type)
    setEditingDivision(null)
    setDivisionName('')
    setModalOpen(true)
  }

  const openEditModal = (division: Division) => {
    setModalType(division.type)
    setEditingDivision(division)
    setDivisionName(division.name)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingDivision(null)
    setDivisionName('')
    setSaving(false)
  }

  const handleSaveDivision = async () => {
    if (!divisionName.trim()) return
    setSaving(true)
    const supabase = createClient()

    if (editingDivision) {
      await supabase
        .from('sop_divisions')
        .update({ name: divisionName.trim() })
        .eq('id', editingDivision.id)
    } else {
      const maxSort = divisions
        .filter((d) => d.type === modalType)
        .reduce((max, d) => Math.max(max, d.sort_order), -1)
      await supabase.from('sop_divisions').insert({
        name: divisionName.trim(),
        type: modalType,
        sort_order: maxSort + 1,
      })
    }

    await fetchData()
    closeModal()
  }

  const handleDeleteDivision = async (division: Division) => {
    const assignedSOPs = sops.filter((s) => s.division_id === division.id)
    if (assignedSOPs.length > 0) {
      alert('Remove SOPs from this division first')
      return
    }

    const supabase = createClient()
    await supabase.from('sop_divisions').delete().eq('id', division.id)
    await fetchData()
  }

  const openUploadModal = () => {
    setUploadTitle('')
    setUploadType('office')
    setUploadDivisionId('')
    setUploadFile(null)
    setUploading(false)
    setDragActive(false)
    setUploadModalOpen(true)
  }

  const closeUploadModal = () => {
    setUploadModalOpen(false)
    setUploadFile(null)
    setUploading(false)
    setDragActive(false)
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped && dropped.type === 'application/pdf') {
      setUploadFile(dropped)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    if (selected) {
      setUploadFile(selected)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleUploadSOP = async () => {
    if (!uploadTitle.trim() || !uploadFile) return
    setUploading(true)
    const supabase = createClient()

    const ext = uploadFile.name.split('.').pop() ?? 'pdf'
    const storagePath = `pdfs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('sop-images')
      .upload(storagePath, uploadFile, { contentType: uploadFile.type || 'application/pdf' })

    if (uploadErr) {
      setUploading(false)
      alert('Upload failed: ' + uploadErr.message)
      return
    }

    const { error: insertErr } = await supabase.from('sops').insert({
      title: uploadTitle.trim(),
      type: uploadType,
      division_id: uploadDivisionId || null,
      status: 'published',
      sop_format: 'uploaded',
      pdf_url: storagePath,
      created_by: userId,
    })

    if (insertErr) {
      setUploading(false)
      alert('Failed to save SOP: ' + insertErr.message)
      return
    }

    await fetchData()
    closeUploadModal()
  }

  const handleViewSOP = (sop: SOP) => {
    if (sop.sop_format !== 'uploaded' || !sop.pdf_url) return
    if (window.innerWidth < 768) {
      const supabase = createClient()
      const url = supabase.storage.from('sop-images').getPublicUrl(sop.pdf_url).data.publicUrl
      window.open(url, '_blank')
      return
    }
    setViewingSOP(sop)
  }

  const handleDeleteSOP = async (sop: SOP) => {
    setDeleting(true)
    const supabase = createClient()

    if (sop.pdf_url) {
      await supabase.storage.from('sop-images').remove([sop.pdf_url])
    }

    await supabase.from('sops').delete().eq('id', sop.id)
    setDeleteConfirm(null)
    setDeleting(false)
    await fetchData()
  }

  const getPdfPublicUrl = (pdfPath: string) => {
    const supabase = createClient()
    return supabase.storage.from('sop-images').getPublicUrl(pdfPath).data.publicUrl
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const renderSOPRow = (sop: SOP) => {
    const isUploaded = sop.sop_format === 'uploaded'
    return (
      <div
        key={sop.id}
        className={`group/row flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition ${isUploaded ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => handleViewSOP(sop)}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {isUploaded && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">
              <FileIcon className="w-3 h-3" />
              PDF
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{sop.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Created by {profiles.get(sop.created_by) ?? 'Unknown'} &middot; {formatDate(sop.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {isUploaded && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(sop) }}
              className="opacity-0 group-hover/row:opacity-100 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Delete SOP"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              sop.status === 'published'
                ? 'text-green-700 bg-green-100'
                : 'text-gray-500 bg-gray-100'
            }`}
          >
            {sop.status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>
    )
  }

  const renderSection = (type: 'office' | 'field') => {
    const typeDivisions = divisions.filter((d) => d.type === type)
    const typeSOPs = sops.filter((s) => s.type === type)
    const uncategorized = typeSOPs.filter((s) => !s.division_id)
    const label = type === 'office' ? 'Office SOPs' : 'Field SOPs'
    const emptyMsg = type === 'office' ? 'No office SOPs yet' : 'No field SOPs yet'

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
        </div>

        {typeSOPs.length === 0 && typeDivisions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">{emptyMsg}</p>
          </div>
        ) : (
          <div>
            {typeDivisions.map((division) => {
              const divSOPs = typeSOPs.filter((s) => s.division_id === division.id)
              return (
                <div key={division.id}>
                  <div className="group flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-1">
                      {division.name}
                    </span>
                    <button
                      onClick={() => openEditModal(division)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                      title="Rename division"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDivision(division)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title={
                        sops.filter((s) => s.division_id === division.id).length > 0
                          ? 'Remove SOPs from this division first'
                          : 'Delete division'
                      }
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {divSOPs.length === 0 ? (
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400 italic">No SOPs in this division</p>
                    </div>
                  ) : (
                    divSOPs.map(renderSOPRow)
                  )}
                </div>
              )
            })}

            {uncategorized.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-1">
                    Uncategorized
                  </span>
                </div>
                {uncategorized.map(renderSOPRow)}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-gray-100">
          <button
            onClick={() => openCreateModal(type)}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-md transition"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New Division
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/office" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <FileTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 truncate">SOPs &amp; Forms</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openUploadModal}
            className="inline-flex items-center gap-1.5 border border-amber-500 text-amber-600 hover:bg-amber-50 px-3 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
          >
            <UploadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Upload PDF</span>
          </button>
          <button
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
            onClick={() => {}}
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">New SOP</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 flex-1 min-h-0 w-full space-y-4">
        {renderSection('office')}
        {renderSection('field')}
      </div>

      {modalOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">
                  {editingDivision ? 'Rename Division' : 'New Division'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Division Name
                </label>
                <input
                  type="text"
                  value={divisionName}
                  onChange={(e) => setDivisionName(e.target.value)}
                  placeholder="e.g. Safety, HR, Training"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDivision()
                  }}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  This division will appear under {modalType === 'office' ? 'Office' : 'Field'} SOPs
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                <button
                  onClick={closeModal}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDivision}
                  disabled={!divisionName.trim() || saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingDivision ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {uploadModalOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={closeUploadModal}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">Upload PDF SOP</h3>
                <button onClick={closeUploadModal} className="text-gray-400 hover:text-gray-600 transition">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="SOP title"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Type
                  </label>
                  <select
                    value={uploadType}
                    onChange={(e) => {
                      setUploadType(e.target.value as 'office' | 'field')
                      setUploadDivisionId('')
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="office">Office</option>
                    <option value="field">Field</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Division (optional)
                  </label>
                  <select
                    value={uploadDivisionId}
                    onChange={(e) => setUploadDivisionId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">No division</option>
                    {divisions
                      .filter((d) => d.type === uploadType)
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    PDF File
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      dragActive
                        ? 'border-amber-500 bg-amber-50'
                        : uploadFile
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    {uploadFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileIcon className="w-5 h-5 text-green-600" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{uploadFile.name}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(uploadFile.size)}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setUploadFile(null) }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <UploadIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Drop a PDF here or click to browse</p>
                        <p className="text-xs text-gray-400 mt-1">PDF files only</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                <button
                  onClick={closeUploadModal}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadSOP}
                  disabled={!uploadTitle.trim() || !uploadFile || uploading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {viewingSOP && viewingSOP.pdf_url && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex flex-col bg-black/50">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setViewingSOP(null)}
                  className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 truncate">{viewingSOP.title}</h2>
                  <p className="text-xs text-gray-400">
                    {viewingSOP.type === 'office' ? 'Office' : 'Field'} SOP &middot; Uploaded {formatDate(viewingSOP.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingSOP(null)}
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <iframe
                src={getPdfPublicUrl(viewingSOP.pdf_url)}
                className="w-full h-full"
                style={{ border: 'none' }}
                title={viewingSOP.title}
              />
            </div>
          </div>
        </Portal>
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete SOP"
          message={`This will permanently delete "${deleteConfirm.title}" and its PDF file. This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={() => handleDeleteSOP(deleteConfirm)}
          onCancel={() => deleting ? null : setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
