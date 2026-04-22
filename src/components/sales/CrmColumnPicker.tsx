'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PlusIcon } from 'lucide-react'
import type { CrmColumn } from './crmColumns'

interface CrmColumnPickerProps {
  allColumns: CrmColumn[]
  visibleIds: string[]
  onToggle: (columnId: string) => void
}

export default function CrmColumnPicker({
  allColumns,
  visibleIds,
  onToggle,
}: CrmColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.right - 256 })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleScroll() { updatePos() }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePos])

  const builtIn = allColumns.filter((c) => c.type === 'built-in')
  const custom = allColumns.filter((c) => c.type === 'custom')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        title="Customize columns"
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-[420px] overflow-y-auto"
          style={{ top: pos.top, left: Math.max(8, pos.left), zIndex: 50 }}
        >
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">Show columns</p>
          </div>

          {builtIn.map((col) => {
            const checked = visibleIds.includes(col.id)
            const locked = col.type === 'built-in' && col.alwaysVisible
            return (
              <label
                key={col.id}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${
                  locked ? 'opacity-60 cursor-default' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => !locked && onToggle(col.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                />
                <span className="text-gray-700">{col.label}</span>
              </label>
            )
          })}

          {custom.length > 0 && (
            <>
              <div className="mx-3 my-1 border-t border-gray-100" />
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Custom</p>
              </div>
              {custom.map((col) => {
                const checked = visibleIds.includes(col.id)
                return (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(col.id)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                    />
                    <span className="text-gray-700">{col.label}</span>
                  </label>
                )
              })}
            </>
          )}

        </div>,
        document.body
      )}
    </>
  )
}

