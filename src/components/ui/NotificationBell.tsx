'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BellIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Notification } from '@/types'
import { useRouter } from 'next/navigation'

interface NotificationBellProps {
  userId: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export default function NotificationBell({ userId, isOpen, onOpenChange }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) {
      setNotifications(data as Notification[])
      setUnreadCount(data.filter((n: Notification) => !n.read).length)
    }
  }, [userId])

  // Initial fetch + polling every 30 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  async function markAsRead(id: string) {
    await supabaseRef.current.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function markAllAsRead() {
    await supabaseRef.current
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markAsRead(n.id)
    if (n.link) {
      onOpenChange(false)
      router.push(n.link)
    }
  }

  function formatTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!isOpen)}
        className={`relative p-1.5 transition-colors rounded-lg ${isOpen ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <BellIcon className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-80 max-sm:right-[-48px] max-sm:w-[calc(100vw-16px)] bg-[#242424] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#3a3a3a]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-200">Notifications</span>
              {unreadCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
                Mark all read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-[#3a3a3a]">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                filter === 'unread'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
              }`}
            >
              Unread
            </button>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto max-h-[360px]">
            {(() => {
              const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications
              if (filtered.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-gray-500">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </div>
                )
              }
              return filtered.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex w-full px-3 py-2.5 gap-2.5 text-left border-b border-[#2e2e2e] transition-colors cursor-pointer ${
                    !n.read
                      ? 'bg-amber-500/10 hover:bg-amber-500/[0.18]'
                      : 'hover:bg-white/10'
                  }`}
                >
                  <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${!n.read ? 'bg-amber-500' : 'bg-[#4a4a4a]'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${!n.read ? 'font-semibold text-gray-200' : 'text-gray-400'}`}>{n.title}</div>
                    <div className={`text-xs mt-0.5 ${!n.read ? 'text-gray-400' : 'text-gray-500'}`}>{n.message}</div>
                    <div className="text-[11px] text-gray-600 mt-1">{formatTime(n.created_at)}</div>
                  </div>
                </button>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
