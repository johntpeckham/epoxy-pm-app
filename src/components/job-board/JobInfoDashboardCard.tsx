'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SettingsIcon,
  Maximize2Icon,
  AlertCircleIcon,
  XIcon,
  CheckIcon,
  LoaderIcon,
} from 'lucide-react'
import { Project, ProjectStatus } from '@/types'

interface JobInfoDashboardCardProps {
  project: Project
  onExpand: () => void
  onProjectUpdated: () => void
}

export default function JobInfoDashboardCard({ project, onExpand, onProjectUpdated }: JobInfoDashboardCardProps) {
  const [localProject, setLocalProject] = useState<Project>(project)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Sync when parent project changes
  if (project.id !== localProject.id) {
    setLocalProject(project)
  }

  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(null), 5000)
  }

  const debouncedSave = useCallback((field: string, value: unknown) => {
    const existing = saveTimers.current.get(field)
    if (existing) clearTimeout(existing)

    setSavingField(field)

    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({ [field]: value })
        .eq('id', project.id)

      setSavingField(null)

      if (!error) {
        setSavedField(field)
        setTimeout(() => setSavedField(null), 1500)
        onProjectUpdated()
      } else {
        console.error('[JobInfoCard] Save failed:', error)
        showError(`Failed to save ${field}: ${error.message}`)
      }

      saveTimers.current.delete(field)
    }, 600)

    saveTimers.current.set(field, timer)
  }, [project.id, onProjectUpdated])

  const updateField = (field: keyof Project, value: string | null | boolean | number) => {
    setLocalProject((prev) => ({ ...prev, [field]: value }))
    // Determine the DB value
    let dbValue = value
    if (typeof value === 'string' && value.trim() === '') dbValue = null
    debouncedSave(field, dbValue)
  }

  const inputCls = 'w-full text-sm text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-amber-500 focus:ring-0 px-0 py-0.5 transition-colors placeholder-gray-300'
  const labelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide'

  function SaveIndicator({ field }: { field: string }) {
    if (savingField === field) {
      return <LoaderIcon className="w-3 h-3 text-gray-400 animate-spin flex-shrink-0" />
    }
    if (savedField === field) {
      return <CheckIcon className="w-3 h-3 text-green-500 flex-shrink-0" />
    }
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500"><SettingsIcon className="w-5 h-5" /></span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Job Info</h3>

        {/* Expand button */}
        <button
          onClick={onExpand}
          className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          title="Open full Job Info workspace"
        >
          <Maximize2Icon className="w-4 h-4" />
        </button>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 p-0.5">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {/* Project Name — full width */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Project Name</label>
            <SaveIndicator field="name" />
          </div>
          <input
            type="text"
            value={localProject.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Project name"
            className={inputCls}
          />
        </div>

        {/* Customer */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Customer</label>
            <SaveIndicator field="client_name" />
          </div>
          <input
            type="text"
            value={localProject.client_name}
            onChange={(e) => updateField('client_name', e.target.value)}
            placeholder="Customer name"
            className={inputCls}
          />
        </div>

        {/* Estimate # */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Estimate #</label>
            <SaveIndicator field="estimate_number" />
          </div>
          <input
            type="text"
            value={localProject.estimate_number ?? ''}
            onChange={(e) => updateField('estimate_number', e.target.value)}
            placeholder="—"
            className={inputCls}
          />
        </div>

        {/* Address — full width */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Address</label>
            <SaveIndicator field="address" />
          </div>
          <input
            type="text"
            value={localProject.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="Project address"
            className={inputCls}
          />
        </div>

        {/* Status */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Status</label>
            <SaveIndicator field="status" />
          </div>
          <select
            value={localProject.status}
            onChange={(e) => updateField('status', e.target.value as ProjectStatus)}
            className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-amber-500 focus:ring-0 px-0 py-0.5 transition-colors cursor-pointer"
          >
            <option value="Active">Active</option>
            <option value="Complete">Complete</option>
          </select>
        </div>

        {/* Crew */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Crew</label>
            <SaveIndicator field="crew" />
          </div>
          <input
            type="text"
            value={localProject.crew ?? ''}
            onChange={(e) => updateField('crew', e.target.value)}
            placeholder="—"
            className={inputCls}
          />
        </div>

        {/* Start Date */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>Start Date</label>
            <SaveIndicator field="start_date" />
          </div>
          <input
            type="date"
            value={localProject.start_date ?? ''}
            onChange={(e) => updateField('start_date', e.target.value)}
            className={`${inputCls} cursor-pointer`}
          />
        </div>

        {/* End Date */}
        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls}>End Date</label>
            <SaveIndicator field="end_date" />
          </div>
          <input
            type="date"
            value={localProject.end_date ?? ''}
            onChange={(e) => updateField('end_date', e.target.value)}
            className={`${inputCls} cursor-pointer`}
          />
        </div>

        {/* Notes — full width */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Notes</label>
            <SaveIndicator field="notes" />
          </div>
          <textarea
            value={localProject.notes ?? ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Add notes..."
            rows={2}
            className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-amber-500 focus:ring-0 px-0 py-0.5 transition-colors placeholder-gray-300 resize-none"
          />
        </div>
      </div>
    </div>
  )
}
