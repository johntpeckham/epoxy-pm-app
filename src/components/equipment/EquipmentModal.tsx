'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, TrashIcon, CameraIcon, WrenchIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'

interface Props {
  item: EquipmentRow | null
  userId: string
  onClose: () => void
  onSaved: () => void
  /** When editing, triggers the delete confirmation flow in the parent. */
  onDelete?: (id: string) => void
}

const CATEGORY_OPTIONS = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'heavy_equipment', label: 'Heavy Equipment' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'tool', label: 'Tool' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'out_of_service', label: 'Out of Service' },
]

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function EquipmentModal({ item, userId, onClose, onSaved, onDelete }: Props) {
  const isEdit = !!item

  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? 'vehicle')
  const [status, setStatus] = useState(item?.status ?? 'active')
  const [year, setYear] = useState(item?.year ?? '')
  const [make, setMake] = useState(item?.make ?? '')
  const [model, setModel] = useState(item?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(item?.serial_number ?? '')
  const [vin, setVin] = useState(item?.vin ?? '')
  const [licensePlate, setLicensePlate] = useState(item?.license_plate ?? '')
  const [customFields, setCustomFields] = useState<{ label: string; value: string }[]>(
    item?.custom_fields?.length ? item.custom_fields : []
  )
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photo_url ?? null)
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
      const path = `equipment/${Date.now()}.${ext}`
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

  const addCustomField = () => {
    setCustomFields((prev) => [...prev, { label: '', value: '' }])
  }

  const updateCustomField = (index: number, key: 'label' | 'value', val: string) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [key]: val } : f))
    )
  }

  const removeCustomField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Equipment name is required.')
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const payload = {
      name: name.trim(),
      category,
      status,
      year: year.trim() || null,
      make: make.trim() || null,
      model: model.trim() || null,
      serial_number: serialNumber.trim() || null,
      vin: vin.trim() || null,
      license_plate: licensePlate.trim() || null,
      custom_fields: customFields.filter((f) => f.label.trim() || f.value.trim()),
      photo_url: photoUrl,
    }

    try {
      if (isEdit && item) {
        const { error: updateErr } = await supabase
          .from('equipment')
          .update(payload)
          .eq('id', item.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('equipment')
          .insert({ ...payload, created_by: userId })
        if (insertErr) throw insertErr
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save equipment.')
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Equipment' : 'Add Equipment'}
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

            {/* Photo */}
            <div>
              <label className={labelCls}>Photo</label>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <WrenchIcon className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                  >
                    <CameraIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
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
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
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

            {/* Equipment Name */}
            <div>
              <label className={labelCls}>Equipment Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2020 Ford F-250"
                className={inputCls}
              />
            </div>

            {/* Category */}
            <div>
              <label className={labelCls}>Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className={labelCls}>Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year / Make / Model */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Year</label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2020"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Make</label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Ford"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="F-250"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Serial Number */}
            <div>
              <label className={labelCls}>Serial Number</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Serial number"
                className={inputCls}
              />
            </div>

            {/* VIN */}
            <div>
              <label className={labelCls}>VIN</label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="Vehicle identification number"
                className={inputCls}
              />
            </div>

            {/* License Plate */}
            <div>
              <label className={labelCls}>License Plate</label>
              <input
                type="text"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="License plate number"
                className={inputCls}
              />
            </div>

            {/* Custom Fields */}
            <div>
              <label className={labelCls}>Additional Fields</label>
              {customFields.map((field, index) => (
                <div key={index} className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateCustomField(index, 'label', e.target.value)}
                    placeholder="Label"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                    placeholder="Value"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(index)}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCustomField}
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Field
              </button>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0 flex-wrap"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {isEdit && item && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
                Delete Equipment
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
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
                {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Equipment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
