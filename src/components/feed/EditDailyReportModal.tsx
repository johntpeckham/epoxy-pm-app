'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon } from 'lucide-react'
import { DailyReportContent } from '@/types'

interface EditDailyReportModalProps {
  postId: string
  initialContent: DailyReportContent
  onClose: () => void
  onUpdated: () => void
}

export default function EditDailyReportModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditDailyReportModalProps) {
  const [form, setForm] = useState<DailyReportContent>({ ...initialContent })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof DailyReportContent, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('feed_posts')
      .update({ content: form })
      .eq('id', postId)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onUpdated()
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
  const textareaClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-full">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Edit Daily Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Crew Members <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.crew_members}
              onChange={(e) => set('crew_members', e.target.value)}
              placeholder="e.g. John, Mike, Sara"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Surface Prep Notes
            </label>
            <textarea
              rows={2}
              value={form.surface_prep_notes}
              onChange={(e) => set('surface_prep_notes', e.target.value)}
              className={textareaClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Epoxy Product Used
            </label>
            <input
              type="text"
              value={form.epoxy_product_used}
              onChange={(e) => set('epoxy_product_used', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Coats Applied</label>
            <input
              type="text"
              value={form.coats_applied}
              onChange={(e) => set('coats_applied', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Weather Conditions
            </label>
            <input
              type="text"
              value={form.weather_conditions}
              onChange={(e) => set('weather_conditions', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Additional Notes
            </label>
            <textarea
              rows={3}
              value={form.additional_notes}
              onChange={(e) => set('additional_notes', e.target.value)}
              className={textareaClass}
            />
          </div>
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
