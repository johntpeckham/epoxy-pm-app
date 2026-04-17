'use client'

import { useState, useRef } from 'react'
import Portal from '@/components/ui/Portal'
import { XIcon, CameraIcon, Loader2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ReportProblemModalProps {
  onClose: () => void
  userId: string
}

export default function ReportProblemModal({ onClose, userId }: ReportProblemModalProps) {
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [note, setNote] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasInitiated = useRef(false)

  // Capture screenshot on mount
  if (!hasInitiated.current) {
    hasInitiated.current = true
    // Use setTimeout to let the modal close first, then capture the page behind it
    setTimeout(async () => {
      setCapturing(true)
      try {
        const html2canvas = (await import('html2canvas-pro')).default
        const canvas = await html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 1,
          logging: false,
          ignoreElements: (el: Element) => {
            // Ignore the portal overlay so we capture the actual page
            return el.classList?.contains('report-problem-portal')
          },
        })
        const dataUrl = canvas.toDataURL('image/png')
        setScreenshotDataUrl(dataUrl)

        canvas.toBlob((blob) => {
          if (blob) setScreenshotBlob(blob)
        }, 'image/png')
      } catch (err) {
        console.error('Screenshot capture failed:', err)
        setError('Failed to capture screenshot. You can still submit your report.')
      } finally {
        setCapturing(false)
      }
    }, 100)
  }

  async function handleSubmit() {
    if (!note.trim()) {
      setError('Please describe the problem.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      let screenshotUrl: string | null = null

      if (screenshotBlob) {
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
        const { error: uploadErr } = await supabase.storage
          .from('bug-reports')
          .upload(fileName, screenshotBlob, { contentType: 'image/png' })

        if (uploadErr) {
          console.error('Upload error:', uploadErr)
        } else {
          screenshotUrl = supabase.storage
            .from('bug-reports')
            .getPublicUrl(fileName).data.publicUrl
        }
      }

      const { error: insertErr } = await supabase.from('bug_reports').insert({
        user_id: userId,
        screenshot_url: screenshotUrl,
        note: note.trim(),
        page_url: window.location.pathname + window.location.search,
        status: 'open',
      })

      if (insertErr) throw insertErr

      setSubmitted(true)
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      console.error('Submit error:', err)
      setError('Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Portal>
      <div className="report-problem-portal fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/60" onClick={onClose}>
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-gray-900 md:rounded-xl flex flex-col overflow-hidden border border-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-700" style={{ minHeight: '52px' }}>
            <h3 className="text-lg font-semibold text-white">Report a Problem</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {submitted ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white font-medium">Report submitted</p>
                <p className="text-gray-400 text-sm mt-1">Thank you for your feedback!</p>
              </div>
            </div>
          ) : (
            <>
              {/* Screenshot preview */}
              <div className="flex-none px-4 pt-4">
                <label className="text-sm font-medium text-gray-300 mb-2 block">Screenshot</label>
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden" style={{ maxHeight: '200px' }}>
                  {capturing ? (
                    <div className="flex items-center justify-center py-8 text-gray-400">
                      <Loader2Icon className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-sm">Capturing screenshot…</span>
                    </div>
                  ) : screenshotDataUrl ? (
                    <img
                      src={screenshotDataUrl}
                      alt="Screenshot preview"
                      className="w-full h-auto object-contain"
                      style={{ maxHeight: '200px' }}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-8 text-gray-500">
                      <CameraIcon className="w-5 h-5 mr-2" />
                      <span className="text-sm">No screenshot captured</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <div className="flex-1 px-4 pt-4 pb-2 min-h-0">
                <label className="text-sm font-medium text-gray-300 mb-2 block">Description</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Describe the problem…"
                  className="w-full h-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                />
              </div>

              {error && (
                <div className="px-4 pb-2">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex-none flex gap-3 justify-end px-4 pb-4 pt-2">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || capturing}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
