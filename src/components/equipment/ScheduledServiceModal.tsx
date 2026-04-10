'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { ScheduledServiceRow } from '@/app/(dashboard)/equipment/[id]/page'

interface Props {
  entry: ScheduledServiceRow | null
  equipmentId: string
  userId: string
  onClose: () => void
  onSaved: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

function todayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ScheduledServiceModal({
  entry,
  equipmentId,
  userId,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!entry

  const [description, setDescription] = useState(entry?.description ?? '')
  const [scheduledDate, setScheduledDate] = useState(entry?.scheduled_date ?? todayString())
  const [isRecurring, setIsRecurring] = useState(entry?.is_recurring ?? false)
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(entry?.recurrence_interval ?? 3)
  )
  const [recurrenceUnit, setRecurrenceUnit] = useState<'weeks' | 'months'>(
    (entry?.recurrence_unit as 'weeks' | 'months' | null) ?? 'months'
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Description is required.')
      return
    }
    if (!scheduledDate) {
      setError('Scheduled date is required.')
      return
    }

    const interval = Math.max(1, parseInt(recurrenceInterval) || 1)

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const payload = {
      equipment_id: equipmentId,
      description: description.trim(),
      scheduled_date: scheduledDate,
      is_recurring: isRecurring,
      recurrence_interval: isRecurring ? interval : null,
      recurrence_unit: isRecurring ? recurrenceUnit : null,
    }

    try {
      if (isEdit && entry) {
        const { error: updateErr } = await supabase
          .from('equipment_scheduled_services')
          .update(payload)
          .eq('id', entry.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('equipment_scheduled_services')
          .insert({ ...payload, status: 'upcoming', created_by: userId })
        if (insertErr) throw insertErr
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scheduled service.')
      setLoading(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Scheduled Service' : 'Schedule Next Service'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Description */}
            <div>
              <label className={labelCls}>Service Description *</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Oil Change, Tire Rotation"
                className={inputCls}
              />
            </div>

            {/* Scheduled Date */}
            <div>
              <label className={labelCls}>Scheduled Date *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-gray-50 border border-gray-200">
              <div>
                <span className="text-sm font-medium text-gray-900">Recurring</span>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Auto-generates the next occurrence when marked complete
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isRecurring}
                onClick={() => setIsRecurring((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isRecurring ? 'bg-amber-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    isRecurring ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Recurrence fields (only when enabled) */}
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Repeat Every</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value)}
                    onBlur={() => {
                      const num = parseInt(recurrenceInterval)
                      if (!num || num < 1) setRecurrenceInterval('1')
                      else setRecurrenceInterval(String(num))
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Unit</label>
                  <select
                    value={recurrenceUnit}
                    onChange={(e) => setRecurrenceUnit(e.target.value as 'weeks' | 'months')}
                    className={inputCls}
                  >
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Schedule Service'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
