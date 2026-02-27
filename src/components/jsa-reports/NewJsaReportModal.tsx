'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, SettingsIcon, LoaderIcon } from 'lucide-react'
import { Project, JsaTaskTemplate, JsaTaskEntry, JsaSignatureEntry } from '@/types'
import { fetchWeatherForAddress } from '@/lib/fetchWeather'
import JsaTemplateManagerModal from './JsaTemplateManagerModal'
import JsaSignatureSection from './JsaSignatureSection'

interface NewJsaReportModalProps {
  projects: Project[]
  userId: string
  onClose: () => void
  onCreated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function NewJsaReportModal({
  projects,
  userId,
  onClose,
  onCreated,
}: NewJsaReportModalProps) {
  const today = new Date().toISOString().split('T')[0]

  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')
  const [projectName, setProjectName] = useState(projects[0]?.name ?? '')
  const [date, setDate] = useState(today)
  const [address, setAddress] = useState(projects[0]?.address ?? '')
  const [weather, setWeather] = useState('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [preparedBy, setPreparedBy] = useState('')
  const [siteSupervisor, setSiteSupervisor] = useState('')
  const [competentPerson, setCompetentPerson] = useState('')

  const [templates, setTemplates] = useState<JsaTaskTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [selectedTasks, setSelectedTasks] = useState<Record<string, JsaTaskEntry>>({})
  const [signatures, setSignatures] = useState<JsaSignatureEntry[]>([])
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch templates
  useEffect(() => {
    if (!templatesLoaded) {
      const supabase = createClient()
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
  }, [templatesLoaded])

  // Auto-fetch weather for initial project
  useEffect(() => {
    if (projects[0]?.address) {
      console.log('[NewJsaReportModal] Fetching weather for initial project:', projects[0].address)
      setWeatherLoading(true)
      fetchWeatherForAddress(projects[0].address).then((w) => {
        console.log('[NewJsaReportModal] Weather result:', w)
        if (w) setWeather(w)
        setWeatherLoading(false)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId)
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setProjectName(project.name)
      setAddress(project.address)
      // Fetch weather for new project address
      console.log('[NewJsaReportModal] Project changed, fetching weather for:', project.address)
      setWeatherLoading(true)
      setWeather('')
      fetchWeatherForAddress(project.address).then((w) => {
        console.log('[NewJsaReportModal] Weather result for changed project:', w)
        if (w) setWeather(w)
        setWeatherLoading(false)
      })
    }
  }

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

  async function handleSubmit() {
    if (!selectedProjectId) {
      setError('Please select a project')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      const tasks = Object.values(selectedTasks)

      const { error: insertErr } = await supabase.from('feed_posts').insert({
        project_id: selectedProjectId,
        user_id: userId,
        post_type: 'jsa_report',
        is_pinned: false,
        content: {
          projectName: projectName.trim(),
          date,
          address: address.trim(),
          weather: weather.trim(),
          preparedBy: preparedBy.trim(),
          siteSupervisor: siteSupervisor.trim(),
          competentPerson: competentPerson.trim(),
          tasks,
          signatures,
        },
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">New JSA Report</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable form */}
          <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
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

            {/* Project Info */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Info</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Project Name</label>
                  <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Weather</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={weather}
                      onChange={(e) => setWeather(e.target.value)}
                      placeholder={weatherLoading ? 'Fetching weather...' : 'e.g. 72°F, Partly Cloudy, Wind 8 mph'}
                      className={inputCls}
                    />
                    {weatherLoading && (
                      <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Personnel */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Personnel</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Prepared By</label>
                  <input type="text" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Name" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Site Supervisor</label>
                  <input type="text" value={siteSupervisor} onChange={(e) => setSiteSupervisor(e.target.value)} placeholder="Name" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Competent Person</label>
                  <input type="text" value={competentPerson} onChange={(e) => setCompetentPerson(e.target.value)} placeholder="Name" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Task Checkboxes */}
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

            {/* Dynamic Task Sections */}
            {templates.filter((t) => selectedTasks[t.id]).map((t) => (
              <div key={t.id} className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
                <p className="text-sm font-bold text-amber-800">{t.name}</p>
                <div>
                  <label className={labelCls}>Hazards</label>
                  <textarea
                    rows={3}
                    value={selectedTasks[t.id]?.hazards ?? ''}
                    onChange={(e) => updateTask(t.id, 'hazards', e.target.value)}
                    placeholder="Identified hazards..."
                    className={textareaCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Precautions</label>
                  <textarea
                    rows={3}
                    value={selectedTasks[t.id]?.precautions ?? ''}
                    onChange={(e) => updateTask(t.id, 'precautions', e.target.value)}
                    placeholder="Safety precautions..."
                    className={textareaCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>PPE Required</label>
                  <textarea
                    rows={2}
                    value={selectedTasks[t.id]?.ppe ?? ''}
                    onChange={(e) => updateTask(t.id, 'ppe', e.target.value)}
                    placeholder="Required PPE..."
                    className={textareaCls}
                  />
                </div>
              </div>
            ))}

            {/* Employee Acknowledgment & Signatures */}
            <JsaSignatureSection onChange={setSignatures} />
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
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
              {loading ? 'Submitting...' : 'Submit JSA Report'}
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
    </>
  )
}
