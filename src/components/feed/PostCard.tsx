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
  MessageCircleIcon,
  ShieldIcon,
  ReceiptIcon,
  ClockIcon,
} from 'lucide-react'
import { FeedPost, TextContent, PhotoContent, DailyReportContent, TaskContent, PdfContent, JsaReportContent, ReceiptContent, TimecardContent, TaskStatus } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EditDailyReportModal from './EditDailyReportModal'
import EditJsaReportModal from './EditJsaReportModal'
import EditReceiptModal from './EditReceiptModal'
import EditTimecardModal from './EditTimecardModal'
import PostCommentsSection from './PostCommentsSection'
import PdfThumbnail from '@/components/documents/PdfThumbnail'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface PostCardProps {
  post: FeedPost
  userId?: string
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
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center overflow-hidden">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt="Avatar"
          width={32}
          height={32}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-bold text-white tracking-wide">{initials}</span>
      )}
    </div>
  )
}

// ── Inline photo post (clean grid, no card wrapper) ─────────────────────────
function InlinePhotoPost({ content, onImageClick }: { content: PhotoContent; onImageClick: (url: string) => void }) {
  const supabase = createClient()
  const urls = content.photos.map((path) => {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  })

  return (
    <div className="mt-1 space-y-1.5">
      {content.caption && (
        <p className="text-sm text-gray-600">{content.caption}</p>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1">
        {urls.map((url, i) => (
          <button key={i} onClick={() => onImageClick(url)} className="block">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="(min-width: 640px) 60px, 25vw"
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
    <div className="p-3.5 space-y-3 border-t border-amber-200 max-w-full overflow-hidden">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
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
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1">
            {photoUrls.map((url, i) => (
              <button key={i} onClick={() => onImageClick(url)} className="block">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-amber-50">
                  <Image
                    src={url}
                    alt={`Report photo ${i + 1}`}
                    fill
                    className="object-cover hover:opacity-90 transition"
                    sizes="(min-width: 640px) 60px, 25vw"
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

function TaskPostDetail({
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
    <div className="p-3.5 space-y-3 border-t border-blue-200 max-w-full overflow-hidden">
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
      <div className="flex flex-wrap gap-1.5">
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
  )
}

// ── Collapsible wrapper for tasks in the feed ───────────────────────────────
function CollapsibleTask({
  content,
  postId,
  onUpdated,
  onImageClick,
  isPinned,
}: {
  content: TaskContent
  postId: string
  onUpdated?: () => void
  onImageClick: (url: string) => void
  isPinned?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const statusCfg = TASK_STATUS_CONFIG[content.status]

  return (
    <div className="mt-1.5 border border-blue-200 rounded-xl overflow-hidden bg-white max-w-full w-full">
      <div
        onClick={isPinned ? undefined : () => setExpanded((v) => !v)}
        role={isPinned ? undefined : 'button'}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-blue-50 text-left transition-colors min-w-0 overflow-hidden ${
          isPinned ? '' : 'hover:bg-blue-100/60 cursor-pointer'
        }`}
      >
        <CheckSquareIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-bold text-blue-900 flex-shrink-0">Task</span>
        <span className="text-sm text-gray-400 flex-shrink-0">—</span>
        <span className="text-sm font-medium text-gray-800 truncate min-w-0">{content.title}</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 hidden sm:inline-flex ${statusCfg.bg} ${statusCfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.label}
        </span>
        {!isPinned && (
          <ChevronDownIcon
            className={`w-4 h-4 text-blue-600 ml-auto flex-shrink-0 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {(isPinned || expanded) && (
        <TaskPostDetail
          content={content}
          postId={postId}
          onUpdated={onUpdated}
          onImageClick={onImageClick}
        />
      )}
    </div>
  )
}

// ── Collapsible wrapper for daily reports in the feed ──────────────────────
function CollapsibleDailyReport({
  content,
  photoUrls,
  onImageClick,
  isPinned,
}: {
  content: DailyReportContent
  photoUrls: string[]
  onImageClick: (url: string) => void
  isPinned?: boolean
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
    <div className="mt-1.5 border border-amber-200 rounded-xl overflow-hidden bg-white max-w-full w-full">
      {/* Compact summary row — always visible */}
      <div
        onClick={isPinned ? undefined : () => setExpanded((v) => !v)}
        role={isPinned ? undefined : 'button'}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-amber-50 text-left transition-colors min-w-0 overflow-hidden ${
          isPinned ? '' : 'hover:bg-amber-100/60 cursor-pointer'
        }`}
      >
        <ClipboardListIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-bold text-amber-900 flex-shrink-0">Daily Report</span>
        {dateLabel && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">—</span>
            <span className="text-sm font-medium text-gray-700 flex-shrink-0 tabular-nums hidden sm:inline">{dateLabel}</span>
          </>
        )}
        {content.reported_by && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">·</span>
            <span className="text-sm text-gray-600 truncate hidden sm:inline">{content.reported_by}</span>
          </>
        )}
        {content.project_foreman && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden md:inline">·</span>
            <span className="text-sm text-gray-500 truncate hidden md:inline">FM: {content.project_foreman}</span>
          </>
        )}
        {!isPinned && (
          <ChevronDownIcon
            className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {/* Expanded detail — hidden by default, always visible when pinned */}
      {(isPinned || expanded) && (
        <DailyReportPost content={content} photoUrls={photoUrls} onImageClick={onImageClick} />
      )}
    </div>
  )
}

// ── JSA Report content card ─────────────────────────────────────────────────
function JsaReportPost({ content }: { content: JsaReportContent }) {
  const personnelFields: { label: string; value: string }[] = [
    { label: 'Prepared By', value: content.preparedBy },
    { label: 'Site Supervisor', value: content.siteSupervisor },
    { label: 'Competent Person', value: content.competentPerson },
  ]

  return (
    <div className="p-3.5 space-y-3 border-t border-amber-200 max-w-full overflow-hidden">
      {(content.projectName || content.address) && (
        <div className="text-xs space-y-0.5">
          {content.projectName && <p className="font-semibold text-gray-800">{content.projectName}</p>}
          {content.address && <p className="text-gray-500">{content.address}</p>}
        </div>
      )}

      {content.weather && (
        <div>
          <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Weather</dt>
          <dd className="text-sm text-gray-700">{content.weather}</dd>
        </div>
      )}

      {personnelFields.some((f) => f.value) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {personnelFields.map(({ label, value }) =>
            value ? (
              <div key={label}>
                <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{label}</dt>
                <dd className="text-sm text-gray-700">{value}</dd>
              </div>
            ) : null
          )}
        </div>
      )}

      {content.tasks && content.tasks.length > 0 && (
        <>
          <div className="border-t border-gray-100" />
          {content.tasks.map((task, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">{task.name}</p>
              {task.hazards && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Hazards</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.hazards}</dd>
                </div>
              )}
              {task.precautions && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Precautions</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.precautions}</dd>
                </div>
              )}
              {task.ppe && (
                <div>
                  <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">PPE Required</dt>
                  <dd className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.ppe}</dd>
                </div>
              )}
              {i < content.tasks.length - 1 && <div className="border-t border-gray-100" />}
            </div>
          ))}
        </>
      )}

      {(() => {
        const filled = (content.signatures ?? []).filter((s) => s.name || s.signature)
        return filled.length > 0 ? (
          <>
            <div className="border-t border-gray-100" />
            <div>
              <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Employee Signatures</dt>
              <div className="space-y-3">
                {filled.map((sig, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {sig.signature && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sig.signature} alt={`Signature of ${sig.name}`} className="h-12 border border-gray-200 rounded bg-white" />
                    )}
                    {sig.name && <span className="text-sm text-gray-700 font-medium">{sig.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null
      })()}
    </div>
  )
}

// ── Collapsible wrapper for JSA reports in the feed ──────────────────────────
function CollapsibleJsaReport({
  content,
  isPinned,
}: {
  content: JsaReportContent
  isPinned?: boolean
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
    <div className="mt-1.5 border border-amber-200 rounded-xl overflow-hidden bg-white max-w-full w-full">
      <div
        onClick={isPinned ? undefined : () => setExpanded((v) => !v)}
        role={isPinned ? undefined : 'button'}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-amber-50 text-left transition-colors min-w-0 overflow-hidden ${
          isPinned ? '' : 'hover:bg-amber-100/60 cursor-pointer'
        }`}
      >
        <ShieldIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-bold text-amber-900 flex-shrink-0">JSA Report</span>
        {dateLabel && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">—</span>
            <span className="text-sm font-medium text-gray-700 flex-shrink-0 tabular-nums hidden sm:inline">{dateLabel}</span>
          </>
        )}
        {content.preparedBy && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">·</span>
            <span className="text-sm text-gray-600 truncate hidden sm:inline">{content.preparedBy}</span>
          </>
        )}
        {!isPinned && (
          <ChevronDownIcon
            className={`w-4 h-4 text-amber-600 ml-auto flex-shrink-0 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {(isPinned || expanded) && <JsaReportPost content={content} />}
    </div>
  )
}

// ── Receipt content card ──────────────────────────────────────────────────
function ReceiptPost({
  content,
  onImageClick,
}: {
  content: ReceiptContent
  onImageClick: (url: string) => void
}) {
  const supabase = createClient()
  const photoUrl = content.receipt_photo
    ? supabase.storage.from('post-photos').getPublicUrl(content.receipt_photo).data.publicUrl
    : null

  const dateLabel = content.receipt_date
    ? new Date(content.receipt_date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="p-3.5 space-y-3 border-t border-green-200 max-w-full overflow-hidden">
      <div className="flex gap-3">
        {photoUrl && (
          <button onClick={() => onImageClick(photoUrl)} className="block flex-shrink-0">
            <div className="relative w-[72px] h-[72px] rounded-lg overflow-hidden bg-green-50">
              <Image
                src={photoUrl}
                alt="Receipt photo"
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="72px"
              />
            </div>
          </button>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          {content.vendor_name ? (
            <div>
              <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Vendor</dt>
              <dd className="text-sm text-gray-700 font-medium">{content.vendor_name}</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {dateLabel && (
              <div>
                <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Date</dt>
                <dd className="text-sm text-gray-700 tabular-nums">{dateLabel}</dd>
              </div>
            )}
            {content.total_amount ? (
              <div>
                <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Total</dt>
                <dd className="text-sm text-gray-900 font-bold tabular-nums">${content.total_amount.toFixed(2)}</dd>
              </div>
            ) : null}
            {content.category ? (
              <div>
                <dt className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">Category</dt>
                <dd className="text-sm text-gray-700">{content.category}</dd>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Collapsible wrapper for receipts in the feed ──────────────────────────
function CollapsibleReceipt({
  content,
  onImageClick,
  isPinned,
}: {
  content: ReceiptContent
  onImageClick: (url: string) => void
  isPinned?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-1.5 border border-green-200 rounded-xl overflow-hidden bg-white max-w-full w-full">
      <div
        onClick={isPinned ? undefined : () => setExpanded((v) => !v)}
        role={isPinned ? undefined : 'button'}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-green-50 text-left transition-colors min-w-0 overflow-hidden ${
          isPinned ? '' : 'hover:bg-green-100/60 cursor-pointer'
        }`}
      >
        <ReceiptIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span className="text-sm font-bold text-green-900 flex-shrink-0">Expense</span>
        {content.vendor_name ? (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0">—</span>
            <span className="text-sm font-medium text-gray-800 truncate min-w-0">{content.vendor_name}</span>
          </>
        ) : null}
        {content.total_amount ? (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">—</span>
            <span className="text-sm font-bold text-gray-800 flex-shrink-0 tabular-nums hidden sm:inline">${content.total_amount.toFixed(2)}</span>
          </>
        ) : null}
        {!isPinned && (
          <ChevronDownIcon
            className={`w-4 h-4 text-green-600 ml-auto flex-shrink-0 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {(isPinned || expanded) && (
        <ReceiptPost content={content} onImageClick={onImageClick} />
      )}
    </div>
  )
}

// ── Timecard content card ──────────────────────────────────────────────────
function TimecardPost({ content }: { content: TimecardContent }) {
  const dateLabel = content.date
    ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="p-3.5 space-y-3 border-t border-blue-200 max-w-full overflow-hidden">
      {(content.project_name || content.address) && (
        <div className="text-xs space-y-0.5">
          {content.project_name && <p className="font-semibold text-gray-800">{content.project_name}</p>}
          {content.address && <p className="text-gray-500">{content.address}</p>}
          {dateLabel && <p className="text-gray-500">{dateLabel}</p>}
        </div>
      )}

      {content.entries && content.entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200">
                <th className="text-left py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Employee</th>
                <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">In</th>
                <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Out</th>
                <th className="text-center py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Lunch</th>
                <th className="text-right py-1.5 px-2 font-semibold text-blue-700 uppercase tracking-wide">Hours</th>
              </tr>
            </thead>
            <tbody>
              {content.entries.map((entry, i) => (
                <tr key={i} className={i < content.entries.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="py-1.5 px-2 text-gray-900 font-medium">{entry.employee_name}</td>
                  <td className="py-1.5 px-2 text-gray-700 text-center tabular-nums">{entry.time_in}</td>
                  <td className="py-1.5 px-2 text-gray-700 text-center tabular-nums">{entry.time_out}</td>
                  <td className="py-1.5 px-2 text-gray-700 text-center tabular-nums">{entry.lunch_minutes}m</td>
                  <td className="py-1.5 px-2 text-gray-900 text-right font-bold tabular-nums">{entry.total_hours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-blue-200">
                <td colSpan={4} className="py-2 px-2 text-sm font-semibold text-blue-800">Grand Total</td>
                <td className="py-2 px-2 text-sm font-bold text-blue-900 text-right tabular-nums">{content.grand_total_hours.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Collapsible wrapper for timecards in the feed ──────────────────────────
function CollapsibleTimecard({
  content,
  isPinned,
}: {
  content: TimecardContent
  isPinned?: boolean
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
    <div className="mt-1.5 border border-blue-200 rounded-xl overflow-hidden bg-white max-w-full w-full">
      <div
        onClick={isPinned ? undefined : () => setExpanded((v) => !v)}
        role={isPinned ? undefined : 'button'}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-blue-50 text-left transition-colors min-w-0 overflow-hidden ${
          isPinned ? '' : 'hover:bg-blue-100/60 cursor-pointer'
        }`}
      >
        <ClockIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-bold text-blue-900 flex-shrink-0">Timecard</span>
        {dateLabel && (
          <>
            <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">—</span>
            <span className="text-sm font-medium text-gray-700 flex-shrink-0 tabular-nums hidden sm:inline">{dateLabel}</span>
          </>
        )}
        <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">·</span>
        <span className="text-sm text-gray-600 flex-shrink-0 hidden sm:inline">
          {content.entries.length} employee{content.entries.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-gray-400 flex-shrink-0 hidden sm:inline">·</span>
        <span className="text-sm font-bold text-blue-800 flex-shrink-0 tabular-nums hidden sm:inline">
          {content.grand_total_hours.toFixed(1)} hrs
        </span>
        {!isPinned && (
          <ChevronDownIcon
            className={`w-4 h-4 text-blue-600 ml-auto flex-shrink-0 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {(isPinned || expanded) && <TimecardPost content={content} />}
    </div>
  )
}

// ── Inline PDF post (thumbnail + metadata, no card wrapper) ─────────────────
function InlinePdfPost({ content }: { content: PdfContent }) {
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
      <div className="mt-1 space-y-1.5">
        {/* PDF first-page thumbnail */}
        <PdfThumbnail url={publicUrl} onClick={() => {
          if (window.innerWidth < 768) { window.open(publicUrl, '_blank'); return }
          setShowPreview(true)
        }} width={150} />
        {/* Filename + caption */}
        <p className="text-xs text-gray-500 truncate">{content.filename}</p>
        {content.caption && (
          <p className="text-xs text-gray-400">{content.caption}</p>
        )}
        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-amber-700 hover:bg-gray-100 transition"
          >
            <DownloadIcon className="w-3 h-3" />
            Download
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-500 hover:text-amber-700 hover:bg-gray-100 transition"
          >
            <PrinterIcon className="w-3 h-3" />
            Print
          </button>
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
export default function PostCard({ post, userId, onPinToggle, onDeleted, onUpdated }: PostCardProps) {
  const [pinning, setPinning] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEditReport, setShowEditReport] = useState(false)
  const [showEditJsaReport, setShowEditJsaReport] = useState(false)
  const [showEditReceipt, setShowEditReceipt] = useState(false)
  const [showEditTimecard, setShowEditTimecard] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState<number>(0)

  // Inline text editing
  const [editingText, setEditingText] = useState(false)
  const [editText, setEditText] = useState(
    post.post_type === 'text' ? (post.content as TextContent).message : ''
  )
  const [savingText, setSavingText] = useState(false)

  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

  // Fetch comment count
  useEffect(() => {
    let mounted = true
    supabase
      .from('post_comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .then(({ count }) => {
        if (mounted && count !== null) setCommentCount(count)
      })

    // Subscribe to comment changes to keep count in sync
    const channel = supabase
      .channel(`comment-count-${post.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` },
        () => {
          supabase
            .from('post_comments')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', post.id)
            .then(({ count }) => {
              if (mounted && count !== null) setCommentCount(count)
            })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [post.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (post.post_type === 'receipt') {
      const receiptPhoto = (post.content as ReceiptContent).receipt_photo
      if (receiptPhoto) await supabase.storage.from('post-photos').remove([receiptPhoto])
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

  // Resolve receipt photo URL
  const receiptPhotoUrl: string | null =
    post.post_type === 'receipt' && (post.content as ReceiptContent).receipt_photo
      ? supabase.storage.from('post-photos').getPublicUrl((post.content as ReceiptContent).receipt_photo).data.publicUrl
      : null

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      if (post.post_type === 'jsa_report') {
        const { generateJsaPdf } = await import('@/lib/generateJsaPdf')
        await generateJsaPdf(post.content as JsaReportContent, companySettings?.logo_url)
      } else if (post.post_type === 'receipt') {
        const { generateReceiptPdf } = await import('@/lib/generateReceiptPdf')
        await generateReceiptPdf(post.content as ReceiptContent, receiptPhotoUrl, companySettings?.logo_url)
      } else if (post.post_type === 'timecard') {
        const { generateTimecardPdf } = await import('@/lib/generateTimecardPdf')
        await generateTimecardPdf(post.content as TimecardContent, companySettings?.logo_url)
      } else {
        const { generateReportPdf } = await import('@/lib/generateReportPdf')
        await generateReportPdf(post.content as DailyReportContent, reportPhotoUrls, companySettings?.logo_url)
      }
    } finally {
      setPdfLoading(false)
    }
  }

  const authorName = post.author_name || post.author_email?.split('@')[0] || 'User'
  const initials = post.author_email ? getInitials(post.author_email) : 'U'
  const isText = post.post_type === 'text'

  // ── Action buttons (shared) ──────────────────────────────────────────────
  const actionButtons = (
    <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex-shrink-0">
      {(post.post_type === 'daily_report' || post.post_type === 'jsa_report' || post.post_type === 'receipt' || post.post_type === 'timecard') && (
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          title="Download PDF"
          className="p-1 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition disabled:opacity-40"
        >
          <DownloadIcon className="w-3.5 h-3.5" />
        </button>
      )}
      {(post.post_type === 'text' || post.post_type === 'daily_report' || post.post_type === 'jsa_report' || post.post_type === 'receipt' || post.post_type === 'timecard') && (
        <button
          onClick={() => {
            if (post.post_type === 'text') {
              setEditText((post.content as TextContent).message)
              setEditingText(true)
            } else if (post.post_type === 'jsa_report') {
              setShowEditJsaReport(true)
            } else if (post.post_type === 'receipt') {
              setShowEditReceipt(true)
            } else if (post.post_type === 'timecard') {
              setShowEditTimecard(true)
            } else {
              setShowEditReport(true)
            }
          }}
          title="Edit post"
          className="p-1 rounded-md text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition"
        >
          <PencilIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={() => setShowDeleteConfirm(true)}
        title="Delete post"
        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handlePinToggle}
        disabled={pinning}
        title={post.is_pinned ? 'Unpin post' : 'Pin post'}
        className={`p-1 rounded-md transition ${
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
  )

  // ── Structured card content (non-text posts) ────────────────────────────
  const structuredContent = (
    <>
      {post.post_type === 'photo' && (
        <InlinePhotoPost content={post.content as PhotoContent} onImageClick={setPreviewImage} />
      )}
      {post.post_type === 'daily_report' && (
        <CollapsibleDailyReport
          content={post.content as DailyReportContent}
          photoUrls={reportPhotoUrls}
          onImageClick={setPreviewImage}
          isPinned={post.is_pinned}
        />
      )}
      {post.post_type === 'task' && (
        <CollapsibleTask
          content={post.content as TaskContent}
          postId={post.id}
          onUpdated={onUpdated}
          onImageClick={setPreviewImage}
          isPinned={post.is_pinned}
        />
      )}
      {post.post_type === 'jsa_report' && (
        <CollapsibleJsaReport
          content={post.content as JsaReportContent}
          isPinned={post.is_pinned}
        />
      )}
      {post.post_type === 'receipt' && (
        <CollapsibleReceipt
          content={post.content as ReceiptContent}
          onImageClick={setPreviewImage}
          isPinned={post.is_pinned}
        />
      )}
      {post.post_type === 'timecard' && (
        <CollapsibleTimecard
          content={post.content as TimecardContent}
          isPinned={post.is_pinned}
        />
      )}
      {post.post_type === 'pdf' && (
        <InlinePdfPost content={post.content as PdfContent} />
      )}
    </>
  )

  return (
    <>
      <div className="group relative flex px-4 py-1 justify-start max-w-full overflow-hidden">
        {/* Row: avatar + bubble */}
        <div className={`flex gap-2 items-start min-w-0 ${isText ? 'max-w-[80%]' : 'max-w-full sm:max-w-[75%]'}`}>
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar initials={initials} avatarUrl={post.author_avatar_url} />
          </div>

          {/* Content column */}
          <div className="min-w-0 items-start flex flex-col">
            {/* Name */}
            <span className="text-[11px] font-semibold text-gray-500 mb-0.5 ml-1">
              {authorName}
            </span>

            {/* Hover action buttons */}
            <div className="flex items-center gap-1">
              {/* Bubble / card content */}
              <div className="min-w-0">
                {isText ? (
                  editingText ? (
                    <div className="space-y-2">
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
                    <div className="inline-block px-3.5 py-2 bg-gray-200 text-gray-900 rounded-2xl rounded-bl-sm">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {(post.content as TextContent).message}
                      </p>
                    </div>
                  )
                ) : (
                  structuredContent
                )}
              </div>

              {/* Actions float beside the bubble */}
              {actionButtons}
            </div>

            {/* Timestamp · Comment — single subtle line */}
            <div className="ml-1 mt-0.5">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                {post.is_pinned && <PinIcon className="w-2.5 h-2.5 text-amber-500" />}
                <span>{formatDate(post.created_at)}</span>
                <span>·</span>
                <button
                  onClick={() => setShowComments((v) => !v)}
                  className="hover:text-amber-600 transition"
                >
                  {commentCount > 0
                    ? `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`
                    : 'Comment'}
                </button>
              </div>
              {showComments && userId && (
                <PostCommentsSection postId={post.id} userId={userId} />
              )}
            </div>
          </div>
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

      {showEditJsaReport && post.post_type === 'jsa_report' && (
        <EditJsaReportModal
          postId={post.id}
          initialContent={post.content as JsaReportContent}
          onClose={() => setShowEditJsaReport(false)}
          onUpdated={() => {
            setShowEditJsaReport(false)
            onUpdated?.()
          }}
        />
      )}

      {showEditReceipt && post.post_type === 'receipt' && (
        <EditReceiptModal
          postId={post.id}
          initialContent={post.content as ReceiptContent}
          onClose={() => setShowEditReceipt(false)}
          onUpdated={() => {
            setShowEditReceipt(false)
            onUpdated?.()
          }}
        />
      )}

      {showEditTimecard && post.post_type === 'timecard' && (
        <EditTimecardModal
          postId={post.id}
          initialContent={post.content as TimecardContent}
          onClose={() => setShowEditTimecard(false)}
          onUpdated={() => {
            setShowEditTimecard(false)
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
