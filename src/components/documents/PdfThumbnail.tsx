'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2Icon, FileTextIcon } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PdfThumbnailProps {
  url: string
  onClick: () => void
}

export default function PdfThumbnail({ url, onClick }: PdfThumbnailProps) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <button
        onClick={onClick}
        className="w-[120px] h-[160px] rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 hover:border-amber-300 hover:bg-amber-50/30 transition cursor-pointer flex-shrink-0"
      >
        <FileTextIcon className="w-8 h-8 text-gray-300" />
        <span className="text-[10px] text-gray-400">PDF</span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-[120px] h-[160px] rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-amber-300 hover:shadow-md transition cursor-pointer flex-shrink-0 relative"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <Loader2Icon className="w-5 h-5 text-gray-300 animate-spin" />
        </div>
      )}
      <Document
        file={url}
        onLoadSuccess={() => setLoading(false)}
        onLoadError={() => { setLoading(false); setFailed(true) }}
        loading={null}
      >
        <Page
          pageNumber={1}
          width={120}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </button>
  )
}
