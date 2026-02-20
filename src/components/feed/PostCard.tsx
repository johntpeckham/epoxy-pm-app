'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  PinIcon,
  PinOffIcon,
  ClipboardListIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  DownloadIcon,
} from 'lucide-react'
import { FeedPost, TextContent, PhotoContent, DailyReportContent } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditDailyReportModal from './EditDailyReportModal'

interface PostCardProps {
  post: FeedPost
  onPinToggle: () => void
  onDeleted?: () => void
  onUpdated?: () => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase()
}

function PhotoPost({ content }: { content: PhotoContent }) {
  const supabase = createClient()
  const urls = content.photos.map((path) => {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  })

  return (
    <div>
      <div
        className={`grid gap-2 ${
          urls.length === 1
            ? 'grid-cols-1'
            : urls.length === 2
            ? 'grid-cols-2'
            : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {urls.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="(max-width: 640px) 50vw, 300px"
              />
            </div>
          </a>
        ))}
      </div>
      {content.caption && (
        <p className="text-gray-600 text-sm mt-2 italic">{content.caption}</p>
      )}
    </div>
  )
}

function DailyReportPost({
  content,
  photoUrls,
}: {
  content: DailyReportContent
  photoUrls: string[]
}) {
  const crewFields: { label: string; key: keyof DailyReportContent }[] = [
    { label: 'Reported By', key: 'reported_by' },
    { label: 'Project Foreman', key: 'project_foreman' },
    { label: 'Weather', key: 'weather' },
  ]
  const progressFields: { label: string; key: keyof DailyReportContent }[] = [
    { label: 'Progress', key: 'progress' },
    { label: 'Delays', key: 'delays' },
    { label: 'Safety', key: 'safety' },
    { label: 'Materials Used', key: 'materials_used' },
    { label: 'Employees', key: 'employees' },
  ]

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      {/* Report header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-100 border-b border-amber-200">
        <ClipboardListIcon className="w-4 h-4 text-amber-700" />
        <span className="text-sm font-semibold text-amber-800">Daily Field Report</span>
        {content.date && (
          <span className="text-xs text-amber-600 ml-auto">
            {new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Project / address */}
        {(content.project_name || content.address) && (
          <div className="text-xs text-amber-700 space-y-0.5">
            {content.project_name && <p className="font-semibold">{content.project_name}</p>}
            {content.address && <p className="text-amber-600">{content.address}</p>}
          </div>
        )}

        {/* Crew row */}
        {crewFields.some((f) => content[f.key]) && (
          <div className="grid grid-cols-3 gap-3">
            {crewFields.map(({ label, key }) =>
              content[key] ? (
                <div key={key}>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                    {label}
                  </dt>
                  <dd className="text-sm text-gray-700">{content[key]}</dd>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Divider */}
        {crewFields.some((f) => content[f.key]) && progressFields.some((f) => content[f.key]) && (
          <div className="border-t border-amber-200" />
        )}

        {/* Progress fields */}
        {progressFields.map(({ label, key }) =>
          content[key] ? (
            <div key={key}>
              <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                {label}
              </dt>
              <dd className="text-sm text-gray-700 whitespace-pre-wrap">{content[key]}</dd>
            </div>
          ) : null
        )}

        {/* Embedded photos */}
        {photoUrls.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Photos ({photoUrls.length})
            </p>
            <div
              className={`grid gap-2 ${
                photoUrls.length === 1
                  ? 'grid-cols-1'
                  : photoUrls.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-amber-100">
                    <Image
                      src={url}
                      alt={`Report photo ${i + 1}`}
                      fill
                      className="object-cover hover:opacity-90 transition"
                      sizes="(max-width: 640px) 50vw, 250px"
                    />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PostCard({ post, onPinToggle, onDeleted, onUpdated }: PostCardProps) {
  const [pinning, setPinning] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditReport, setShowEditReport] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Inline text editing
  const [editingText, setEditingText] = useState(false)
  const [editText, setEditText] = useState(
    post.post_type === 'text' ? (post.content as TextContent).message : ''
  )
  const [savingText, setSavingText] = useState(false)

  // Resolve photo URLs for daily reports
  const supabase = createClient()
  const reportPhotoUrls: string[] =
    post.post_type === 'daily_report'
      ? ((post.content as DailyReportContent).photos ?? []).map((path) => {
          const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
          return data.publicUrl
        })
      : []

  async function handlePinToggle() {
    setPinning(true)
    await supabase
      .from('feed_posts')
      .update({ is_pinned: !post.is_pinned })
      .eq('id', post.id)
    onPinToggle()
    setPinning(false)
  }

  async function handleDelete() {
    setIsDeleting(true)

    if (post.post_type === 'photo') {
      const photos = (post.content as PhotoContent).photos
      if (photos.length > 0) await supabase.storage.from('post-photos').remove(photos)
    }
    if (post.post_type === 'daily_report') {
      const photos = (post.content as DailyReportContent).photos ?? []
      if (photos.length > 0) await supabase.storage.from('post-photos').remove(photos)
    }

    await supabase.from('feed_posts').delete().eq('id', post.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    onDeleted?.()
  }

  async function handleSaveText() {
    if (!editText.trim()) return
    setSavingText(true)
    await supabase
      .from('feed_posts')
      .update({ content: { message: editText.trim() } })
      .eq('id', post.id)
    setSavingText(false)
    setEditingText(false)
    onUpdated?.()
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateReportPdf } = await import('@/lib/generateReportPdf')
      await generateReportPdf(post.content as DailyReportContent, reportPhotoUrls)
    } finally {
      setPdfLoading(false)
    }
  }

  const authorName = post.author_name || post.author_email?.split('@')[0] || 'User'
  const initials = post.author_email ? getInitials(post.author_email) : 'U'

  return (
    <>
      <div
        className={`bg-white rounded-xl border transition-all group ${
          post.is_pinned ? 'border-amber-300 shadow-sm' : 'border-gray-200'
        }`}
      >
        <div className="p-4">
          {/* Post header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">{initials}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-tight">{authorName}</p>
                <p className="text-xs text-gray-400">{formatDate(post.created_at)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-0.5">
              {/* PDF download — daily reports only */}
              {post.post_type === 'daily_report' && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  title="Download PDF"
                  className="p-1.5 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-40"
                >
                  <DownloadIcon className="w-4 h-4" />
                </button>
              )}

              {/* Edit — text and daily_report */}
              {(post.post_type === 'text' || post.post_type === 'daily_report') && (
                <button
                  onClick={() => {
                    if (post.post_type === 'text') {
                      setEditText((post.content as TextContent).message)
                      setEditingText(true)
                    } else {
                      setShowEditReport(true)
                    }
                  }}
                  title="Edit post"
                  className="p-1.5 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete post"
                className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2Icon className="w-4 h-4" />
              </button>

              {/* Pin toggle */}
              <button
                onClick={handlePinToggle}
                disabled={pinning}
                title={post.is_pinned ? 'Unpin post' : 'Pin post'}
                className={`p-1.5 rounded-md transition ${
                  post.is_pinned
                    ? 'text-amber-500 hover:bg-amber-50'
                    : 'text-gray-300 hover:text-amber-400 hover:bg-gray-50'
                }`}
              >
                {post.is_pinned ? (
                  <PinOffIcon className="w-4 h-4" />
                ) : (
                  <PinIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Post content */}
          {post.post_type === 'text' &&
            (editingText ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingText(false)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition"
                  >
                    <XIcon className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSaveText}
                    disabled={savingText || !editText.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition"
                  >
                    <CheckIcon className="w-3.5 h-3.5" /> {savingText ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                {(post.content as TextContent).message}
              </p>
            ))}
          {post.post_type === 'photo' && (
            <PhotoPost content={post.content as PhotoContent} />
          )}
          {post.post_type === 'daily_report' && (
            <DailyReportPost
              content={post.content as DailyReportContent}
              photoUrls={reportPhotoUrls}
            />
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Post"
          message={
            post.post_type === 'photo'
              ? 'Are you sure you want to delete this post? All photos will be permanently removed.'
              : 'Are you sure you want to delete this post? This cannot be undone.'
          }
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showEditReport && post.post_type === 'daily_report' && (
        <EditDailyReportModal
          postId={post.id}
          initialContent={post.content as DailyReportContent}
          onClose={() => setShowEditReport(false)}
          onUpdated={() => {
            setShowEditReport(false)
            onUpdated?.()
          }}
        />
      )}
    </>
  )
}
