'use client'

import { AlertCircleIcon, CheckIcon } from 'lucide-react'

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  state: AutoSaveState
}

/**
 * Page-level auto-save indicator. Always rendered — no pop-in on first
 * edit. Wrapped in a bordered pill that visually matches the undo/redo
 * buttons next to it.
 *
 * - SAVED / IDLE: muted gray check + "Saved", standard border, no animation.
 * - SAVING: muted text + faint green pulsing glow on the border.
 * - ERROR: loud red text + red border, no animation; persists until the
 *   next successful save returns the indicator to SAVED.
 *
 * Width is locked via min-w so the pill never resizes between states —
 * "Saving…" is the widest label and sets the floor.
 */
export default function AutoSaveIndicator({ state }: Props) {
  // 'idle' visually behaves like 'saved' so the indicator looks settled at
  // page load before the user has done anything.
  const isSaving = state === 'saving'
  const isError = state === 'error'

  const baseCls =
    'inline-flex items-center justify-center gap-1.5 h-8 px-3 min-w-[100px] rounded-md border text-xs transition-[box-shadow,border-color,color] duration-200'

  const stateCls = isError
    ? 'border-red-500/50 dark:border-red-500/50 text-red-500 dark:text-red-400'
    : 'border-gray-200 dark:border-[#3a3a3a] text-gray-500 dark:text-[#a0a0a0]'

  const animationCls = isSaving ? 'animate-save-pulse' : ''

  if (isError) {
    return (
      <span className={`${baseCls} ${stateCls}`}>
        <AlertCircleIcon className="w-3.5 h-3.5" />
        Error
      </span>
    )
  }

  if (isSaving) {
    return (
      <span className={`${baseCls} ${stateCls} ${animationCls}`}>
        <CheckIcon className="w-3.5 h-3.5" />
        Saving…
      </span>
    )
  }

  // saved or idle
  return (
    <span className={`${baseCls} ${stateCls}`}>
      <CheckIcon className="w-3.5 h-3.5" />
      Saved
    </span>
  )
}
