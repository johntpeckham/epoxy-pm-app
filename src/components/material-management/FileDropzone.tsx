'use client'

import { useCallback, useRef, useState } from 'react'
import { UploadIcon, XIcon } from 'lucide-react'

const ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*'

interface Props {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
  size?: 'md' | 'sm'
}

export default function FileDropzone({ file, onChange, disabled, size = 'md' }: Props) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      if (disabled) return
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) onChange(dropped)
    },
    [disabled, onChange]
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (selected) onChange(selected)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const padding = size === 'sm' ? 'p-3' : 'p-6'
  const iconSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
  const captionMargin = size === 'sm' ? 'mt-0.5' : 'mt-1'

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg ${padding} text-center cursor-pointer transition-colors ${
        disabled
          ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-[#3a3a3a]'
          : dragActive
            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
            : file
              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
              : 'border-gray-200 dark:border-[#3a3a3a] hover:border-amber-300 dark:hover:border-amber-500/50 hover:bg-amber-50/30 dark:hover:bg-amber-900/10'
      }`}
    >
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <UploadIcon className={`${iconSize} text-green-500 flex-shrink-0`} />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {file.name}
            </p>
            <p className={`text-[11px] text-gray-500 dark:text-[#a0a0a0] ${captionMargin}`}>
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 rounded transition-colors"
            title="Remove file"
            aria-label="Remove file"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <UploadIcon className={`${iconSize} text-gray-400 dark:text-[#6b6b6b] mx-auto mb-1`} />
          <p className={`${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-[#a0a0a0]`}>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Click to browse
            </span>{' '}
            or drag and drop
          </p>
          <p className={`text-[11px] text-gray-400 dark:text-[#6b6b6b] ${captionMargin}`}>
            PDF, Word, or image files
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  )
}
