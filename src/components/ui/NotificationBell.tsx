'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { BellIcon, CheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Notification } from '@/types'
import { useRouter } from 'next/navigation'

interface NotificationBellProps {
  userId: string
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
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

  // Track mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
      setOpen(false)
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
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-gray-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Dark backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 9998 }}
          />
          {/* Notification panel */}
          <div style={{
            position: 'fixed',
            top: isMobile ? '10px' : '60px',
            left: isMobile ? '10px' : '250px',
            right: isMobile ? '10px' : 'auto',
            width: isMobile ? 'auto' : '360px',
            maxHeight: '500px',
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '12px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}>
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '18px', color: '#111827' }}>Notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: '22px', height: '22px', padding: '0 6px',
                    borderRadius: '11px', backgroundColor: '#d97706', color: '#ffffff',
                    fontSize: '12px', fontWeight: 700, lineHeight: 1,
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} style={{ fontSize: '13px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
            </div>
            {/* Notification list */}
            <div style={{ overflowY: 'auto', maxHeight: '420px', backgroundColor: '#ffffff' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af', backgroundColor: '#ffffff' }}>
                  No notifications yet
                </div>
              ) : (
                notifications.map(n => {
                  const isHovered = hoveredId === n.id
                  const unread = !n.read
                  let bg: string
                  if (unread) {
                    bg = isHovered ? '#fef3c7' : '#fffbeb'
                  } else {
                    bg = isHovered ? '#f9fafb' : '#ffffff'
                  }
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      onMouseEnter={() => setHoveredId(n.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        display: 'block', width: '100%', padding: '12px 16px', textAlign: 'left' as const,
                        borderTop: 'none', borderRight: 'none', borderBottom: '1px solid #f3f4f6',
                        borderLeft: unread ? '3px solid #d97706' : '3px solid transparent',
                        cursor: 'pointer', backgroundColor: bg,
                        transition: 'background-color 150ms ease',
                      }}
                    >
                      <div style={{ fontWeight: unread ? 700 : 400, fontSize: '14px', color: unread ? '#111827' : '#6b7280' }}>{n.title}</div>
                      <div style={{ fontSize: '13px', color: unread ? '#374151' : '#9ca3af', marginTop: '2px' }}>{n.message}</div>
                      <div style={{ fontSize: '11px', color: unread ? '#9ca3af' : '#d1d5db', marginTop: '4px' }}>{formatTime(n.created_at)}</div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
