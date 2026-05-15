'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreVerticalIcon } from 'lucide-react'

export interface KebabMenuItem {
  label: string
  onSelect: () => void
  icon?: React.ReactNode
  destructive?: boolean
  disabled?: boolean
}

interface KebabMenuProps {
  items: KebabMenuItem[]
  /** Visual variant — `dark` matches the in-PDF sidebar, `light` matches the
   *  white measurement cards. */
  variant?: 'light' | 'dark'
  /** Optional title for the icon button (a11y / tooltip). */
  title?: string
  /** Optional class merged onto the trigger button. */
  buttonClassName?: string
}

export default function KebabMenu({
  items,
  variant = 'light',
  title = 'More actions',
  buttonClassName,
}: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  // Auto-flip: when opening, measure the trigger's distance from the bottom of
  // the viewport and compare it to an estimated menu height. If the menu
  // wouldn't fit below, flip it above. Each item is ~28px tall plus the menu's
  // py-1 wrapper, so estimatedHeight = items.length * 28 + 8. The 16px buffer
  // leaves breathing room before the menu would touch the viewport edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const estimatedHeight = items.length * 28 + 8
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    if (spaceBelow < estimatedHeight + 16 && spaceAbove > spaceBelow) {
      setPlacement('top')
    } else {
      setPlacement('bottom')
    }
  }, [open, items.length])

  const isDark = variant === 'dark'

  const triggerBase = isDark
    ? 'p-1 text-gray-500 hover:text-gray-200 hover:bg-white/5 rounded transition-colors'
    : 'p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors'

  const popoverPositioning =
    placement === 'top' ? 'absolute right-0 bottom-full mb-1' : 'absolute right-0 top-full mt-1'

  const popoverClass = isDark
    ? `${popoverPositioning} z-50 min-w-[160px] rounded-md py-1 px-1 bg-[#1a1a1a] border border-gray-800 shadow-xl`
    : `${popoverPositioning} z-50 min-w-[160px] rounded-md py-1 px-1 bg-white border border-gray-200 shadow-lg`

  const itemBase = isDark
    ? 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'
    : 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'

  const destructiveItem = isDark
    ? 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'
    : 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'

  return (
    <div ref={wrapperRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${triggerBase} ${buttonClassName ?? ''}`}
      >
        <MoreVerticalIcon className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div
            role="menu"
            className={popoverClass}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {items.map((it, idx) => (
              <button
                key={`${idx}-${it.label}`}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  it.onSelect()
                }}
                className={it.destructive ? destructiveItem : itemBase}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
