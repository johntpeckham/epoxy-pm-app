'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  ImageIcon,
  UploadIcon,
  CameraIcon,
  XIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PhotoLightbox from '@/components/photos/PhotoLightbox'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export type PhotosParentType = 'lead' | 'appointment' | 'job_walk' | 'project'

interface PhotosCardProps {
  parentType: PhotosParentType
  parentId: string
  userId: string
}

interface PhotoRow {
  id: string
  image_url: string
  storage_path: string
  caption: string | null
  sort_order: number
  created_by: string | null
  created_at: string
}

interface PendingUpload {
  tempId: string
  previewUrl: string
}

const CONFIG: Record<
  PhotosParentType,
  { table: string; fk: string; bucket: string; emptyText: string }
> = {
  lead: {
    table: 'lead_photos',
    fk: 'lead_id',
    bucket: 'lead-photos',
    emptyText: 'No photos yet. Upload or take photos for this lead.',
  },
  appointment: {
    table: 'appointment_photos',
    fk: 'appointment_id',
    bucket: 'appointment-photos',
    emptyText: 'No photos yet. Upload or take photos for this appointment.',
  },
  job_walk: {
    table: 'job_walk_photos',
    fk: 'job_walk_id',
    bucket: 'job-walk-photos',
    emptyText: 'No photos yet. Upload or take photos from your job walk.',
  },
  project: {
    table: 'project_photos',
    fk: 'project_id',
    bucket: 'project-photos',
    emptyText: 'No photos yet. Upload or take photos for this project.',
  },
}

export default function PhotosCard({ parentType, parentId, userId }: PhotosCardProps) {
  const cfg = CONFIG[parentType]
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PhotoRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const fetchPhotos = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from(cfg.table)
      .select('*')
      .eq(cfg.fk, parentId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[PhotosCard] Fetch failed:', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
    } else if (data) {
      setPhotos(data as PhotoRow[])
    }
    setLoading(false)
  }, [cfg.table, cfg.fk, parentId])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList)
      const supabase = createClient()

      const pendingList: PendingUpload[] = files.map((f) => ({
        tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        previewUrl: URL.createObjectURL(f),
      }))
      setPending((prev) => [...prev, ...pendingList])

      await Promise.all(
        files.map(async (file, idx) => {
          const placeholder = pendingList[idx]
          try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
            const path = `${parentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from(cfg.bucket)
              .upload(path, file, { contentType: file.type || undefined })
            if (uploadErr) throw uploadErr

            const { data: urlData } = supabase.storage.from(cfg.bucket).getPublicUrl(path)
            const publicUrl = urlData.publicUrl

            const { data: inserted, error: insertErr } = await supabase
              .from(cfg.table)
              .insert({
                [cfg.fk]: parentId,
                image_url: publicUrl,
                storage_path: path,
                caption: null,
                sort_order: 0,
                created_by: userId,
              })
              .select('*')
              .single()
            if (insertErr) throw insertErr

            if (inserted) {
              setPhotos((prev) => [...prev, inserted as PhotoRow])
            }
          } catch (err) {
            console.error('[PhotosCard] Upload failed:', err)
          } finally {
            URL.revokeObjectURL(placeholder.previewUrl)
            setPending((prev) => prev.filter((p) => p.tempId !== placeholder.tempId))
          }
        })
      )
    },
    [cfg.bucket, cfg.fk, cfg.table, parentId, userId]
  )

  async function handleDelete(photo: PhotoRow) {
    setDeleting(true)
    const supabase = createClient()
    try {
      await supabase.storage.from(cfg.bucket).remove([photo.storage_path])
      const { error } = await supabase.from(cfg.table).delete().eq('id', photo.id)
      if (error) throw error
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      setConfirmDelete(null)
    } catch (err) {
      console.error('[PhotosCard] Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  function startEditCaption(photo: PhotoRow) {
    setEditingId(photo.id)
    setEditingValue(photo.caption ?? '')
  }

  async function commitCaption(photo: PhotoRow) {
    const next = editingValue.trim()
    const prev = photo.caption ?? ''
    setEditingId(null)
    if (next === prev) return
    const supabase = createClient()
    const newCaption = next || null
    setPhotos((list) =>
      list.map((p) => (p.id === photo.id ? { ...p, caption: newCaption } : p))
    )
    const { error } = await supabase
      .from(cfg.table)
      .update({ caption: newCaption })
      .eq('id', photo.id)
    if (error) {
      console.error('[PhotosCard] Caption update failed:', error)
      setPhotos((list) =>
        list.map((p) => (p.id === photo.id ? { ...p, caption: photo.caption } : p))
      )
    }
  }

  const lightboxUrls = photos.map((p) => p.image_url)
  const photoCount = photos.length

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <ImageIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Photos</h3>
          <span className="text-xs text-gray-500">
            {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
          </span>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-400">
            <Loader2Icon className="w-5 h-5 animate-spin" />
          </div>
        ) : photos.length === 0 && pending.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-gray-200 rounded-lg">
            <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{cfg.emptyText}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {photos.map((photo, idx) => (
              <div key={photo.id} className="space-y-1">
                <div
                  className={`relative rounded-lg overflow-hidden bg-gray-100 group ${
                    parentType === 'project' ? 'h-40' : 'aspect-square'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    aria-label="Open photo"
                  >
                    <Image
                      src={photo.image_url}
                      alt={photo.caption ?? `Photo ${idx + 1}`}
                      fill
                      className="object-cover transition group-hover:opacity-90"
                      sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 180px"
                      unoptimized
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDelete(photo)
                    }}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500 transition opacity-80 group-hover:opacity-100"
                    aria-label="Delete photo"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                {editingId === photo.id ? (
                  <input
                    type="text"
                    value={editingValue}
                    autoFocus
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => commitCaption(photo)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      } else if (e.key === 'Escape') {
                        setEditingId(null)
                      }
                    }}
                    placeholder="Add a label"
                    className="w-full px-1.5 py-0.5 border border-amber-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditCaption(photo)}
                    className="block w-full text-left text-xs text-gray-600 truncate px-1 py-0.5 rounded hover:bg-gray-50 min-h-[20px]"
                  >
                    {photo.caption || (
                      <span className="text-gray-300">Add a label</span>
                    )}
                  </button>
                )}
              </div>
            ))}

            {pending.map((p) => (
              <div key={p.tempId} className="space-y-1">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt="Uploading"
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Loader2Icon className="w-5 h-5 text-white animate-spin" />
                  </div>
                </div>
                <div className="text-xs text-gray-400 px-1 py-0.5">Uploading…</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition"
          >
            <UploadIcon className="w-4 h-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition shadow-sm"
          >
            <CameraIcon className="w-4 h-4" />
            Camera
          </button>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {lightboxIndex !== null && lightboxUrls.length > 0 && (
        <PhotoLightbox
          photos={lightboxUrls}
          currentIndex={Math.min(lightboxIndex, lightboxUrls.length - 1)}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(i) => setLightboxIndex(i)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Photo"
          message="This will permanently remove the photo. This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => (deleting ? null : setConfirmDelete(null))}
        />
      )}
    </>
  )
}
