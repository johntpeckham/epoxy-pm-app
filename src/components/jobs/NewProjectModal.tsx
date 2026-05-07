'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, ChevronDownIcon, PlusIcon, CheckIcon, ClipboardCheckIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import type { Customer } from '@/components/proposals/types'
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [assignedProjectNumber, setAssignedProjectNumber] = useState<number | null>(null)
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

  // Company selector state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showNewCompanyForm, setShowNewCompanyForm] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyAddress, setNewCompanyAddress] = useState('')
  const [newCompanyCity, setNewCompanyCity] = useState('')
  const [newCompanyState, setNewCompanyState] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)

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
      const [custResult, empResult, tmplResult, estNumResult, projNumResult] = await Promise.all([
        supabase
          .from('companies')
          .select('*')
          .eq('archived', false)
          .eq('status', 'active')
          .order('name', { ascending: true }),
        supabase.from('employee_profiles').select('*').order('name', { ascending: true }),
        supabase.from('checklist_templates').select('id, name, is_default, is_closeout').order('name', { ascending: true }),
        supabase.from('estimating_projects').select('project_number'),
        supabase.from('projects').select('proposal_number'),
      ])
      if (custResult.error) {
        console.error('[NEW PROJECT COMPANIES FETCH ERROR]', {
          code: custResult.error.code,
          message: custResult.error.message,
          hint: custResult.error.hint,
          details: custResult.error.details,
        })
      }
      if (estNumResult.error) {
        console.error('[NEW PROJECT EST NUMBERS FETCH ERROR]', {
          code: estNumResult.error.code,
          message: estNumResult.error.message,
          hint: estNumResult.error.hint,
          details: estNumResult.error.details,
        })
      }
      if (projNumResult.error) {
        console.error('[NEW PROJECT PROJ NUMBERS FETCH ERROR]', {
          code: projNumResult.error.code,
          message: projNumResult.error.message,
          hint: projNumResult.error.hint,
          details: projNumResult.error.details,
        })
      }
      if (custResult.data) setCustomers(custResult.data)
      if (empResult.data) setEmployeeProfiles(empResult.data as EmployeeProfile[])
      // Filter out default and closeout templates from manual selection (they're auto-applied)
      if (tmplResult.data) setChecklistTemplates(tmplResult.data.filter((t: { is_default?: boolean; is_closeout?: boolean }) => !t.is_default && !t.is_closeout))

      // Compute next project number as max(existing across both tables) + 1.
      // Project numbers are stored as text; extract the first run of digits.
      let maxNumeric = 999 // so the first project becomes 1000
      const consider = (raw: unknown) => {
        if (typeof raw !== 'string' && typeof raw !== 'number') return
        const m = String(raw).match(/(\d+)/)
        if (!m) return
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && n > maxNumeric) maxNumeric = n
      }
      for (const r of (estNumResult.data ?? []) as { project_number: unknown }[]) {
        consider(r.project_number)
      }
      for (const r of (projNumResult.data ?? []) as { proposal_number: unknown }[]) {
        consider(r.proposal_number)
      }
      setAssignedProjectNumber(maxNumeric + 1)
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

  async function handleCreateNewCompany() {
    if (!newCompanyName.trim()) return
    setCreatingCompany(true)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('companies')
      .insert({
        name: newCompanyName.trim(),
        address: newCompanyAddress.trim() || null,
        city: newCompanyCity.trim() || null,
        state: newCompanyState.trim() || null,
        status: 'prospect',
        archived: false,
      })
      .select()
      .single()
    setCreatingCompany(false)
    if (err || !data) return
    const newCust = data as Customer
    setCustomers((prev) => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedCompanyId(newCust.id)
    if (newCust.address) {
      const parts = [newCust.address, newCust.city, newCust.state].filter(Boolean)
      setAddress(parts.join(', '))
    }
    setShowNewCompanyForm(false)
    setShowCustomerDropdown(false)
    setNewCompanyName('')
    setNewCompanyAddress('')
    setNewCompanyCity('')
    setNewCompanyState('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!selectedCompanyId) {
      setError('Please select a company')
      setLoading(false)
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError('End date must be on or after start date')
      setLoading(false)
      return
    }

    const selectedCompany = customers.find((c) => c.id === selectedCompanyId)
    const supabase = createClient()
    const { data: newProject, error } = await supabase.from('projects').insert({
      name: name.trim(),
      company_id: selectedCompanyId,
      client_name: selectedCompany?.name ?? '',
      address: address.trim(),
      status,
      ...(assignedProjectNumber !== null ? { proposal_number: String(assignedProjectNumber) } : {}),
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
      console.error('[NEW PROJECT INSERT ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
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
                Company <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => { setShowCustomerDropdown(!showCustomerDropdown); setCustomerSearch(''); setShowNewCompanyForm(false) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <span className={selectedCompanyId ? 'text-gray-900' : 'text-gray-400'}>
                    {customers.find((c) => c.id === selectedCompanyId)?.name ?? 'Select a company...'}
                  </span>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                </button>
                {showCustomerDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        placeholder="Search companies..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        autoFocus
                      />
                    </div>
                    {showNewCompanyForm ? (
                      <div className="p-3 space-y-2 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder="Company name *"
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          autoFocus
                        />
                        <input
                          type="text"
                          placeholder="Address"
                          value={newCompanyAddress}
                          onChange={(e) => setNewCompanyAddress(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="City"
                            value={newCompanyCity}
                            onChange={(e) => setNewCompanyCity(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="State"
                            value={newCompanyState}
                            onChange={(e) => setNewCompanyState(e.target.value)}
                            className="w-20 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowNewCompanyForm(false)}
                            className="flex-1 px-2 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateNewCompany}
                            disabled={!newCompanyName.trim() || creatingCompany}
                            className="flex-1 px-2 py-1.5 text-xs text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50"
                          >
                            {creatingCompany ? 'Creating...' : 'Create'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-y-auto flex-1">
                          {filteredCustomers.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-400">No companies found.</p>
                          ) : (
                            filteredCustomers.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCompanyId(c.id)
                                  setShowCustomerDropdown(false)
                                  const parts = [c.address, c.city, c.state].filter(Boolean)
                                  if (parts.length > 0 && !address) setAddress(parts.join(', '))
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                              >
                                <p className="text-gray-900 text-xs font-medium truncate">{c.name}</p>
                                {(c.city || c.state) && (
                                  <p className="text-gray-500 text-xs truncate">{[c.city, c.state].filter(Boolean).join(', ')}</p>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowNewCompanyForm(true)}
                          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-amber-600 hover:bg-amber-50 border-t border-gray-100 transition-colors"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          Add new company
                        </button>
                      </>
                    )}
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
                Project #
              </label>
              <input
                type="text"
                readOnly
                value={assignedProjectNumber !== null ? `#${assignedProjectNumber}` : '…'}
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 cursor-default focus:outline-none"
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
