'use client'

import { useState, useRef, useCallback } from 'react'
import { XIcon, UploadIcon, Loader2Icon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface Props {
  productName: string
  onClose: () => void
  onUpload: (documentType: 'PDS' | 'SDS', file: File) => Promise<void>
}

const labelCls =
  'block text-xs font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide mb-1'

export default function DocumentUploadModal({ productName, onClose, onUpload }: Props) {
  const [documentType, setDocumentType] = useState<'PDS' | 'SDS'>('PDS')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      setFile(dropped)
      setError(null)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    if (selected) {
      setFile(selected)
      setError(null)
    }
  }

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file to upload.')
      return
    }

    setError(null)
    setUploading(true)

    try {
      await onUpload(documentType, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document.')
      setUploading(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto md:max-h-[85vh] bg-white dark:bg-[#242424] md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#3a3a3a] flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upload Document</h2>
              <p className="text-xs text-gray-500 dark:text-[#a0a0a0] mt-0.5">{productName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Document type selector */}
            <div>
              <label className={labelCls}>Document Type</label>
              <div className="flex gap-3">
                {(['PDS', 'SDS'] as const).map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-2 flex-1 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                      documentType === type
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500'
                        : 'border-gray-300 dark:border-[#3a3a3a] bg-white dark:bg-[#2e2e2e] hover:border-gray-400 dark:hover:border-[#4a4a4a]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="documentType"
                      value={type}
                      checked={documentType === type}
                      onChange={() => setDocumentType(type)}
                      className="accent-amber-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{type}</span>
                      <p className="text-xs text-gray-500 dark:text-[#a0a0a0]">
                        {type === 'PDS' ? 'Product Data Sheet' : 'Safety Data Sheet'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* File upload area */}
            <div>
              <label className={labelCls}>File *</label>
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => !uploading && fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : file
                      ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-[#3a3a3a] hover:border-amber-300 dark:hover:border-amber-500/50 hover:bg-amber-50/30 dark:hover:bg-amber-900/10'
                }`}
              >
                {file ? (
                  <>
                    <UploadIcon className="w-6 h-6 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-[#a0a0a0] mt-1">
                      {(file.size / 1024).toFixed(1)} KB &middot; Click or drop to replace
                    </p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-6 h-6 text-gray-400 dark:text-[#6b6b6b] mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-[#a0a0a0]">
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        Click to browse
                      </span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[#6b6b6b] mt-1">
                      PDF, Word, or image files
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-[#3a3a3a] flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] border border-gray-300 dark:border-[#3a3a3a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#3a3a3a] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={uploading || !file}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
            >
              {uploading ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
