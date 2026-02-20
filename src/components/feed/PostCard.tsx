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
  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  if (isToday) {
    return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase()
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ initials }: { initials: string }) {
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center mt-0.5">
      <span className="text-xs font-bold text-white tracking-wide">{initials}</span>
    </div>
  )
}

// ── Photo post content ─────────────────────────────────────────────────────────
function PhotoPost({ content }: { content: PhotoContent }) {
  const supabase = createClient()
  const urls = content.photos.map((path) => {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  })

  return (
    <div className="mt-1.5">
      {content.caption && (
        <p className="text-sm text-gray-700 mb-2">{content.caption}</p>
      )}
      {urls.length === 1 ? (
        <a href={urls[0]} target="_blank" rel="noopener noreferrer" className="block max-w-[260px]">
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
            <Image
              src={urls[0]}
              alt="Photo"
              fill
              className="object-cover hover:opacity-90 transition"
              sizes="260px"
            />
          </div>
        </a>
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={url}
                  alt={`Photo ${i + 1}`}
                  fill
                  className="object-cover hover:opacity-90 transition"
                  sizes="72px"
                />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Daily report content card ──────────────────────────────────────────────────
function DailyReportPost({
  content,
  photoUrls,
}: {
  content: DailyReportContent
  photoUrls: string[]
}) {
  const crewFields: { label: string; key: keyof DailyReportContent }[] = [
    { label: 'Reported By', key: 'reported_by' },
    { label: 'Foreman', key: 'project_foreman' },
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
    <div className="mt-1.5 border border-amber-200 rounded-xl overflow-hidden bg-white">
      {/* Card header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-50 border-b border-amber-200">
        <ClipboardListIcon className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-amber-800">Daily Field Report</span>
        {content.date && (
          <span className="text-xs text-amber-600 ml-auto tabular-nums">
            {new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Project / address */}
        {(content.project_name || content.address) && (
          <div className="text-xs space-y-0.5">
            {content.project_name && (
              <p className="font-semibold text-gray-800">{content.project_name}</p>
            )}
            {content.address && <p className="text-gray-500">{content.address}</p>}
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
                  <dd className="text-sm text-gray-700">{content[key] as string}</dd>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Divider */}
        {crewFields.some((f) => content[f.key]) && progressFields.some((f) => content[f.key]) && (
          <div className="border-t border-gray-100" />
        )}

        {/* Progress fields */}
        {progressFields.map(({ label, key }) =>
          content[key] ? (
            <div key={key}>
              <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                {label}
              </dt>
              <dd className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {content[key] as string}
              </dd>
            </div>
          ) : null
        )}

        {/* Photos */}
        {photoUrls.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Photos ({photoUrls.length})
            </p>
            {photoUrls.length === 1 ? (
              <a href={photoUrls[0]} target="_blank" rel="noopener noreferrer" className="block max-w-[200px]">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src={photoUrls[0]}
                    alt="Report photo"
                    fill
                    className="object-cover hover:opacity-90 transition"
                    sizes="200px"
                  />
                </div>
              </a>
            ) : (
              <div className="grid grid-cols-5 gap-1">
                {photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-amber-50">
                      <Image
                        src={url}
                        alt={`Report photo ${i + 1}`}
                        fill
                        className="object-cover hover:opacity-90 transition"
                        sizes="64px"
                      />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main PostCard ──────────────────────────────────────────────────────────────
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

  const supabase = createClient()

  // Resolve photo URLs for daily reports
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
        className={`group relative flex gap-3 px-3 py-2.5 rounded-xl transition-colors ${
          post.is_pinned ? 'bg-amber-50/80' : 'hover:bg-gray-100/60'
        }`}
      >
        {/* Avatar */}
        <Avatar initials={initials} />

        {/* Content column */}
        <div className="flex-1 min-w-0">

          {/* Header: name · timestamp · actions */}
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className="text-sm font-bold text-gray-900 leading-tight truncate flex-shrink-0">
              {authorName}
            </span>
            {post.is_pinned && (
              <PinIcon className="w-3 h-3 text-amber-500 flex-shrink-0" />
            )}
            <span className="text-xs text-gray-400 leading-tight flex-shrink-0">
              {formatDate(post.created_at)}
            </span>

            {/* Action buttons — revealed on hover */}
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {post.post_type === 'daily_report' && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  title="Download PDF"
                  className="p-1.5 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition disabled:opacity-40"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                </button>
              )}
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
                  className="p-1.5 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete post"
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handlePinToggle}
                disabled={pinning}
                title={post.is_pinned ? 'Unpin post' : 'Pin post'}
                className={`p-1.5 rounded-md transition ${
                  post.is_pinned
                    ? 'text-amber-500 hover:bg-amber-50'
                    : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                }`}
              >
                {post.is_pinned ? (
                  <PinOffIcon className="w-3.5 h-3.5" />
                ) : (
                  <PinIcon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* ── Text post ──────────────────────────────────────────────────── */}
          {post.post_type === 'text' &&
            (editingText ? (
              <div className="space-y-2 mt-1">
                <textarea
                  autoFocus
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
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
              <div className="inline-block max-w-full bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                  {(post.content as TextContent).message}
                </p>
              </div>
            ))}

          {/* ── Photo post ─────────────────────────────────────────────────── */}
          {post.post_type === 'photo' && (
            <PhotoPost content={post.content as PhotoContent} />
          )}

          {/* ── Daily report ───────────────────────────────────────────────── */}
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
