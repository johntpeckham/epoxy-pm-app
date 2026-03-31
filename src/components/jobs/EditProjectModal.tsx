'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, CheckIcon } from 'lucide-react'
import { Project } from '@/types'
import type { EmployeeProfile } from '@/types'
import Portal from '@/components/ui/Portal'

const PRESET_COLORS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
]

interface EditProjectModalProps {
  project: Project
  onClose: () => void
  onUpdated: () => void
}

export default function EditProjectModal({ project, onClose, onUpdated }: EditProjectModalProps) {
  const [name, setName] = useState(project.name)
  const [clientName, setClientName] = useState(project.client_name)
  const [address, setAddress] = useState(project.address)
  const [estimateNumber, setEstimateNumber] = useState(project.estimate_number ?? '')
  const [status, setStatus] = useState<'Active' | 'Complete'>(project.status)
  const [driveTimeEnabled, setDriveTimeEnabled] = useState(project.drive_time_enabled ?? false)
  const [driveTimeDays, setDriveTimeDays] = useState(project.drive_time_days ?? 1)
  const [driveTimePosition, setDriveTimePosition] = useState<'front' | 'back' | 'both'>(project.drive_time_position ?? 'both')
  const [crewNames, setCrewNames] = useState<string[]>(
    project.crew ? project.crew.split(',').map((s) => s.trim()).filter(Boolean) : []
  )
  const [notes, setNotes] = useState(project.notes || '')
  const [color, setColor] = useState(project.color || PRESET_COLORS[0].value)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Employee profiles for crew selector
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([])
  const [showCustomCrewInput, setShowCustomCrewInput] = useState(false)
  const [customCrewName, setCustomCrewName] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('employee_profiles')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setEmployeeProfiles(data as EmployeeProfile[])
      })
  }, [])

  function toggleCrewMember(crewName: string) {
    setCrewNames((prev) =>
      prev.includes(crewName) ? prev.filter((n) => n !== crewName) : [...prev, crewName]
    )
  }

  async function addCustomCrewMember() {
    const n = customCrewName.trim()
    if (!n) return

    // Check if an employee with this name already exists in the loaded profiles
    const existing = employeeProfiles.find((emp) => emp.name.toLowerCase() === n.toLowerCase())
    if (existing) {
      if (!crewNames.includes(existing.name)) setCrewNames((prev) => [...prev, existing.name])
      setCustomCrewName('')
      setShowCustomCrewInput(false)
      return
    }

    // Insert new employee into employee_profiles
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('employee_profiles')
      .insert({ name: n })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create employee:', insertError)
      if (!crewNames.includes(n)) setCrewNames((prev) => [...prev, n])
    } else if (data) {
      setEmployeeProfiles((prev) => [...prev, data as EmployeeProfile])
      if (!crewNames.includes(data.name)) setCrewNames((prev) => [...prev, data.name])
    }

    setCustomCrewName('')
    setShowCustomCrewInput(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .update({
        name: name.trim(),
        client_name: clientName.trim(),
        address: address.trim(),
        status,
        estimate_number: estimateNumber.trim() || null,
        crew: crewNames.join(', ') || null,
        notes: notes.trim() || null,
        color,
        drive_time_enabled: driveTimeEnabled,
        drive_time_days: driveTimeDays,
        drive_time_position: driveTimePosition,
      })
      .eq('id', project.id)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      onUpdated()
    }
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Edit Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Estimate #
              </label>
              <input
                type="text"
                value={estimateNumber}
                onChange={(e) => setEstimateNumber(e.target.value)}
                placeholder="e.g. EST-1042"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Active' | 'Complete')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              >
                <option value="Active">Active</option>
                <option value="Complete">Complete</option>
              </select>
            </div>

            {/* Drive Time */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Drive Time</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={driveTimeEnabled}
                  onClick={() => setDriveTimeEnabled(!driveTimeEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${driveTimeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${driveTimeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {driveTimeEnabled && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Days</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={driveTimeDays}
                      onChange={(e) => setDriveTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-1">
                    {(['front', 'back', 'both'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setDriveTimePosition(pos)}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                          driveTimePosition === pos
                            ? 'bg-gray-900 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {pos.charAt(0).toUpperCase() + pos.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Crew */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Crew</label>
              <div className="flex flex-wrap gap-2">
                {employeeProfiles.map((emp) => {
                  const isSelected = crewNames.includes(emp.name)
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggleCrewMember(emp.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {emp.name}
                    </button>
                  )
                })}
                {showCustomCrewInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={customCrewName}
                      onChange={(e) => setCustomCrewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCrewMember() } if (e.key === 'Escape') { setShowCustomCrewInput(false); setCustomCrewName('') } }}
                      placeholder="Name"
                      className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button type="button" onClick={addCustomCrewMember} className="text-green-600 hover:text-green-700 p-0.5">
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => { setShowCustomCrewInput(false); setCustomCrewName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomCrewInput(true)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Employee
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.label}
                    className={`w-8 h-8 rounded-full border-2 transition ${
                      color === c.value
                        ? 'border-gray-800 scale-110'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
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
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  )
}
