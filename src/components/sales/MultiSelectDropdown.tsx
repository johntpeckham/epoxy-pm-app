'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
}

interface Props {
  ariaLabel: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  triggerLabel: string
  className?: string
}

export default function MultiSelectDropdown({
  ariaLabel,
  options,
  selected,
  onChange,
  triggerLabel,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
        setFocusIdx(0)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((i) => Math.max(0, i - 1))
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      const opt = options[focusIdx]
      if (opt) toggle(opt.value)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onKeyDown={handleKey}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 text-sm text-left border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 flex items-center justify-between"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#333] rounded-lg shadow-lg max-h-[240px] overflow-y-auto py-1"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 italic">No options</p>
          ) : (
            options.map((opt, i) => {
              const isChecked = selected.includes(opt.value)
              const isFocused = i === focusIdx
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  onClick={() => toggle(opt.value)}
                  onMouseEnter={() => setFocusIdx(i)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                    isFocused ? 'bg-gray-50 dark:bg-[#2a2a2a]' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    tabIndex={-1}
                    className="h-3.5 w-3.5 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 pointer-events-none"
                  />
                  <span className="truncate text-gray-700 dark:text-gray-300">
                    {opt.label}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
