'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, ChevronDownIcon, PlusIcon, CheckIcon, ClipboardCheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/estimates/types'
import type { EmployeeProfile } from '@/types'
import { applyDefaultChecklist } from '@/lib/applyDefaultChecklist'

const PRESET_COLORS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
]

interface NewProjectModalProps {
  onClose: () => void
  onCreated: () => void
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('')
  const [estimateNumber, setEstimateNumber] = useState('')
  const [status, setStatus] = useState<'Active' | 'Completed' | 'Closed'>('Active')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeWeekends, setIncludeWeekends] = useState(false)
  const [driveTimeEnabled, setDriveTimeEnabled] = useState(false)
  const [driveTimeDays, setDriveTimeDays] = useState('1')
  const [driveTimePosition, setDriveTimePosition] = useState<'front' | 'back' | 'both'>('both')
  const [crewNames, setCrewNames] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0].value)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Customer selector state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Employee profiles for crew selector
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([])
  const [showCustomCrewInput, setShowCustomCrewInput] = useState(false)
  const [customCrewName, setCustomCrewName] = useState('')

  // Checklist templates
  const [checklistTemplates, setChecklistTemplates] = useState<{ id: string; name: string }[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    async function fetchData() {
      const [custResult, empResult, tmplResult] = await Promise.all([
        supabase.from('customers').select('*').order('name', { ascending: true }),
        supabase.from('employee_profiles').select('*').order('name', { ascending: true }),
        supabase.from('checklist_templates').select('id, name, is_default, is_closeout').order('name', { ascending: true }),
      ])
      if (custResult.data) setCustomers(custResult.data)
      if (empResult.data) setEmployeeProfiles(empResult.data as EmployeeProfile[])
      // Filter out default and closeout templates from manual selection (they're auto-applied)
      if (tmplResult.data) setChecklistTemplates(tmplResult.data.filter((t: { is_default?: boolean; is_closeout?: boolean }) => !t.is_default && !t.is_closeout))
    }
    fetchData()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    if (showCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomerDropdown])

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  )

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
      // Just select the existing employee
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
      // Fall back to just adding the name locally
      if (!crewNames.includes(n)) setCrewNames((prev) => [...prev, n])
    } else if (data) {
      // Add the new profile to local state so it renders as a proper pill
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

    if (startDate && endDate && endDate < startDate) {
      setError('End date must be on or after start date')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: newProject, error } = await supabase.from('projects').insert({
      name: name.trim(),
      client_name: clientName.trim(),
      address: address.trim(),
      status,
      ...(estimateNumber.trim() ? { estimate_number: estimateNumber.trim() } : {}),
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
      include_weekends: includeWeekends,
      crew: crewNames.join(', ') || null,
      notes: notes.trim() || null,
      color,
      drive_time_enabled: driveTimeEnabled,
      drive_time_days: Math.max(1, Math.min(30, parseInt(driveTimeDays) || 1)),
      drive_time_position: driveTimePosition,
    }).select('id, start_date').single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Auto-apply the default "Project Checklist" template
    if (newProject) {
      await applyDefaultChecklist(supabase, newProject.id, newProject.start_date)
    }

    // Apply selected checklist templates
    if (newProject && selectedTemplateIds.length > 0) {
      for (const templateId of selectedTemplateIds) {
        const { data: templateItems } = await supabase
          .from('checklist_template_items')
          .select('*')
          .eq('template_id', templateId)
          .order('sort_order', { ascending: true })

        const { data: template } = await supabase
          .from('checklist_templates')
          .select('name')
          .eq('id', templateId)
          .single()

        if (templateItems && templateItems.length > 0) {
          const projectItems = templateItems.map((item: Record<string, unknown>) => ({
            project_id: newProject.id,
            name: item.name,
            is_complete: false,
            assigned_to: item.default_assignee_id || null,
            due_date: item.default_due_days && newProject.start_date
              ? new Date(new Date(newProject.start_date).getTime() + (item.default_due_days as number) * 86400000).toISOString().split('T')[0]
              : null,
            notes: item.default_notes || null,
            group_name: template?.name || 'Template',
          }))

          await supabase.from('project_checklist_items').insert(projectItems)
        }
      }
    }

    onCreated()
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
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
                placeholder="e.g. Aircraft Hangar Coating"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                placeholder="e.g. John Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <div className="relative mt-1" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => { setShowCustomerDropdown(!showCustomerDropdown); setCustomerSearch('') }}
                  className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  Select existing customer
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
                {showCustomerDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No customers found.</p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClientName(c.name)
                              setShowCustomerDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                          >
                            <p className="text-gray-900 text-xs font-medium truncate">{c.name}</p>
                            {c.company && <p className="text-gray-500 text-xs truncate">{c.company}</p>}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
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
                placeholder="e.g. 123 Main St, Austin TX"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Active' | 'Completed' | 'Closed')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {/* Calendar Dates (optional) */}
            <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
              <div className="w-1/2 sm:w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="w-1/2 sm:w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Include Weekends?</label>
              <button
                type="button"
                role="switch"
                aria-checked={includeWeekends}
                onClick={() => setIncludeWeekends(!includeWeekends)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${includeWeekends ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${includeWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
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
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${driveTimeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {driveTimeEnabled && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Days</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={30}
                        value={driveTimeDays}
                        onChange={(e) => setDriveTimeDays(e.target.value)}
                        onBlur={() => {
                          const num = parseInt(driveTimeDays)
                          if (!num || num < 1) setDriveTimeDays('1')
                          else if (num > 30) setDriveTimeDays('30')
                          else setDriveTimeDays(String(num))
                        }}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                      className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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

            {/* Checklist Templates */}
            {checklistTemplates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <ClipboardCheckIcon className="w-4 h-4 text-gray-400" />
                  Checklist Templates
                </label>
                <p className="text-xs text-gray-400 mb-2">Select templates to auto-apply when the project is created.</p>
                <div className="flex flex-wrap gap-2">
                  {checklistTemplates.map((tmpl) => {
                    const isSelected = selectedTemplateIds.includes(tmpl.id)
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplateIds(prev =>
                          isSelected ? prev.filter(id => id !== tmpl.id) : [...prev, tmpl.id]
                        )}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-amber-300 hover:bg-amber-50'
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3 h-3" />}
                        {tmpl.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
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
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  )
}
