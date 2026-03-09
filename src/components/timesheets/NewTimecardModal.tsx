'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, LoaderIcon } from 'lucide-react'
import { Project, TimecardEntry, Employee, FormField } from '@/types'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import Portal from '@/components/ui/Portal'

interface NewTimecardModalProps {
  projects: Project[]
  userId: string
  onClose: () => void
  onCreated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const LUNCH_OPTIONS = [0, 15, 30, 45, 60]

const FORM_KEY = 'timesheet'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

const EMPLOYEE_SECTION_IDS = new Set(['ts-05', 'ts-06', 'ts-07', 'ts-08', 'ts-09'])
const EMPLOYEE_SECTION_LABELS = new Set(['Employees', 'Employee Name', 'Time In', 'Time Out', 'Lunch'])

function isEmployeeSectionField(field: FormField): boolean {
  return EMPLOYEE_SECTION_IDS.has(field.id) || EMPLOYEE_SECTION_LABELS.has(field.label)
}

function calcHours(timeIn: string, timeOut: string, lunchMinutes: number): number {
  if (!timeIn || !timeOut) return 0
  const [inH, inM] = timeIn.split(':').map(Number)
  const [outH, outM] = timeOut.split(':').map(Number)
  const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM) - lunchMinutes
  return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100)
}

export default function NewTimecardModal({
  projects,
  userId,
  onClose,
  onCreated,
}: NewTimecardModalProps) {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')

  const [values, setValues] = useState<Record<string, string>>({
    project_name: projects[0]?.name ?? '',
    date: today,
    address: projects[0]?.address ?? '',
  })

  const [entries, setEntries] = useState<TimecardEntry[]>([
    { employee_name: '', time_in: '07:00', time_out: '15:30', lunch_minutes: 30, total_hours: 8 },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  useEffect(() => {
    if (!employeesLoaded) {
      supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) console.error('[NewTimecardModal] Fetch employees failed:', error)
          setEmployees((data as Employee[]) ?? [])
          setEmployeesLoaded(true)
        })
    }
  }, [employeesLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId)
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      updateValue('project_name', project.name)
      updateValue('address', project.address)
    }
  }

  function updateEntry(idx: number, field: keyof TimecardEntry, value: string | number) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e
        const updated = { ...e, [field]: value }
        updated.total_hours = calcHours(updated.time_in, updated.time_out, updated.lunch_minutes)
        return updated
      })
    )
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      { employee_name: '', time_in: '07:00', time_out: '15:30', lunch_minutes: 30, total_hours: 8 },
    ])
  }

  const grandTotal = entries.reduce((s, e) => s + e.total_hours, 0)

  async function handleSubmit() {
    if (!selectedProjectId) {
      setError('Please select a project')
      return
    }

    const validEntries = entries.filter((e) => e.employee_name.trim() && e.time_in && e.time_out)
    if (validEntries.length === 0) {
      setError('Please add at least one employee with time entries')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const gt = Math.round(validEntries.reduce((s, e) => s + e.total_hours, 0) * 100) / 100

      const content: Record<string, unknown> = {
        date: values.date ?? '',
        project_name: (values.project_name ?? '').trim(),
        address: (values.address ?? '').trim(),
        entries: validEntries,
        grand_total_hours: gt,
      }

      for (const [key, val] of Object.entries(values)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string' && val.trim()) {
          content[key] = val.trim()
        }
      }

      const dynamicFields = buildDynamicFields(FORM_KEY, values, templateFields)

      const { error: insertErr } = await supabase.from('feed_posts').insert({
        project_id: selectedProjectId,
        user_id: userId,
        post_type: 'timecard',
        is_pinned: false,
        content,
        dynamic_fields: dynamicFields,
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create timecard')
      setLoading(false)
    }
  }

  function renderEmployeeSection() {
    return (
      <div key="employee-section">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employees</p>
            <button
              type="button"
              onClick={addEntry}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition"
            >
              <PlusIcon className="w-3 h-3" />
              Add Row
            </button>
          </div>
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.employee_name}
                    onChange={(e) => updateEntry(idx, 'employee_name', e.target.value)}
                    placeholder="Employee name"
                    list="new-tc-employee-names"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {entry.total_hours > 0 && (
                    <span className="text-xs font-bold text-blue-700 tabular-nums">{entry.total_hours.toFixed(2)} hrs</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time In</label>
                    <input
                      type="time"
                      value={entry.time_in}
                      onChange={(e) => updateEntry(idx, 'time_in', e.target.value)}
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time Out</label>
                    <input
                      type="time"
                      value={entry.time_out}
                      onChange={(e) => updateEntry(idx, 'time_out', e.target.value)}
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Lunch</label>
                    <select
                      value={entry.lunch_minutes}
                      onChange={(e) => updateEntry(idx, 'lunch_minutes', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {LUNCH_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between mt-3">
          <span className="text-sm font-semibold text-blue-800">Grand Total</span>
          <span className="text-lg font-bold text-blue-900 tabular-nums">{grandTotal.toFixed(2)} hrs</span>
        </div>

        <datalist id="new-tc-employee-names">
          {employees.map((emp) => (
            <option key={emp.id} value={emp.name} />
          ))}
        </datalist>
      </div>
    )
  }

  function renderField(field: FormField) {
    if (isEmployeeSectionField(field)) {
      if (field.id === 'ts-05' || (field.type === 'section_header' && field.label === 'Employees')) {
        return renderEmployeeSection()
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
      <div className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[80vh] md:my-8 bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">New Timecard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

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

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
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

          {templateFields.map((field) => renderField(field))}
        </div>

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
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoaderIcon className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Timecard'
            )}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
