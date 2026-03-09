'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, LoaderIcon } from 'lucide-react'
import Image from 'next/image'
import { DailyReportContent, FormField } from '@/types'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, isWeatherField, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import Portal from '@/components/ui/Portal'

interface EditDailyReportModalProps {
  postId: string
  initialContent: DailyReportContent
  onClose: () => void
  onUpdated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const FORM_KEY = 'daily_report'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

export default function EditDailyReportModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditDailyReportModalProps) {
  const supabase = createClient()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  // Initialize values from existing content
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {
      project_name: initialContent.project_name ?? '',
      date: initialContent.date ?? '',
      address: initialContent.address ?? '',
      reported_by: initialContent.reported_by ?? '',
      project_foreman: initialContent.project_foreman ?? '',
      weather: initialContent.weather ?? '',
      progress: initialContent.progress ?? '',
      delays: initialContent.delays ?? '',
      safety: initialContent.safety ?? '',
      materials_used: initialContent.materials_used ?? '',
      employees: initialContent.employees ?? '',
    }
    // Load custom field values from content
    const rawContent = initialContent as unknown as Record<string, unknown>
    for (const [key, val] of Object.entries(rawContent)) {
      if (!KNOWN_KEYS.has(key) && key !== 'photos' && typeof val === 'string') {
        v[key] = val
      }
    }
    return v
  })

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  // Photos: existing paths, removals, new files
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initialContent.photos ?? [])
  const [removedPaths, setRemovedPaths] = useState<string[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve existing photo URLs
  const existingUrls = existingPhotos.map((path) => ({
    path,
    url: supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl,
  }))

  function handleNewPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setNewFiles((p) => [...p, ...selected])
    setNewPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removeExistingPhoto(path: string) {
    setExistingPhotos((p) => p.filter((x) => x !== path))
    setRemovedPaths((p) => [...p, path])
  }

  function removeNewPhoto(i: number) {
    setNewFiles((p) => p.filter((_, idx) => idx !== i))
    setNewPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    try {
      // Delete removed photos from storage
      if (removedPaths.length > 0) {
        await supabase.storage.from('post-photos').remove(removedPaths)
      }

      // Upload new photos
      const newPaths: string[] = []
      for (const file of newFiles) {
        const ext = file.name.split('.').pop()
        const path = `reports/${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, file)
        if (uploadErr) throw uploadErr
        newPaths.push(path)
      }

      const finalPhotos = [...existingPhotos, ...newPaths]

      const updatedContent: Record<string, unknown> = {
        project_name: (values.project_name ?? '').trim(),
        date: values.date ?? '',
        address: (values.address ?? '').trim(),
        reported_by: (values.reported_by ?? '').trim(),
        project_foreman: (values.project_foreman ?? '').trim(),
        weather: (values.weather ?? '').trim(),
        progress: (values.progress ?? '').trim(),
        delays: (values.delays ?? '').trim(),
        safety: (values.safety ?? '').trim(),
        materials_used: (values.materials_used ?? '').trim(),
        employees: (values.employees ?? '').trim(),
        photos: finalPhotos,
      }

      // Add custom field values
      for (const [key, val] of Object.entries(values)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string' && val.trim()) {
          updatedContent[key] = val.trim()
        }
      }

      const dynamicFields = buildDynamicFields(FORM_KEY, values, templateFields)

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content: updatedContent, dynamic_fields: dynamicFields })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  function renderField(field: FormField) {
    if (field.type === 'section_header') {
      return (
        <div key={field.id}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{field.label}</p>
        </div>
      )
    }

    const contentKey = getContentKey(FORM_KEY, field)

    // Weather field
    if (isWeatherField(FORM_KEY, field)) {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}</label>
          <input
            type="text"
            value={values.weather ?? ''}
            onChange={(e) => updateValue('weather', e.target.value)}
            placeholder={field.placeholder || 'e.g. 72°F'}
            className={inputCls}
          />
        </div>
      )
    }

    return (
      <DynamicFormField
        key={field.id}
        field={field}
        value={values[contentKey] ?? ''}
        onChange={(v) => updateValue(contentKey, String(v))}
      />
    )
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] overflow-hidden flex flex-col bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] md:my-auto bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Edit Daily Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {templateLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <LoaderIcon className="w-3 h-3 animate-spin" />
              Loading form template...
            </div>
          )}

          {/* Dynamic template fields */}
          {templateFields.map((field) => renderField(field))}

          {/* Photos section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>

            {existingUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {existingUrls.map(({ path, url }) => (
                  <div key={path} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <Image src={url} alt="Report photo" fill className="object-cover" sizes="120px" />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(path)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newPreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {newPreviews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 ring-amber-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              <CameraIcon className="w-4 h-4" /> Add photos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleNewPhotos}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none flex gap-3 p-4 border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
    </Portal>
  )
}
