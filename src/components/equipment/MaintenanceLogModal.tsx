'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, ImageIcon, TrashIcon } from 'lucide-react'
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
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(entry?.photo_url ?? null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a PNG, JPG, GIF, or WebP file')
      return
    }
    setPhotoUploading(true)
    setError(null)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `equipment/${equipmentId}/maintenance/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('equipment-photos')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage
        .from('equipment-photos')
        .getPublicUrl(path)
      setPhotoUrl(urlData.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
      photo_url: photoUrl,
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

            {/* Photo */}
            <div>
              <label className={labelCls}>Photo</label>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                  >
                    <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {photoUploading ? 'Uploading...' : photoUrl ? 'Change photo' : 'Upload photo'}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
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
