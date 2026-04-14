'use client'

import { useState } from 'react'
import { XIcon, BookOpenIcon } from 'lucide-react'
import PhotoLightbox from '@/components/photos/PhotoLightbox'

export interface FieldGuideSectionImageData {
  id: string
  image_url: string
  sort_order: number
}

export interface FieldGuideSectionData {
  id: string
  heading: string
  body: string | null
  sort_order: number
  images: FieldGuideSectionImageData[]
}

export interface AttachedFieldGuide {
  attachmentId: string // id from job_report_field_guides
  templateId: string
  title: string
  sections: FieldGuideSectionData[]
}

interface FieldGuideDisplayProps {
  guide: AttachedFieldGuide
  readOnly: boolean
  onRemove: (attachmentId: string) => void
}

/**
 * Renders an attached field guide in a read-only, full-width, SOP/document style.
 * Visually distinct from the card-based checklist/material system layouts.
 */
export default function FieldGuideDisplay({ guide, readOnly, onRemove }: FieldGuideDisplayProps) {
  // Flat list of all image urls across all sections, for lightbox navigation.
  const allImages: string[] = guide.sections.flatMap((s) => s.images.map((i) => i.image_url))
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  function openLightbox(imageUrl: string) {
    const idx = allImages.indexOf(imageUrl)
    if (idx >= 0) setLightboxIndex(idx)
  }

  return (
    <>
      <article className="rounded-lg border border-gray-200 overflow-hidden">
        {/* Title + remove button */}
        <header className="flex items-start gap-2 px-3 sm:px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <BookOpenIcon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <h2 className="flex-1 text-sm font-semibold text-gray-900 leading-tight">
            {guide.title}
          </h2>
          {!readOnly && (
            <button
              onClick={() => onRemove(guide.attachmentId)}
              className="p-1 text-gray-400 hover:text-red-500 transition flex-shrink-0"
              title="Remove field guide"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </header>

        {/* Sections */}
        <div className="px-3 sm:px-4 py-3 space-y-4">
          {guide.sections.map((section, idx) => (
            <section
              key={section.id}
              className={idx > 0 ? 'pt-4 border-t border-gray-100' : ''}
            >
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
                {section.heading}
              </h3>
              {section.body && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {section.body}
                </p>
              )}
              {section.images.length > 0 && (
                <div data-fg-thumb-grid className="mt-3 flex flex-wrap gap-2">
                  {section.images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => openLightbox(img.image_url)}
                      data-fg-thumb
                      className="fg-thumb block overflow-hidden rounded-md border border-gray-200 bg-white hover:border-gray-400 transition w-[88px] h-[88px] flex-shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.image_url}
                        alt=""
                        className="fg-thumb-img block w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </article>

      {lightboxIndex !== null && allImages.length > 0 && (
        <PhotoLightbox
          photos={allImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  )
}
