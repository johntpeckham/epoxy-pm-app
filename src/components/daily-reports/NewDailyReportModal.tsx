'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, LoaderIcon } from 'lucide-react'
import { Project, FormField } from '@/types'
import { fetchWeatherForAddress } from '@/lib/fetchWeather'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, isWeatherField, getKnownContentKeys } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import Portal from '@/components/ui/Portal'

interface NewDailyReportModalProps {
  projects: Project[]
  userId: string
  onClose: () => void
  onCreated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const FORM_KEY = 'daily_report'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

export default function NewDailyReportModal({
  projects,
  userId,
  onClose,
  onCreated,
}: NewDailyReportModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  // Project selector
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')

  // All field values keyed by content key (for known fields) or field ID (for custom fields)
  const [values, setValues] = useState<Record<string, string>>({
    project_name: projects[0]?.name ?? '',
    date: today,
    address: projects[0]?.address ?? '',
    reported_by: '',
    project_foreman: '',
    weather: '',
    progress: '',
    delays: '',
    safety: '',
    materials_used: '',
    employees: '',
  })

  const [weatherLoading, setWeatherLoading] = useState(false)

  // Photos
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  // Auto-fetch weather for initial project
  useEffect(() => {
    if (projects[0]?.address) {
      setWeatherLoading(true)
      fetchWeatherForAddress(projects[0].address).then((w) => {
        if (w) updateValue('weather', w)
        setWeatherLoading(false)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId)
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      updateValue('project_name', project.name)
      updateValue('address', project.address)
      setWeatherLoading(true)
      updateValue('weather', '')
      fetchWeatherForAddress(project.address).then((w) => {
        if (w) updateValue('weather', w)
        setWeatherLoading(false)
      })
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setFiles((p) => [...p, ...selected])
    setPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removePhoto(i: number) {
    setFiles((p) => p.filter((_, idx) => idx !== i))
    setPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    if (!selectedProjectId) {
      setError('Please select a project')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      // Upload photos
      const photoPaths: string[] = []
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${selectedProjectId}/reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, file)
        if (uploadErr) throw uploadErr
        photoPaths.push(path)
      }

      // Build content with backwards-compatible keys
      const content: Record<string, unknown> = {
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
        photos: photoPaths,
      }

      // Add custom field values (fields added by admin that aren't in the known set)
      for (const [key, val] of Object.entries(values)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string' && val.trim()) {
          content[key] = val.trim()
        }
      }

      const { error: insertErr } = await supabase.from('feed_posts').insert({
        project_id: selectedProjectId,
        user_id: userId,
        post_type: 'daily_report',
        is_pinned: false,
        content,
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report')
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

    // Weather field - special rendering with auto-fetch indicator
    if (isWeatherField(FORM_KEY, field)) {
      return (
        <div key={field.id} className="min-w-0">
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <div className="relative">
            <input
              type="text"
              value={values.weather ?? ''}
              onChange={(e) => updateValue('weather', e.target.value)}
              placeholder={weatherLoading ? 'Fetching weather...' : field.placeholder || 'e.g. 72°F, Partly Cloudy, Wind 8 mph'}
              className={inputCls}
            />
            {weatherLoading && (
              <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
            )}
          </div>
        </div>
      )
    }

    // All other fields - render with DynamicFormField
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
      <div className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Title bar */}
        <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">New Daily Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
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

          {/* Project selector */}
          <div>
            <label className={labelCls}>
              Project <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={inputCls}
            >
              {projects.length === 0 && (
                <option value="">No active projects</option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic template fields */}
          {templateFields.map((field) => renderField(field))}

          {/* Photos section (always at end) */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1.5" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Add photos</span> to this report
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            {previews.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {previews.map((url, i) => (
                  <div
                    key={i}
                    className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            disabled={loading || projects.length === 0}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
