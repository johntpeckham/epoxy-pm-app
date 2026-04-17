'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import type { Notification } from '@/types'

interface NotificationsCardProps {
  userId: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`
}

function getGoToLabel(n: Notification): string {
  if (!n.link) return 'Go to app'
  if (n.link.startsWith('/my-work')) return 'Go to Daily Playbook'
  if (n.link.startsWith('/tasks')) return 'Go to Tasks'
  if (n.link.startsWith('/crm')) return 'Go to CRM'
  if (n.link.startsWith('/job-board')) return 'Go to Job Board'
  if (n.link.startsWith('/feed')) return 'Go to Feed'
  return 'Go to page'
}

const DISPLAY_LIMIT = 10

export default function NotificationsCard({ userId }: NotificationsCardProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())
  const router = useRouter()

  const fetchNotifications = useCallback(async () => {
    const { data, count } = await supabaseRef.current
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(DISPLAY_LIMIT)

    if (data) {
      setNotifications(data as Notification[])
      setUnreadCount(data.filter((n: Notification) => !n.read).length)
      setTotalCount(count ?? data.length)
    }
  }, [userId])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  async function markAsRead(id: string) {
    await supabaseRef.current
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  function handleNotificationClick(notif: Notification) {
    if (!notif.read) markAsRead(notif.id)
    if (notif.link) {
      router.push(notif.link)
    }
  }

  function handleExpandToggle(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function handleGoTo(e: React.MouseEvent, notif: Notification) {
    e.stopPropagation()
    if (!notif.read) markAsRead(notif.id)
    if (notif.link) router.push(notif.link)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <BellIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">
          Notifications{unreadCount > 0 && (
            <span className="ml-1.5 text-amber-600">({unreadCount})</span>
          )}
        </h3>
      </div>

      {/* Content */}
      {notifications.length === 0 ? (
        <div className="text-center py-6">
          <BellIcon className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400">No notifications</p>
        </div>
      ) : (
        <div className="space-y-0 max-h-[400px] overflow-y-auto -mx-4 px-4">
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
            {notifications.map((n) => {
              const isExpanded = expandedId === n.id
              const unread = !n.read
              return (
                <div key={n.id}>
                  <div
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                      unread
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="flex-shrink-0 pt-1.5">
                      {unread ? (
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                      ) : (
                        <div className="w-2 h-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[13px] leading-snug ${
                          unread
                            ? 'font-medium text-gray-900'
                            : 'text-gray-500'
                        }`}
                      >
                        {n.title}
                      </p>
                      <p
                        className={`text-[13px] leading-snug mt-0.5 ${
                          unread ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {n.message}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {formatTimeAgo(n.created_at)}
                      </p>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-100">
                          <p className="text-[13px] text-gray-600 leading-relaxed">
                            {n.message}
                          </p>
                          {n.type === 'assigned_tasks_uncompleted' && (
                            <p className="text-[12px] text-gray-500 mt-1">
                              Check your Daily Playbook to review and complete
                              your outstanding tasks.
                            </p>
                          )}
                          {n.type === 'task_assigned' && (
                            <p className="text-[12px] text-gray-500 mt-1">
                              A new task has been assigned to you. View it in
                              your task list.
                            </p>
                          )}
                          {n.link && (
                            <button
                              onClick={(e) => handleGoTo(e, n)}
                              className="text-[12px] text-amber-600 hover:text-amber-700 font-medium mt-1.5 hover:underline"
                            >
                              {getGoToLabel(n)} &rarr;
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-start gap-1.5 pt-0.5">
                      {n.link && (
                        <button
                          onClick={(e) => handleGoTo(e, n)}
                          className="text-[11px] text-amber-600 hover:text-amber-700 font-medium whitespace-nowrap hover:underline"
                        >
                          {getGoToLabel(n)}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleExpandToggle(e, n.id)}
                        className="p-0.5 text-gray-400 hover:text-amber-500 rounded transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <ChevronUpIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* View all link */}
          {totalCount > DISPLAY_LIMIT && (
            <div className="text-center py-2 mt-1">
              <span className="text-[12px] text-amber-600 font-medium">
                View all notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
