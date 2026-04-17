'use client'

import { useCallback, useEffect } from 'react'
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface PhotoLightboxProps {
  photos: string[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export default function PhotoLightbox({ photos, currentIndex, onClose, onNavigate }: PhotoLightboxProps) {
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(currentIndex - 1)
  }, [hasPrev, currentIndex, onNavigate])

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(currentIndex + 1)
  }, [hasNext, currentIndex, onNavigate])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goPrev, goNext, onClose])

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Title bar */}
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <h2 className="text-lg font-semibold text-gray-900">
              Image Preview
              {photos.length > 1 && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  {currentIndex + 1} / {photos.length}
                </span>
              )}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          {/* Content */}
          <div className="relative flex-1 overflow-y-auto p-4 md:p-6 flex items-center justify-center min-h-0">
            {/* Previous arrow */}
            {hasPrev && (
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition"
                aria-label="Previous photo"
              >
                <ChevronLeftIcon className="w-6 h-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[currentIndex]}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            {/* Next arrow */}
            {hasNext && (
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition"
                aria-label="Next photo"
              >
                <ChevronRightIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
