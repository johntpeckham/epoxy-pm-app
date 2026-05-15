'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // Pixel coordinates for the portaled menu, anchored to the trigger's right
  // edge and either pinned from `top` (menu opens downward) or pinned from
  // `bottom` (menu opens upward). Only one of top/bottom is set.
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // The component renders on the server during initial pass-through; portals
  // can only be opened to document.body once we're in the browser.
  useEffect(() => {
    setMounted(true)
  }, [])

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

  // Close on scroll/resize while open — the portaled menu uses fixed pixel
  // coordinates relative to the trigger's bounding rect, so any layout change
  // would leave it stranded. Easier to close than to re-measure continuously.
  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // Auto-flip + coordinate computation. Measure the trigger's distance from
  // the viewport edges and decide whether to render above or below. Coords
  // anchor the menu to the trigger's right edge (matching the prior
  // right-aligned behavior) and either rect.bottom (downward) or rect.top
  // (upward). Each menu item is ~28px tall plus the py-1 wrapper, so the
  // height estimate is items.length * 28 + 8. The 16px buffer leaves space
  // before the menu would touch the viewport edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const estimatedHeight = items.length * 28 + 8
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const rightAnchor = window.innerWidth - rect.right
    if (spaceBelow < estimatedHeight + 16 && spaceAbove > spaceBelow) {
      // Grow upward: anchor the menu's bottom edge 4px above the trigger.
      setCoords({ bottom: window.innerHeight - rect.top + 4, right: rightAnchor })
    } else {
      // Grow downward: anchor the menu's top edge 4px below the trigger.
      setCoords({ top: rect.bottom + 4, right: rightAnchor })
    }
  }, [open, items.length])

  const isDark = variant === 'dark'

  const triggerBase = isDark
    ? 'p-1 text-gray-500 hover:text-gray-200 hover:bg-white/5 rounded transition-colors'
    : 'p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors'

  // Portaled menus use position: fixed with inline coordinates computed from
  // the trigger's bounding rect, so the absolute parent-relative anchoring
  // (right-0 top-full / bottom-full) is no longer needed.
  const popoverClass = isDark
    ? `fixed z-50 min-w-[160px] rounded-md py-1 px-1 bg-[#1a1a1a] border border-gray-800 shadow-xl`
    : `fixed z-50 min-w-[160px] rounded-md py-1 px-1 bg-white border border-gray-200 shadow-lg`

  const itemBase = isDark
    ? 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-gray-200 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'
    : 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'

  const destructiveItem = isDark
    ? 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'
    : 'flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left'

  // The menu (backdrop + popover) is portaled to document.body so it can
  // escape any ancestor with `overflow` clipping (e.g. the section table's
  // `overflow-x-auto` wrapper that was clipping last-row dropdowns).
  const portaled = open && mounted && coords
    ? createPortal(
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
            style={{
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              right: `${coords.right}px`,
            }}
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
        </>,
        document.body,
      )
    : null

  return (
    <div className="relative flex-shrink-0">
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
      {portaled}
    </div>
  )
}
