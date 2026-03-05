'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { ImageIcon, DownloadIcon, Loader2Icon, SearchIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import type { PhotoEntry } from '@/app/(dashboard)/photos/page'
import { Project } from '@/types'
import NewPhotoModal from './NewPhotoModal'
import PhotoLightbox from './PhotoLightbox'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'

interface PhotosPageClientProps {
  entries: PhotoEntry[]
  projects: Project[]
  allProjects: Project[]
  userId: string
}

type SortOption = 'newest' | 'oldest' | 'project_az'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'project_az', label: 'Project Name (A-Z)' },
]

/** Group entries by project, then by date within each project. */
function groupByJobAndDate(entries: PhotoEntry[], sort: SortOption) {
  const jobMap = new Map<
    string,
    { projectId: string; projectName: string; dates: Map<string, string[]>; latestDate: string; oldestDate: string }
  >()

  for (const entry of entries) {
    let job = jobMap.get(entry.projectId)
    if (!job) {
      job = { projectId: entry.projectId, projectName: entry.projectName, dates: new Map(), latestDate: entry.date, oldestDate: entry.date }
      jobMap.set(entry.projectId, job)
    }
    if (entry.date > job.latestDate) job.latestDate = entry.date
    if (entry.date < job.oldestDate) job.oldestDate = entry.date
    const existing = job.dates.get(entry.date) ?? []
    existing.push(...entry.photos)
    job.dates.set(entry.date, existing)
  }

  const dateDir = sort === 'oldest' ? 1 : -1

  return Array.from(jobMap.values())
    .sort((a, b) => {
      if (sort === 'project_az') return a.projectName.localeCompare(b.projectName)
      if (sort === 'newest') return b.latestDate.localeCompare(a.latestDate)
      return a.oldestDate.localeCompare(b.oldestDate)
    })
    .map((job) => ({
      ...job,
      dates: Array.from(job.dates.entries())
        .sort(([a], [b]) => a.localeCompare(b) * dateDir)
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

export default function PhotosPageClient({ entries, projects, allProjects, userId }: PhotosPageClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const [showModal, setShowModal] = useState(false)
  const [previewPhotos, setPreviewPhotos] = useState<string[] | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [showCompleted, setShowCompleted] = useState(false)

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allProjects) map.set(p.id, p.status)
    return map
  }, [allProjects])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter((e) => e.projectName.toLowerCase().includes(q))
  }, [entries, searchQuery])

  const grouped = useMemo(() => groupByJobAndDate(filtered, sortOption), [filtered, sortOption])

  const inProgressGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) !== 'Complete'),
    [grouped, projectStatusMap]
  )
  const completedGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) === 'Complete'),
    [grouped, projectStatusMap]
  )

  const totalPhotos = filtered.reduce((sum, e) => sum + e.photos.length, 0)

  function getPublicUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  function openPreview(urls: string[], index: number) {
    setPreviewPhotos(urls)
    setPreviewIndex(index)
  }

  function handleCreated() {
    setShowModal(false)
    router.refresh()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} across {grouped.length} job
            {grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canCreate('photos') && (
          <button
            onClick={() => setShowModal(true)}
            disabled={projects.length === 0}
            title={projects.length === 0 ? 'Create a project first' : undefined}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New Photo
          </button>
        )}
      </div>

      {/* Search & Sort Controls */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by project name..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {totalPhotos === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">
            {searchQuery.trim() ? 'No photos match your search' : 'No photos yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery.trim()
              ? 'Try a different search term.'
              : 'Photos added to project feeds and daily reports will appear here.'}
          </p>
        </div>
      ) : (
        <div>
          {/* In Progress section */}
          {inProgressGroups.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">In Progress</p>
              <div className="space-y-8">
                {inProgressGroups.map((job) => (
                  <div key={job.projectId}>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{job.projectName}</h2>
                    <div className="space-y-4">
                      {job.dates.map(({ date, photos }) => (
                        <DaySection
                          key={date}
                          jobName={job.projectName}
                          date={date}
                          photos={photos}
                          getPublicUrl={getPublicUrl}
                          onPhotoClick={openPreview}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Completed section — collapsible */}
          {completedGroups.length > 0 && (
            <div className={inProgressGroups.length > 0 ? 'border-t border-gray-200 mt-8 pt-4' : ''}>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 w-full text-left mb-4"
              >
                <ChevronRightIcon
                  className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                <span className="text-xs text-gray-400">({completedGroups.length})</span>
              </button>
              {showCompleted && (
                <div className="space-y-8">
                  {completedGroups.map((job) => (
                    <div key={job.projectId}>
                      <h2 className="text-lg font-bold text-gray-900 mb-3">{job.projectName}</h2>
                      <div className="space-y-4">
                        {job.dates.map(({ date, photos }) => (
                          <DaySection
                            key={date}
                            jobName={job.projectName}
                            date={date}
                            photos={photos}
                            getPublicUrl={getPublicUrl}
                            onPhotoClick={openPreview}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <NewPhotoModal
          projects={projects}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {previewPhotos && (
        <PhotoLightbox
          photos={previewPhotos}
          currentIndex={previewIndex}
          onClose={() => setPreviewPhotos(null)}
          onNavigate={setPreviewIndex}
        />
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
  onPhotoClick,
}: {
  jobName: string
  date: string
  photos: string[]
  getPublicUrl: (path: string) => string
  onPhotoClick: (urls: string[], index: number) => void
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
      <div className="p-3 grid [grid-template-columns:repeat(5,29vw)] md:[grid-template-columns:repeat(5,minmax(120px,1fr))] gap-1.5 overflow-x-auto md:overflow-visible">
        {photos.map((path, i) => {
          const url = getPublicUrl(path)
          return (
            <button key={i} onClick={() => onPhotoClick(photos.map(getPublicUrl), i)} className="block">
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
  )
}
