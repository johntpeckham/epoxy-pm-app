'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, LoaderIcon, PencilIcon } from 'lucide-react'
import { TimecardContent, TimecardEntry, EmployeeProfile, FormField } from '@/types'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Portal from '@/components/ui/Portal'

interface EditTimecardModalProps {
  postId: string
  initialContent: TimecardContent
  onClose: () => void
  onUpdated: () => void
}

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

export default function EditTimecardModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditTimecardModalProps) {
  const supabase = createClient()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {
      project_name: initialContent.project_name ?? '',
      date: initialContent.date ?? '',
      address: initialContent.address ?? '',
    }
    const rawContent = initialContent as unknown as Record<string, unknown>
    for (const [key, val] of Object.entries(rawContent)) {
      if (!KNOWN_KEYS.has(key) && key !== 'entries' && key !== 'grand_total_hours' && typeof val === 'string') {
        v[key] = val
      }
    }
    return v
  })

  const [entries, setEntries] = useState<TimecardEntry[]>(
    initialContent.entries.map((e) => ({ ...e }))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [driveTimeEnabled, setDriveTimeEnabled] = useState(() =>
    initialContent.entries.some((e) => e.drive_time != null && e.drive_time > 0)
  )

  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [syncTimes, setSyncTimes] = useState(false)
  const [showUnsyncConfirm, setShowUnsyncConfirm] = useState(false)
  const [masterTimeIn, setMasterTimeIn] = useState('07:00')
  const [masterTimeOut, setMasterTimeOut] = useState('15:30')
  const [masterLunchMinutes, setMasterLunchMinutes] = useState(30)

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  useEffect(() => {
    if (!employeesLoaded) {
      supabase
        .from('employee_profiles')
        .select('*')
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) console.error('[EditTimecardModal] Fetch employees failed:', error)
          setEmployees((data as EmployeeProfile[]) ?? [])
          setEmployeesLoaded(true)
        })
    }
  }, [employeesLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function updateMasterTime(field: 'time_in' | 'time_out' | 'lunch_minutes', value: string | number) {
    const newTimeIn = field === 'time_in' ? value as string : masterTimeIn
    const newTimeOut = field === 'time_out' ? value as string : masterTimeOut
    const newLunch = field === 'lunch_minutes' ? value as number : masterLunchMinutes
    if (field === 'time_in') setMasterTimeIn(value as string)
    if (field === 'time_out') setMasterTimeOut(value as string)
    if (field === 'lunch_minutes') setMasterLunchMinutes(value as number)
    const hours = calcHours(newTimeIn, newTimeOut, newLunch)
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        time_in: newTimeIn,
        time_out: newTimeOut,
        lunch_minutes: newLunch,
        total_hours: hours,
      }))
    )
  }

  function updateDriveTime(idx: number, value: number | null) {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, drive_time: value } : e))
    )
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  function addEntry() {
    const defaults = syncTimes
      ? { time_in: masterTimeIn, time_out: masterTimeOut, lunch_minutes: masterLunchMinutes, total_hours: calcHours(masterTimeIn, masterTimeOut, masterLunchMinutes) }
      : { time_in: '07:00', time_out: '15:30', lunch_minutes: 30, total_hours: 8 }
    setEntries((prev) => [
      ...prev,
      { employee_name: '', ...defaults },
    ])
  }

  function handleSyncToggle(checked: boolean) {
    if (checked) {
      const source = entries.length > 0 ? entries[0] : { time_in: '07:00', time_out: '15:30', lunch_minutes: 30 }
      setMasterTimeIn(source.time_in)
      setMasterTimeOut(source.time_out)
      setMasterLunchMinutes(source.lunch_minutes)
      const hours = calcHours(source.time_in, source.time_out, source.lunch_minutes)
      setEntries((prev) =>
        prev.map((e) => ({
          ...e,
          time_in: source.time_in,
          time_out: source.time_out,
          lunch_minutes: source.lunch_minutes,
          total_hours: hours,
        }))
      )
      setSyncTimes(true)
    } else {
      setShowUnsyncConfirm(true)
    }
  }

  const grandTotal = entries.reduce((s, e) => s + e.total_hours, 0)

  async function handleSubmit() {
    const validEntries = entries
      .filter((e) => e.employee_name.trim() && e.time_in && e.time_out)
      .map((e) => ({
        ...e,
        drive_time: driveTimeEnabled ? (e.drive_time ?? null) : null,
      }))
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

  function renderEmployeeSection() {
    const inputTimeCls = 'w-1/2 sm:w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
    const disabledInputCls = 'w-1/2 sm:w-full border border-gray-100 rounded-md px-2 py-1.5 text-xs text-gray-400 bg-gray-50 cursor-not-allowed'
    const selectCls = 'w-1/2 sm:w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
    const disabledSelectCls = 'w-1/2 sm:w-full border border-gray-100 rounded-md px-2 py-1.5 text-xs text-gray-400 bg-gray-50 cursor-not-allowed'

    return (
      <div key="employee-section">
        {/* Drive time toggle */}
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2.5 mb-4"
          style={{ backgroundColor: 'rgba(24,95,165,0.05)', border: '1px solid rgba(24,95,165,0.15)' }}
        >
          <div>
            <span className="text-xs font-medium" style={{ color: '#185FA5' }}>Drive time</span>
            <p className="text-[10px] text-gray-400 mt-0.5">Not included in OT calculations</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={driveTimeEnabled}
            onClick={() => setDriveTimeEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${driveTimeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${driveTimeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employees</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncTimes}
                  onChange={(e) => handleSyncToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-[11px] font-medium text-gray-500">Sync All Times</span>
              </label>
              <button
                type="button"
                onClick={addEntry}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition"
              >
                <PlusIcon className="w-3 h-3" />
                Add Row
              </button>
            </div>
          </div>

          {/* Master time entry (when synced) */}
          {syncTimes && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 mb-3">
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Set Times for All</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time In</label>
                  <input
                    type="time"
                    value={masterTimeIn}
                    onChange={(e) => updateMasterTime('time_in', e.target.value)}
                    className={inputTimeCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time Out</label>
                  <input
                    type="time"
                    value={masterTimeOut}
                    onChange={(e) => updateMasterTime('time_out', e.target.value)}
                    className={inputTimeCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Lunch</label>
                  <select
                    value={masterLunchMinutes}
                    onChange={(e) => updateMasterTime('lunch_minutes', Number(e.target.value))}
                    className={selectCls}
                  >
                    {LUNCH_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className={`border rounded-lg p-3 space-y-2 ${syncTimes ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.employee_name}
                    onChange={(e) => updateEntry(idx, 'employee_name', e.target.value)}
                    placeholder="Employee name"
                    list="employee-names"
                    className={`flex-1 border rounded-md px-2 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${syncTimes ? 'border-gray-100 text-gray-500' : 'border-gray-200 text-gray-900'}`}
                  />
                  {entry.total_hours > 0 && (
                    <span className={`text-xs font-bold tabular-nums ${syncTimes ? 'text-blue-400' : 'text-blue-700'}`}>{entry.total_hours.toFixed(2)} hrs</span>
                  )}
                  {syncTimes && (
                    <button
                      type="button"
                      onClick={() => setShowUnsyncConfirm(true)}
                      className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                      title="Edit individually"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="-mr-1 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time In</label>
                    <input
                      type="time"
                      value={entry.time_in}
                      onChange={(e) => updateEntry(idx, 'time_in', e.target.value)}
                      disabled={syncTimes}
                      className={syncTimes ? disabledInputCls : inputTimeCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time Out</label>
                    <input
                      type="time"
                      value={entry.time_out}
                      onChange={(e) => updateEntry(idx, 'time_out', e.target.value)}
                      disabled={syncTimes}
                      className={syncTimes ? disabledInputCls : inputTimeCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Lunch</label>
                    <select
                      value={entry.lunch_minutes}
                      onChange={(e) => updateEntry(idx, 'lunch_minutes', Number(e.target.value))}
                      disabled={syncTimes}
                      className={syncTimes ? disabledSelectCls : selectCls}
                    >
                      {LUNCH_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                  </div>
                </div>
                {driveTimeEnabled && (
                  <div className="pt-2" style={{ borderTop: '0.5px solid rgba(24,95,165,0.15)' }}>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase mb-0.5" style={{ color: '#185FA5' }}>Drive</label>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.25}
                        value={entry.drive_time != null ? entry.drive_time : ''}
                        onChange={(e) => updateDriveTime(idx, e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="hrs"
                        className="border rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                        style={{ color: '#185FA5', borderColor: 'rgba(24,95,165,0.3)', width: 84 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between mt-3">
          <span className="text-sm font-semibold text-blue-800">Grand Total</span>
          <span className="text-lg font-bold text-blue-900 tabular-nums">{grandTotal.toFixed(2)} hrs</span>
        </div>

        <datalist id="employee-names">
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
    <>
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Edit Timecard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
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

          {templateFields.map((field) => renderField(field))}
        </div>

        <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
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
    {showUnsyncConfirm && (
      <ConfirmDialog
        title="Turn Off Sync?"
        message="Times will no longer be synced. Each employee will keep their current times but can be edited independently."
        confirmLabel="Turn Off"
        onConfirm={() => { setSyncTimes(false); setShowUnsyncConfirm(false) }}
        onCancel={() => setShowUnsyncConfirm(false)}
      />
    )}
    </>
  )
}
