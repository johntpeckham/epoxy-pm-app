'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { MaintenanceLogRow } from '@/app/(dashboard)/equipment/[id]/page'

interface Props {
  entry: MaintenanceLogRow | null
  equipmentId: string
  userId: string
  userDisplayName: string
  onClose: () => void
  onSaved: () => void
}

const SERVICE_TYPE_SUGGESTIONS = [
  'Oil Change',
  'Tire Rotation',
  'Inspection',
  'Brake Service',
  'Fluid Top-Off',
  'Filter Replacement',
  'Repair',
  'Other',
]

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

function todayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MaintenanceLogModal({
  entry,
  equipmentId,
  userId,
  userDisplayName,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!entry

  const [serviceDate, setServiceDate] = useState(entry?.service_date ?? todayString())
  const [serviceType, setServiceType] = useState(entry?.service_type ?? '')
  const [mileageOrHours, setMileageOrHours] = useState(entry?.mileage_or_hours ?? '')
  const [performedBy, setPerformedBy] = useState(entry?.performed_by ?? userDisplayName)
  const [notes, setNotes] = useState(entry?.notes ?? '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!serviceDate) {
      setError('Date of service is required.')
      return
    }
    if (!serviceType.trim()) {
      setError('Service type is required.')
      return
    }
    if (!performedBy.trim()) {
      setError('Performed by is required.')
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const payload = {
      equipment_id: equipmentId,
      service_date: serviceDate,
      service_type: serviceType.trim(),
      mileage_or_hours: mileageOrHours.trim() || null,
      performed_by: performedBy.trim(),
      notes: notes.trim() || null,
    }

    try {
      if (isEdit && entry) {
        const { error: updateErr } = await supabase
          .from('maintenance_logs')
          .update(payload)
          .eq('id', entry.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('maintenance_logs')
          .insert({ ...payload, created_by: userId })
        if (insertErr) throw insertErr
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save maintenance entry.')
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
              {isEdit ? 'Edit Maintenance Entry' : 'Add Maintenance Entry'}
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

            {/* Date of Service */}
            <div>
              <label className={labelCls}>Date of Service *</label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Service Type */}
            <div>
              <label className={labelCls}>Service Type *</label>
              <input
                type="text"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                placeholder="e.g. Oil Change"
                list="service-type-suggestions"
                className={inputCls}
              />
              <datalist id="service-type-suggestions">
                {SERVICE_TYPE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            {/* Mileage or Hours */}
            <div>
              <label className={labelCls}>Mileage or Hours</label>
              <input
                type="text"
                value={mileageOrHours}
                onChange={(e) => setMileageOrHours(e.target.value)}
                placeholder="e.g. 42350"
                className={inputCls}
              />
            </div>

            {/* Performed By */}
            <div>
              <label className={labelCls}>Performed By *</label>
              <input
                type="text"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                placeholder="Name of person or shop"
                className={inputCls}
              />
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
                className={inputCls}
              />
            </div>
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
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
