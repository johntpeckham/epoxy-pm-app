'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CameraIcon, PlusIcon, UploadIcon, XIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Project, FeedPost } from '@/types'
import Image from 'next/image'
import WorkspaceShell from '../WorkspaceShell'
import PhotoLightbox from '@/components/photos/PhotoLightbox'

interface PhotosWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

interface PhotoEntry {
  path: string
  postId: string
  isPublished: boolean
}

export default function PhotosWorkspace({ project, userId, onBack }: PhotosWorkspaceProps) {
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const fetchPhotos = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb
      .from('feed_posts')
      .select('id, content, is_published')
      .eq('project_id', project.id)
      .in('post_type', ['photo', 'daily_report'])
      .order('created_at', { ascending: false })
    if (error) { console.error('[PhotosWorkspace] Fetch failed:', error); setLoading(false); return }

    const entries: PhotoEntry[] = []
    for (const post of data ?? []) {
      const content = post.content as { photos?: string[] }
      const published = (post as { is_published?: boolean }).is_published !== false
      if (content.photos?.length) {
        for (const path of content.photos) {
          entries.push({ path, postId: post.id, isPublished: published })
        }
      }
    }
    setPhotoEntries(entries)
    setLoading(false)
  }, [project.id])

  const togglePhotoPublished = useCallback(async (postId: string, currentVal: boolean) => {
    const newVal = !currentVal
    setPhotoEntries((prev) => prev.map((e) => e.postId === postId ? { ...e, isPublished: newVal } : e))
    const sb = createClient()
    const { error } = await sb.from('feed_posts').update({ is_published: newVal }).eq('id', postId)
    if (error) {
      console.error('[PhotosWorkspace] Publish toggle failed:', error)
      fetchPhotos()
    }
  }, [fetchPhotos])

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

  const photos = photoEntries.map((e) => e.path)
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
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadIcon className="w-4 h-4" />
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
              {photoEntries.map((entry, i) => (
                <div key={`${entry.postId}-${entry.path}`} className="relative group">
                  <button
                    onClick={() => setLightboxIndex(i)}
                    className={`relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-amber-400 transition w-full ${!entry.isPublished ? 'opacity-50' : ''}`}
                  >
                    <Image
                      src={getPhotoUrl(entry.path)}
                      alt={`Photo ${i + 1}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                      sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 16vw"
                    />
                  </button>
                  <button
                    onClick={() => togglePhotoPublished(entry.postId, entry.isPublished)}
                    className={`absolute top-1 right-1 p-1 rounded-full shadow-sm transition opacity-0 group-hover:opacity-100 ${entry.isPublished ? 'bg-white/90 text-amber-500 hover:bg-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}
                    title={entry.isPublished ? 'Published' : 'Hidden from feed'}
                  >
                    {entry.isPublished ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                  </button>
                </div>
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
