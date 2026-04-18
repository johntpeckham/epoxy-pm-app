'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon } from 'lucide-react'
import type { Notification } from '@/types'

interface NotificationsCardProps {
  userId: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000
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

  function handleGoTo(e: React.MouseEvent, notif: Notification) {
    e.stopPropagation()
    if (!notif.read) markAsRead(notif.id)
    if (notif.link) router.push(notif.link)
  }

  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-gray-700 col-span-2 transition-all">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <BellIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex-1">Notifications</h3>
        {unreadCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{unreadCount} new</span>
        )}
      </div>

      {/* Content */}
      {notifications.length === 0 ? (
        <div className="text-center py-6">
          <BellIcon className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400 dark:text-gray-500">No notifications</p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {notifications.map((n) => {
              const unread = !n.read
              const recent = unread || isRecent(n.created_at)
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
                >
                  {/* Dot indicator */}
                  <div className="flex-shrink-0 mt-1.5">
                    {recent ? (
                      <div className="w-2 h-2 rounded-full" style={{ background: '#EF9F27' }} />
                    ) : (
                      <div className="w-2 h-2 rounded-full border-2 border-gray-400 dark:border-gray-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[13px] font-medium leading-snug truncate ${
                        unread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {n.title}
                      </p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    {n.link && (
                      <button
                        onClick={(e) => handleGoTo(e, n)}
                        className="text-[11px] font-medium mt-1.5 hover:underline"
                        style={{ color: '#EF9F27' }}
                      >
                        {getGoToLabel(n)} &rsaquo;
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* View all link */}
          {totalCount > DISPLAY_LIMIT && (
            <div className="text-center py-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-amber-600 font-medium">
                View all notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
