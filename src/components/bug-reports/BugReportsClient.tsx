'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, Loader2Icon, XIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface BugReport {
  id: string
  user_id: string
  screenshot_url: string | null
  note: string
  page_url: string
  status: string
  created_at: string
  resolved_at: string | null
  reporter_name: string | null
  reporter_avatar: string | null
  reporter_email: string | null
}

type StatusFilter = 'all' | 'open' | 'resolved'

export default function BugReportsClient() {
  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    const supabase = createClient()
    let query = supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    if (userFilter !== 'all') {
      query = query.eq('user_id', userFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch bug reports:', error)
      setLoading(false)
      return
    }

    // Fetch profile data for all unique user_ids
    const userIds = [...new Set((data || []).map((r) => r.user_id))]
    let profileMap: Record<string, { display_name: string | null; avatar_url: string | null; email?: string }> = {}

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }
        }
      }
    }

    const enriched: BugReport[] = (data || []).map((r) => ({
      ...r,
      reporter_name: profileMap[r.user_id]?.display_name || null,
      reporter_avatar: profileMap[r.user_id]?.avatar_url || null,
      reporter_email: null,
    }))

    setReports(enriched)
    setLoading(false)
  }, [statusFilter, userFilter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Get unique reporters for the user filter dropdown
  const uniqueReporters = reports.reduce<{ id: string; name: string }[]>((acc, r) => {
    if (!acc.find((u) => u.id === r.user_id)) {
      acc.push({ id: r.user_id, name: r.reporter_name || r.user_id.slice(0, 8) })
    }
    return acc
  }, [])

  async function handleStatusChange(reportId: string, newStatus: 'open' | 'resolved') {
    setUpdatingId(reportId)
    const supabase = createClient()
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'resolved') {
      updates.resolved_at = new Date().toISOString()
    } else {
      updates.resolved_at = null
    }

    const { error } = await supabase
      .from('bug_reports')
      .update(updates)
      .eq('id', reportId)

    if (!error) {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status: newStatus, resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null }
            : r
        )
      )
    }
    setUpdatingId(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', deleteTarget)

    if (!error) {
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget))
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex-none px-4 md:px-6 border-b border-gray-200 dark:border-gray-800 py-4">
        <Link
          href="/my-work"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          My Work
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Bug Reports</h1>
      </div>

      {/* Filters */}
      <div className="flex-none flex flex-wrap items-center gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800">
        {/* Status filter */}
        <div className="flex items-center rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
          {(['all', 'open', 'resolved'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-amber-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* User filter */}
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          <option value="all">All Users</option>
          {uniqueReporters.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No bug reports yet</p>
          </div>
        ) : (
          reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5"
            >
              {/* Reporter info + status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {report.reporter_avatar ? (
                      <img
                        src={report.reporter_avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-300">
                        {(report.reporter_name || '?').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {report.reporter_name || 'Unknown User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(report.created_at)}
                    </p>
                  </div>
                </div>
                <span
                  className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    report.status === 'open'
                      ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                      : 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                  }`}
                >
                  {report.status === 'open' ? 'Open' : 'Resolved'}
                </span>
              </div>

              {/* Page URL */}
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 font-mono">
                Page: {report.page_url}
              </p>

              {/* Note */}
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 whitespace-pre-wrap">
                {report.note}
              </p>

              {/* Screenshot thumbnail */}
              {report.screenshot_url && (
                <button
                  onClick={() => setLightboxUrl(report.screenshot_url)}
                  className="mb-3 block rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:opacity-90 transition-opacity"
                  style={{ maxWidth: '280px' }}
                >
                  <img
                    src={report.screenshot_url}
                    alt="Bug screenshot"
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '160px' }}
                  />
                </button>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                {report.status === 'open' ? (
                  <button
                    onClick={() => handleStatusChange(report.id, 'resolved')}
                    disabled={updatingId === report.id}
                    className="px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition disabled:opacity-50"
                  >
                    {updatingId === report.id ? 'Updating…' : 'Mark Resolved'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange(report.id, 'open')}
                    disabled={updatingId === report.id}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition disabled:opacity-50"
                  >
                    {updatingId === report.id ? 'Updating…' : 'Reopen'}
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(report.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                >
                  <Trash2Icon className="w-4 h-4 inline mr-1" />
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Screenshot lightbox */}
      {lightboxUrl && (
        <Portal>
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition z-10"
            >
              <XIcon className="w-6 h-6" />
            </button>
            <img
              src={lightboxUrl}
              alt="Bug screenshot full size"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </Portal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Bug Report"
          message="Are you sure you want to delete this bug report? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
          variant="destructive"
        />
      )}
    </div>
  )
}
