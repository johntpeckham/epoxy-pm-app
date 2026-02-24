'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, DownloadIcon, Loader2Icon } from 'lucide-react'
import type { PhotoEntry } from '@/app/(dashboard)/photos/page'

interface PhotosPageClientProps {
  entries: PhotoEntry[]
}

/** Group entries by project, then by date within each project. */
function groupByJobAndDate(entries: PhotoEntry[]) {
  const jobMap = new Map<
    string,
    { projectId: string; projectName: string; dates: Map<string, string[]> }
  >()

  for (const entry of entries) {
    let job = jobMap.get(entry.projectId)
    if (!job) {
      job = { projectId: entry.projectId, projectName: entry.projectName, dates: new Map() }
      jobMap.set(entry.projectId, job)
    }
    const existing = job.dates.get(entry.date) ?? []
    existing.push(...entry.photos)
    job.dates.set(entry.date, existing)
  }

  // Sort jobs alphabetically, dates newest-first
  return Array.from(jobMap.values())
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
    .map((job) => ({
      ...job,
      dates: Array.from(job.dates.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, photos]) => ({ date, photos })),
    }))
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PhotosPageClient({ entries }: PhotosPageClientProps) {
  const supabase = createClient()
  const grouped = useMemo(() => groupByJobAndDate(entries), [entries])

  const totalPhotos = entries.reduce((sum, e) => sum + e.photos.length, 0)

  function getPublicUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} across {grouped.length} job
          {grouped.length !== 1 ? 's' : ''}
        </p>
      </div>

      {totalPhotos === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No photos yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Photos added to project feeds and daily reports will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((job) => (
            <div key={job.projectId}>
              {/* Job heading */}
              <h2 className="text-lg font-bold text-gray-900 mb-3">{job.projectName}</h2>

              <div className="space-y-4">
                {job.dates.map(({ date, photos }) => (
                  <DaySection
                    key={date}
                    jobName={job.projectName}
                    date={date}
                    photos={photos}
                    getPublicUrl={getPublicUrl}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Per-day section with download button ────────────────────────────────────
function DaySection({
  jobName,
  date,
  photos,
  getPublicUrl,
}: {
  jobName: string
  date: string
  photos: string[]
  getPublicUrl: (path: string) => string
}) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      // Download each photo and zip would be ideal, but to keep it simple
      // we'll download them individually in sequence via hidden anchor clicks
      for (const path of photos) {
        const url = getPublicUrl(path)
        const res = await fetch(url)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        // Derive a filename from the storage path
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Day header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-800">{jobName}</span>
          <span className="text-sm text-gray-400">·</span>
          <span className="text-sm text-gray-600">{formatDate(date)}</span>
          <span className="text-xs text-gray-400">
            ({photos.length} photo{photos.length !== 1 ? 's' : ''})
          </span>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition disabled:opacity-50"
        >
          {downloading ? (
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <DownloadIcon className="w-3.5 h-3.5" />
          )}
          Download
        </button>
      </div>

      {/* Photo grid */}
      <div className="p-3 flex flex-wrap gap-1.5">
        {photos.map((path, i) => {
          const url = getPublicUrl(path)
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
              <div className="relative w-[60px] h-[60px] rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={url}
                  alt={`Photo ${i + 1}`}
                  fill
                  className="object-cover hover:opacity-90 transition"
                  sizes="60px"
                />
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
