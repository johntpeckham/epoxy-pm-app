'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, SettingsIcon, LoaderIcon } from 'lucide-react'
import { JsaReportContent, JsaTaskTemplate, JsaTaskEntry, JsaSignatureEntry, FormField } from '@/types'
import { fetchWeatherForAddress } from '@/lib/fetchWeather'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, isWeatherField, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import JsaTemplateManagerModal from '@/components/jsa-reports/JsaTemplateManagerModal'
import JsaSignatureSection from '@/components/jsa-reports/JsaSignatureSection'
import Portal from '@/components/ui/Portal'

interface EditJsaReportModalProps {
  postId: string
  initialContent: JsaReportContent
  onClose: () => void
  onUpdated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const FORM_KEY = 'jsa_report'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

const TASK_SECTION_IDS = new Set(['jsa-10', 'jsa-11', 'jsa-12', 'jsa-13', 'jsa-14'])
const TASK_SECTION_LABELS = new Set(['Tasks', 'Task Selection', 'Hazards', 'Precautions', 'PPE Required'])
const SIG_SECTION_IDS = new Set(['jsa-15', 'jsa-16'])
const SIG_SECTION_LABELS = new Set(['Employee Acknowledgment & Signatures', 'Employee Signatures'])

function isTaskSectionField(field: FormField): boolean {
  return TASK_SECTION_IDS.has(field.id) || TASK_SECTION_LABELS.has(field.label)
}

function isSignatureSectionField(field: FormField): boolean {
  return SIG_SECTION_IDS.has(field.id) || SIG_SECTION_LABELS.has(field.label)
}

export default function EditJsaReportModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditJsaReportModalProps) {
  const supabase = createClient()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {
      projectName: initialContent.projectName ?? '',
      date: initialContent.date ?? '',
      address: initialContent.address ?? '',
      weather: initialContent.weather ?? '',
      preparedBy: initialContent.preparedBy ?? '',
      siteSupervisor: initialContent.siteSupervisor ?? '',
      competentPerson: initialContent.competentPerson ?? '',
    }
    const rawContent = initialContent as unknown as Record<string, unknown>
    for (const [key, val] of Object.entries(rawContent)) {
      if (!KNOWN_KEYS.has(key) && key !== 'tasks' && key !== 'signatures' && typeof val === 'string') {
        v[key] = val
      }
    }
    return v
  })

  const [weatherLoading, setWeatherLoading] = useState(false)

  const [templates, setTemplates] = useState<JsaTaskTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [selectedTasks, setSelectedTasks] = useState<Record<string, JsaTaskEntry>>(() => {
    const map: Record<string, JsaTaskEntry> = {}
    for (const task of initialContent.tasks ?? []) {
      map[task.templateId] = task
    }
    return map
  })
  const [signatures, setSignatures] = useState<JsaSignatureEntry[]>(initialContent.signatures ?? [])
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  useEffect(() => {
    if (!templatesLoaded) {
      supabase
        .from('jsa_task_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .then(({ data }) => {
          setTemplates((data as JsaTaskTemplate[]) ?? [])
          setTemplatesLoaded(true)
        })
    }
  }, [templatesLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTask(template: JsaTaskTemplate) {
    setSelectedTasks((prev) => {
      const next = { ...prev }
      if (next[template.id]) {
        delete next[template.id]
      } else {
        next[template.id] = {
          templateId: template.id,
          name: template.name,
          hazards: template.default_hazards ?? '',
          precautions: template.default_precautions ?? '',
          ppe: template.default_ppe ?? '',
        }
      }
      return next
    })
  }

  function updateTask(templateId: string, field: keyof JsaTaskEntry, value: string) {
    setSelectedTasks((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [field]: value },
    }))
  }

  async function handleRefreshWeather() {
    if (!(values.address ?? '').trim()) return
    setWeatherLoading(true)
    const w = await fetchWeatherForAddress(values.address)
    if (w) updateValue('weather', w)
    setWeatherLoading(false)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    try {
      const content: Record<string, unknown> = {
        projectName: (values.projectName ?? '').trim(),
        date: values.date ?? '',
        address: (values.address ?? '').trim(),
        weather: (values.weather ?? '').trim(),
        preparedBy: (values.preparedBy ?? '').trim(),
        siteSupervisor: (values.siteSupervisor ?? '').trim(),
        competentPerson: (values.competentPerson ?? '').trim(),
        tasks: Object.values(selectedTasks),
        signatures,
      }

      for (const [key, val] of Object.entries(values)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string' && val.trim()) {
          content[key] = val.trim()
        }
      }

      const dynamicFields = buildDynamicFields(FORM_KEY, values, templateFields)

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content, dynamic_fields: dynamicFields })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  function renderTasksSection() {
    return (
      <div key="jsa-tasks-section">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tasks</p>
            <button
              type="button"
              onClick={() => setShowTemplateManager(true)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition"
            >
              <SettingsIcon className="w-3 h-3" />
              Manage Tasks
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <label
                key={t.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                  selectedTasks[t.id]
                    ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!selectedTasks[t.id]}
                  onChange={() => toggleTask(t)}
                  className="sr-only"
                />
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                  selectedTasks[t.id] ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                }`}>
                  {selectedTasks[t.id] && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {t.name}
              </label>
            ))}
          </div>
        </div>

        {templates.filter((t) => selectedTasks[t.id]).map((t) => (
          <div key={t.id} className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3 mt-3">
            <p className="text-sm font-bold text-amber-800">{t.name}</p>
            <div>
              <label className={labelCls}>Hazards</label>
              <textarea
                rows={3}
                value={selectedTasks[t.id]?.hazards ?? ''}
                onChange={(e) => updateTask(t.id, 'hazards', e.target.value)}
                className={textareaCls}
              />
            </div>
            <div>
              <label className={labelCls}>Precautions</label>
              <textarea
                rows={3}
                value={selectedTasks[t.id]?.precautions ?? ''}
                onChange={(e) => updateTask(t.id, 'precautions', e.target.value)}
                className={textareaCls}
              />
            </div>
            <div>
              <label className={labelCls}>PPE Required</label>
              <textarea
                rows={2}
                value={selectedTasks[t.id]?.ppe ?? ''}
                onChange={(e) => updateTask(t.id, 'ppe', e.target.value)}
                className={textareaCls}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderField(field: FormField) {
    if (isTaskSectionField(field)) {
      if (field.id === 'jsa-10' || (field.type === 'section_header' && field.label === 'Tasks')) {
        return renderTasksSection()
      }
      return null
    }

    if (isSignatureSectionField(field)) {
      if (field.id === 'jsa-15' || (field.type === 'section_header' && field.label === 'Employee Acknowledgment & Signatures')) {
        return (
          <JsaSignatureSection
            key="jsa-signatures"
            initialSignatures={initialContent.signatures}
            onChange={setSignatures}
          />
        )
      }
      return null
    }

    if (field.type === 'section_header') {
      return (
        <div key={field.id}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{field.label}</p>
        </div>
      )
    }

    const contentKey = getContentKey(FORM_KEY, field)

    if (isWeatherField(FORM_KEY, field)) {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}</label>
          <div className="relative">
            <input
              type="text"
              value={values.weather ?? ''}
              onChange={(e) => updateValue('weather', e.target.value)}
              placeholder="e.g. 72°F, Partly Cloudy, Wind 8 mph"
              className={inputCls}
            />
            <button
              type="button"
              onClick={handleRefreshWeather}
              disabled={weatherLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-amber-600 hover:text-amber-700 font-medium disabled:opacity-40"
            >
              {weatherLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : 'Refresh'}
            </button>
          </div>
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
        <div className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
            <h2 className="text-lg font-semibold text-gray-900">Edit JSA Report</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
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

            {/* Dynamic template fields */}
            {templateFields.map((field) => renderField(field))}
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
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {showTemplateManager && (
        <JsaTemplateManagerModal
          onClose={() => {
            setShowTemplateManager(false)
            setTemplatesLoaded(false)
          }}
        />
      )}
    </Portal>
  )
}
