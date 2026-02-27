'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, LoaderIcon } from 'lucide-react'
import { TimecardContent, TimecardEntry, Employee } from '@/types'

interface EditTimecardModalProps {
  postId: string
  initialContent: TimecardContent
  onClose: () => void
  onUpdated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'
const LUNCH_OPTIONS = [0, 15, 30, 45, 60]

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
  const [projectName, setProjectName] = useState(initialContent.project_name)
  const [date, setDate] = useState(initialContent.date)
  const [address, setAddress] = useState(initialContent.address)
  const [entries, setEntries] = useState<TimecardEntry[]>(
    initialContent.entries.map((e) => ({ ...e }))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load employee roster for adding
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)

  useEffect(() => {
    if (!employeesLoaded) {
      supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data }) => {
          setEmployees((data as Employee[]) ?? [])
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
    const validEntries = entries.filter((e) => e.employee_name.trim() && e.time_in && e.time_out)
    if (validEntries.length === 0) {
      setError('Please add at least one employee with time entries')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const gt = Math.round(validEntries.reduce((s, e) => s + e.total_hours, 0) * 100) / 100

      const updatedContent: TimecardContent = {
        date,
        project_name: projectName.trim(),
        address: address.trim(),
        entries: validEntries,
        grand_total_hours: gt,
      }

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content: updatedContent })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Edit Timecard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Project info */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Info</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* Employee entries */}
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
                      list="employee-names"
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

          {/* Grand total */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-800">Grand Total</span>
            <span className="text-lg font-bold text-blue-900 tabular-nums">{grandTotal.toFixed(2)} hrs</span>
          </div>

          {/* Datalist for employee name suggestions */}
          <datalist id="employee-names">
            {employees.map((emp) => (
              <option key={emp.id} value={emp.name} />
            ))}
          </datalist>
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
            disabled={loading}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
