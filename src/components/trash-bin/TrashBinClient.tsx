'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  Trash2Icon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
  FolderIcon,
  FileTextIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  PackageIcon,
  ReceiptIcon,
  DollarSignIcon,
  UsersIcon,
  AlertCircleIcon,
  CheckIcon,
} from 'lucide-react'
import { Profile } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  TrashBinItem,
  TrashItemType,
  ITEM_TYPE_LABELS,
  restoreFromTrash,
  permanentlyDelete,
  cleanupExpired,
} from '@/lib/trashBin'

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Items' },
  { value: 'project', label: 'Projects' },
  { value: 'feed_post', label: 'Feed Posts' },
  { value: 'calendar_event', label: 'Calendar Events' },
  { value: 'checklist_item', label: 'Checklist Items' },
  { value: 'material_order', label: 'Material Orders' },
  { value: 'document', label: 'Documents' },
  { value: 'contract', label: 'Contracts' },
  { value: 'salesman_expense', label: 'Expenses' },
  { value: 'estimate', label: 'Estimates' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'checklist_template', label: 'Templates' },
  { value: 'customer', label: 'Customers' },
  { value: 'employee', label: 'Employees' },
]

function getItemIcon(type: string) {
  switch (type) {
    case 'project': return <FolderIcon className="w-4 h-4" />
    case 'feed_post': return <FileTextIcon className="w-4 h-4" />
    case 'calendar_event': return <CalendarIcon className="w-4 h-4" />
    case 'checklist_item': return <ClipboardCheckIcon className="w-4 h-4" />
    case 'material_order': return <PackageIcon className="w-4 h-4" />
    case 'document': case 'contract': return <FileTextIcon className="w-4 h-4" />
    case 'salesman_expense': return <ReceiptIcon className="w-4 h-4" />
    case 'estimate': case 'invoice': case 'change_order': return <DollarSignIcon className="w-4 h-4" />
    case 'checklist_template': return <ClipboardCheckIcon className="w-4 h-4" />
    case 'customer': case 'employee': return <UsersIcon className="w-4 h-4" />
    default: return <Trash2Icon className="w-4 h-4" />
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function expiresIn(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Expires today'
  if (days < 30) return `Expires in ${days}d`
  const months = Math.floor(days / 30)
  return `Expires in ${months}mo`
}

interface TrashBinClientProps {
  userId: string
}

export default function TrashBinClient({ userId }: TrashBinClientProps) {
  const [items, setItems] = useState<TrashBinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrashBinItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 4000)
  }
  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(null), 6000)
  }

  const fetchItems = useCallback(async () => {
    const supabase = createClient()
    // Clean up expired items first
    await cleanupExpired(supabase)

    const { data, error } = await supabase
      .from('trash_bin')
      .select('*')
      .order('deleted_at', { ascending: false })
    if (error) console.error('[TrashBin] Fetch failed:', error)
    setItems((data as TrashBinItem[]) ?? [])
    setLoading(false)
  }, [])

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    fetchItems()
    fetchProfiles()
  }, [fetchItems, fetchProfiles])

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])

  const filtered = useMemo(() => {
    let result = items
    if (filter !== 'all') result = result.filter((i) => i.item_type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          (i.related_project && i.related_project.toLowerCase().includes(q)),
      )
    }
    return result
  }, [items, filter, search])

  const handleRestore = async (item: TrashBinItem) => {
    setRestoring(item.id)
    const supabase = createClient()
    const result = await restoreFromTrash(supabase, item)
    if (result.error) {
      showError(result.error)
    } else {
      showSuccess(`"${item.item_name}" has been restored`)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    }
    setRestoring(null)
  }

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    const result = await permanentlyDelete(supabase, deleteTarget.id)
    if (result.error) {
      showError(result.error)
    } else {
      showSuccess(`"${deleteTarget.item_name}" has been permanently deleted`)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  // Count by type for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      counts[item.item_type] = (counts[item.item_type] ?? 0) + 1
    }
    return counts
  }, [items])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/profile" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <Trash2Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Trash Bin</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Trash2Icon className="w-4 h-4" />
          {items.length} item{items.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-xs text-gray-400 mb-6">
          Deleted items are kept for 1 year before being permanently removed.
        </p>

        {/* Success / Error banners */}
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <CheckIcon className="w-4 h-4 flex-shrink-0" />
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
              {errorMessage}
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 p-0.5">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deleted items..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
          >
            {FILTER_OPTIONS.map((opt) => {
              const count = opt.value === 'all' ? items.length : (typeCounts[opt.value] ?? 0)
              return (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({count})
                </option>
              )
            })}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Trash2Icon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">
              {items.length === 0 ? 'Trash is empty' : 'No items match your filter'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {items.length === 0
                ? 'Deleted items will appear here for up to 1 year.'
                : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const deletedByProfile = profileMap.get(item.deleted_by)
              const isRestoring = restoring === item.id
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
                      {getItemIcon(item.item_type)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">{item.item_name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500 rounded">
                          {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                        {item.related_project && (
                          <>
                            <span className="truncate">{item.related_project}</span>
                            <span>&middot;</span>
                          </>
                        )}
                        <span>Deleted {timeAgo(item.deleted_at)}</span>
                        {deletedByProfile && (
                          <>
                            <span>&middot;</span>
                            <span>by {deletedByProfile.display_name ?? 'Unknown'}</span>
                          </>
                        )}
                        <span>&middot;</span>
                        <span className="text-gray-300">{expiresIn(item.expires_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={isRestoring}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition disabled:opacity-50"
                      >
                        {isRestoring ? (
                          <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <RotateCcwIcon className="w-3 h-3" />
                        )}
                        <span className="hidden sm:inline">Restore</span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition"
                      >
                        <Trash2Icon className="w-3 h-3" />
                        <span className="hidden sm:inline">Delete Forever</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Permanently Delete"
          message={`This will permanently delete "${deleteTarget.item_name}". This cannot be undone.`}
          onConfirm={handlePermanentDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
