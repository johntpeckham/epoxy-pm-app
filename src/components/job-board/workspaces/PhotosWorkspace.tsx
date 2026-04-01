'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CameraIcon, PlusIcon, UploadIcon, XIcon } from 'lucide-react'
import { Project, FeedPost } from '@/types'
import Image from 'next/image'
import WorkspaceShell from '../WorkspaceShell'
import PhotoLightbox from '@/components/photos/PhotoLightbox'

interface PhotosWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

export default function PhotosWorkspace({ project, userId, onBack }: PhotosWorkspaceProps) {
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const fetchPhotos = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb
      .from('feed_posts')
      .select('content')
      .eq('project_id', project.id)
      .in('post_type', ['photo', 'daily_report'])
      .order('created_at', { ascending: false })
    if (error) { console.error('[PhotosWorkspace] Fetch failed:', error); setLoading(false); return }

    const allPhotos: string[] = []
    for (const post of data ?? []) {
      const content = post.content as { photos?: string[] }
      if (content.photos?.length) {
        allPhotos.push(...content.photos)
      }
    }
    setPhotos(allPhotos)
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    setLoading(true)
    fetchPhotos()
  }, [fetchPhotos])

  const getPhotoUrl = (path: string) => supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)

    const sb = createClient()
    const paths: string[] = []

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${project.id}/photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await sb.storage.from('post-photos').upload(path, file)
      if (!error) paths.push(path)
    }

    if (paths.length > 0) {
      await sb.from('feed_posts').insert({
        project_id: project.id,
        user_id: userId,
        post_type: 'photo',
        content: { photos: paths, caption: '' },
      })
      fetchPhotos()
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const photoUrls = photos.map(getPhotoUrl)

  return (
    <WorkspaceShell
      title="Photos"
      icon={<CameraIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadIcon className="w-3.5 h-3.5" />
            )}
            Upload
          </button>
        </>
      }
    >
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20">
            <CameraIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No photos for this project yet</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Upload the first photo
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">{photos.length} photo{photos.length === 1 ? '' : 's'}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {photos.map((path, i) => (
                <button
                  key={path}
                  onClick={() => setLightboxIndex(i)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-amber-400 transition group"
                >
                  <Image
                    src={getPhotoUrl(path)}
                    alt={`Photo ${i + 1}`}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 16vw"
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photoUrls}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </WorkspaceShell>
  )
}
