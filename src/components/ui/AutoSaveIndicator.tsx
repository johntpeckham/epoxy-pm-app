'use client'

import { useEffect, useRef, useState } from 'react'

interface AutoSaveIndicatorProps {
  /** When this flips to true, the label briefly flashes green then fades back to grey. */
  isSaving: boolean
  /** Optional extra classes for layout/alignment around the fixed-width label. */
  className?: string
}

/**
 * Unobtrusive auto-save indicator. Always rendered, always says "Auto-save",
 * always the same width — so it never causes layout shift. When a save occurs
 * (isSaving transitions to true) the text briefly flashes green, then fades
 * back to grey via a CSS transition.
 */
export default function AutoSaveIndicator({ isSaving, className = '' }: AutoSaveIndicatorProps) {
  const [flash, setFlash] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isSaving) {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      setFlash(true)
      // Start fading back to grey shortly after the flash lands — the CSS
      // transition on `color` itself is what slows the return to grey.
      fadeTimerRef.current = setTimeout(() => setFlash(false), 300)
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [isSaving])

  return (
    <span
      className={`inline-block text-right min-w-[62px] text-[11px] leading-none select-none ${className}`}
      style={{
        color: flash ? '#639922' : '#9ca3af', // green-ish when flashing, gray-400 at rest
        transition: flash
          ? 'color 0.3s ease-out'
          : 'color 1.5s ease-out',
      }}
      aria-live="polite"
    >
      Auto-save
    </span>
  )
}
