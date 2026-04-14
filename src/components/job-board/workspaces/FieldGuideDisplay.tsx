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
      <article className="rounded-lg border border-amber-100 bg-amber-50/30 px-4 py-4 md:px-6 md:py-5">
        {/* Title + remove button */}
        <header className="flex items-start gap-2 pb-3 mb-4 border-b border-amber-100">
          <BookOpenIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <h2 className="flex-1 text-lg md:text-xl font-bold text-gray-900 leading-tight">
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
        <div className="space-y-6">
          {guide.sections.map((section, idx) => (
            <section
              key={section.id}
              className={idx > 0 ? 'pt-6 border-t border-amber-100/70' : ''}
            >
              <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">
                {section.heading}
              </h3>
              {section.body && (
                <p className="text-sm md:text-base text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {section.body}
                </p>
              )}
              {section.images.length > 0 && (
                <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-3">
                  {section.images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => openLightbox(img.image_url)}
                      className="block overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-amber-300 transition w-full sm:w-auto"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.image_url}
                        alt=""
                        className="block w-full sm:w-auto sm:h-[200px] max-h-[280px] object-cover"
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
