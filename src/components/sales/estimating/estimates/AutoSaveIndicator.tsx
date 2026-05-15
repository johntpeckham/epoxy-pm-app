'use client'

import { AlertCircleIcon, CheckIcon, Loader2Icon } from 'lucide-react'

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  state: AutoSaveState
}

/**
 * Page-level auto-save indicator. Lives in the EstimateDetailClient header
 * top-right. State is lifted to the orchestrator so any tab can drive it.
 *
 * - SAVING: small spinner + "Saving..."
 * - SAVED: small check + "Saved" (persists until next save starts)
 * - ERROR: alert icon + "Error saving" (persists until resolved)
 * - IDLE: hidden
 */
export default function AutoSaveIndicator({ state }: Props) {
  if (state === 'idle') return null

  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#a0a0a0]">
        <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </span>
    )
  }

  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#a0a0a0]">
        <CheckIcon className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
        Saved
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <AlertCircleIcon className="w-3.5 h-3.5" />
      Error saving
    </span>
  )
}
