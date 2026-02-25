'use client'

import { useState, useEffect } from 'react'
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
  ChevronDownIcon,
  CheckSquareIcon,
  UserIcon,
  CalendarIcon,
  FileTextIcon,
  PrinterIcon,
} from 'lucide-react'
import { FeedPost, TextContent, PhotoContent, DailyReportContent, TaskContent, PdfContent, TaskStatus } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditDailyReportModal from './EditDailyReportModal'
import PdfThumbnail from '@/components/documents/PdfThumbnail'
import { useCompanySettings } from '@/lib/useCompanySettings'

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
function Avatar({ initials, avatarUrl }: { initials: string; avatarUrl?: string }) {
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center mt-0.5 overflow-hidden">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt="Avatar"
          width={36}
          height={36}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-xs font-bold text-white tracking-wide">{initials}</span>
      )}
    </div>
  )
}

// ── Photo post content ─────────────────────────────────────────────────────────
function PhotoPost({ content, onImageClick }: { content: PhotoContent; onImageClick: (url: string) => void }) {
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
      <div className="flex flex-wrap gap-1">
        {urls.map((url, i) => (
          <button key={i} onClick={() => onImageClick(url)} className="block">
            <div className="relative w-[60px] h-[60px] rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="60px"
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Daily report content card ──────────────────────────────────────────────────
function DailyReportPost({
  content,
  photoUrls,
  onImageClick,
}: {
  content: DailyReportContent
  photoUrls: string[]
  onImageClick: (url: string) => void
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
    <div className="p-3.5 space-y-3 border-t border-amber-200">
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
          <div className="flex flex-wrap gap-1">
            {photoUrls.map((url, i) => (
              <button key={i} onClick={() => onImageClick(url)} className="block">
                <div className="relative w-[60px] h-[60px] rounded-lg overflow-hidden bg-amber-50">
                  <Image
                    src={url}
                    alt={`Report photo ${i + 1}`}
                    fill
                    className="object-cover hover:opacity-90 transition"
                    sizes="60px"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Task post content card ──────────────────────────────────────────────────
const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  new_task: { label: 'New Task', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  unable_to_complete: { label: 'Unable to Complete', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
}

const TASK_STATUS_ORDER: TaskStatus[] = ['new_task', 'in_progress', 'completed', 'unable_to_complete']

function TaskPost({
  content,
  postId,
  onUpdated,
  onImageClick,
}: {
  content: TaskContent
  postId: string
  onUpdated?: () => void
  onImageClick: (url: string) => void
}) {
  const supabase = createClient()
  const [status, setStatus] = useState<TaskStatus>(content.status)
  const [updating, setUpdating] = useState(false)
  const [assignedName, setAssignedName] = useState<string | null>(null)

  // Fetch assigned user's display name
  useEffect(() => {
    if (!content.assigned_to) return
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', content.assigned_to)
      .single()
      .then(({ data }) => {
        setAssignedName(data?.display_name || content.assigned_to?.slice(0, 8) || null)
      })
  }, [content.assigned_to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === status || updating) return
    setUpdating(true)

    // Update the task record
    const { error: taskErr } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', content.task_id)
    if (taskErr) {
      console.error('[TaskPost] Failed to update task status:', taskErr)
      setUpdating(false)
      return
    }

    // Update the feed post content to keep it in sync
    await supabase
      .from('feed_posts')
      .update({ content: { ...content, status: newStatus } })
      .eq('id', postId)

    setStatus(newStatus)
    setUpdating(false)
    onUpdated?.()
  }

  const photoUrl = content.photo_url
    ? supabase.storage.from('post-photos').getPublicUrl(content.photo_url).data.publicUrl
    : null

  const dueDateLabel = content.due_date
    ? new Date(content.due_date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <div className="mt-1.5 border border-blue-200 rounded-xl overflow-hidden bg-white">
      <div className="px-3.5 py-3 bg-blue-50 flex items-center gap-2.5">
        <CheckSquareIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-bold text-blue-900">Task</span>
        <span className="text-sm text-gray-400">—</span>
        <span className="text-sm font-medium text-gray-800 truncate">{content.title}</span>
      </div>

      <div className="p-3.5 space-y-3 border-t border-blue-200">
        {/* Description */}
        {content.description && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {content.description}
          </p>
        )}

        {/* Photo thumbnail */}
        {photoUrl && (
          <button onClick={() => onImageClick(photoUrl)} className="block">
            <div className="relative w-[60px] h-[60px] rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={photoUrl}
                alt="Task photo"
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="60px"
              />
            </div>
          </button>
        )}

        {/* Meta row: assigned user + due date */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <UserIcon className="w-3 h-3" />
            {assignedName || (content.assigned_to ? content.assigned_to.slice(0, 8) : 'Unassigned')}
          </span>
          {dueDateLabel && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {dueDateLabel}
            </span>
          )}
        </div>

        {/* Clickable status badges */}
        <div className="flex gap-1.5">
          {TASK_STATUS_ORDER.map((s) => {
            const cfg = TASK_STATUS_CONFIG[s]
            const isActive = s === status
            return (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={updating}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition disabled:opacity-60 ${
                  isActive
                    ? `${cfg.bg} ${cfg.text} ring-1 ring-current`
                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? cfg.dot : 'bg-gray-300'}`} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Collapsible wrapper for daily reports in the feed ──────────────────────
function CollapsibleDailyReport({
  content,
  photoUrls,
  onImageClick,
}: {
  content: DailyReportContent
  photoUrls: string[]
  onImageClick: (url: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const dateLabel = content.date
    ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="mt-1.5 border border-amber-200 rounded-xl overflow-hidden bg-white">
      {/* Compact summary row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 bg-amber-50 text-left hover:bg-amber-100/60 transition-colors"
      >
        <ClipboardListIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-bold text-amber-900 flex-shrink-0">Daily Report</span>
        {dateLabel && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0">—</span>
            <span className="text-sm font-medium text-gray-700 flex-shrink-0 tabular-nums">{dateLabel}</span>
          </>
        )}
        {content.reported_by && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0">·</span>
            <span className="text-sm text-gray-600 truncate">{content.reported_by}</span>
          </>
        )}
        {content.project_foreman && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0">·</span>
            <span className="text-sm text-gray-500 truncate">FM: {content.project_foreman}</span>
          </>
        )}
        <ChevronDownIcon
          className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded detail — hidden by default */}
      {expanded && (
        <DailyReportPost content={content} photoUrls={photoUrls} onImageClick={onImageClick} />
      )}
    </div>
  )
}

// ── PDF post content card ──────────────────────────────────────────────────────
function PdfPost({ content }: { content: PdfContent }) {
  const supabase = createClient()
  const publicUrl = supabase.storage.from('post-photos').getPublicUrl(content.file_url).data.publicUrl
  const [showPreview, setShowPreview] = useState(false)

  function handleDownload() {
    const a = document.createElement('a')
    a.href = publicUrl
    a.download = content.filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handlePrint() {
    window.open(publicUrl, '_blank')
  }

  return (
    <>
      <div className="mt-1.5 border border-red-200 rounded-xl overflow-hidden bg-white">
        <div className="px-3.5 py-3 bg-red-50 flex items-center gap-2.5">
          <FileTextIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm font-bold text-red-900">PDF</span>
          <span className="text-sm text-gray-400">—</span>
          <span className="text-sm font-medium text-gray-800 truncate">{content.filename}</span>
        </div>

        <div className="p-3.5 space-y-3 border-t border-red-200">
          <PdfThumbnail url={publicUrl} onClick={() => setShowPreview(true)} />
          <p className="text-xs text-gray-500 truncate">{content.filename}</p>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition"
            >
              <PrinterIcon className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* PDF preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowPreview(false)} />
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-lg overflow-hidden shadow-xl z-10">
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-3 right-3 bg-white rounded-full p-1.5 shadow-lg text-gray-500 hover:text-gray-800 transition z-20"
            >
              <XIcon className="w-5 h-5" />
            </button>
            <iframe
              src={publicUrl}
              className="w-full h-full"
              title={content.filename}
            />
          </div>
        </div>
      )}
    </>
  )
}

// ── Main PostCard ──────────────────────────────────────────────────────────────
export default function PostCard({ post, onPinToggle, onDeleted, onUpdated }: PostCardProps) {
  const [pinning, setPinning] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditReport, setShowEditReport] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Inline text editing
  const [editingText, setEditingText] = useState(false)
  const [editText, setEditText] = useState(
    post.post_type === 'text' ? (post.content as TextContent).message : ''
  )
  const [savingText, setSavingText] = useState(false)

  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

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
    if (post.post_type === 'pdf') {
      const fileUrl = (post.content as PdfContent).file_url
      if (fileUrl) await supabase.storage.from('post-photos').remove([fileUrl])
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
      await generateReportPdf(post.content as DailyReportContent, reportPhotoUrls, companySettings?.logo_url)
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
        <Avatar initials={initials} avatarUrl={post.author_avatar_url} />

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
            <PhotoPost content={post.content as PhotoContent} onImageClick={setPreviewImage} />
          )}

          {/* ── Daily report ───────────────────────────────────────────────── */}
          {post.post_type === 'daily_report' && (
            <CollapsibleDailyReport
              content={post.content as DailyReportContent}
              photoUrls={reportPhotoUrls}
              onImageClick={setPreviewImage}
            />
          )}

          {/* ── Task ────────────────────────────────────────────────────────── */}
          {post.post_type === 'task' && (
            <TaskPost
              content={post.content as TaskContent}
              postId={post.id}
              onUpdated={onUpdated}
              onImageClick={setPreviewImage}
            />
          )}

          {/* ── PDF ─────────────────────────────────────────────────────────── */}
          {post.post_type === 'pdf' && (
            <PdfPost content={post.content as PdfContent} />
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

      {/* ── Image lightbox overlay ──────────────────────────────────────── */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPreviewImage(null)} />
          <div className="relative max-w-3xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg text-gray-500 hover:text-gray-800 transition z-10"
            >
              <XIcon className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
