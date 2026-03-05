'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon,
  ImageIcon,
  DownloadIcon,
  Loader2Icon,
} from 'lucide-react'
import type { PhotoContent, DailyReportContent } from '@/types'
import Portal from '@/components/ui/Portal'
import PhotoLightbox from './PhotoLightbox'

interface ProjectPhotosModalProps {
  projectId: string
  projectName: string
  onClose: () => void
}

interface DateGroup {
  date: string
  photos: string[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ProjectPhotosModal({
  projectId,
  projectName,
  onClose,
}: ProjectPhotosModalProps) {
  const supabase = createClient()

  const [groups, setGroups] = useState<DateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewPhotos, setPreviewPhotos] = useState<string[] | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  const totalPhotos = groups.reduce((sum, g) => sum + g.photos.length, 0)

  function getPublicUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  function openPreview(urls: string[], index: number) {
    setPreviewPhotos(urls)
    setPreviewIndex(index)
  }

  const fetchPhotos = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: posts, error: fetchErr } = await supabase
        .from('feed_posts')
        .select('post_type, created_at, content')
        .eq('project_id', projectId)
        .in('post_type', ['photo', 'daily_report'])
        .order('created_at', { ascending: false })

      if (fetchErr) throw fetchErr

      // Collect photos grouped by date
      const dateMap = new Map<string, string[]>()

      for (const row of posts ?? []) {
        let photos: string[] = []
        let date: string

        if (row.post_type === 'photo') {
          photos = (row.content as PhotoContent).photos ?? []
          date = row.created_at.slice(0, 10)
        } else {
          const content = row.content as DailyReportContent
          photos = content.photos ?? []
          date = content.date || row.created_at.slice(0, 10)
        }

        if (photos.length === 0) continue

        const existing = dateMap.get(date) ?? []
        existing.push(...photos)
        dateMap.set(date, existing)
      }

      // Sort dates newest-first
      const sorted = Array.from(dateMap.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, photos]) => ({ date, photos }))

      setGroups(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos')
    } finally {
      setLoading(false)
    }
  }, [supabase, projectId])

  // Fetch on mount
  useState(() => {
    fetchPhotos()
  })

  async function handleDownloadAll() {
    setDownloading(true)
    try {
      const allPhotos = groups.flatMap((g) => g.photos)
      for (const path of allPhotos) {
        const url = getPublicUrl(path)
        const res = await fetch(url)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = path.split('/').pop() || `photo-${Date.now()}.jpg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(blobUrl)
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
    <Portal>
    <div className="fixed inset-0 z-[60] overflow-hidden flex flex-col bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <div className="flex items-center gap-2">
            {totalPhotos > 0 && (
              <button
                onClick={handleDownloadAll}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DownloadIcon className="w-3.5 h-3.5" />
                )}
                Download All
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2Icon className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          ) : totalPhotos === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No photos yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Photos added to the feed and daily reports will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(({ date, photos }) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-gray-800">
                      {formatDate(date)}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({photos.length} photo{photos.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {photos.map((path, i) => {
                      const url = getPublicUrl(path)
                      return (
                        <button
                          key={i}
                          onClick={() => openPreview(photos.map(getPublicUrl), i)}
                          className="block"
                        >
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                            <Image
                              src={url}
                              alt={`Photo ${i + 1}`}
                              fill
                              className="object-cover hover:opacity-90 transition"
                              sizes="20vw"
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none flex gap-3 p-4 border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} total
            </span>
            <button
              onClick={onClose}
              className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>

    {previewPhotos && (
      <PhotoLightbox
        photos={previewPhotos}
        currentIndex={previewIndex}
        onClose={() => setPreviewPhotos(null)}
        onNavigate={setPreviewIndex}
      />
    )}
    </>
  )
}
