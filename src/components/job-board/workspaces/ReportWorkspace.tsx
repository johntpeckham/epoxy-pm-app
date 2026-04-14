'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { ClipboardListIcon, Loader2Icon, PrinterIcon, FileDownIcon, PlusIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Project, ProjectReportData, FormField } from '@/types'
import type { UserRole } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import { useMaterialSystems } from '@/lib/useMaterialSystems'
import MaterialSystemPicker from '@/components/ui/MaterialSystemPicker'
import type { MaterialSystemRow } from '@/components/ui/MaterialSystemPicker'
import WorkspaceShell from '../WorkspaceShell'

interface ChecklistSectionData {
  name: string
  items: { id: string; text: string; sort_order: number }[]
}

export interface ChecklistInstanceRow {
  id: string
  fieldId: string
  checklistId: string
  checklistName: string
  responses: Record<string, boolean>
}

interface ReportWorkspaceProps {
  project: Project
  userId: string
  userRole?: UserRole
  onBack: () => void
}

const emptyReport: ProjectReportData = {
  project_name: '',
  estimate_number: '',
  address: '',
  client_name: '',
  client_email: '',
  client_phone: '',
  site_contact: '',
  prevailing_wage: '',
  bonding_insurance: '',
  bid_date: '',
  bid_platform: '',
  project_details_notes: '',
  start_date: '',
  finish_date: '',
  num_mobilizations: '',
  working_hours: '',
  durations_notes: '',
  scope_description: '',
  num_rooms_sections: '',
  square_footages: '',
  linear_footage: '',
  cove_curb_height: '',
  room_numbers_names: '',
  open_areas_machines: '',
  scope_notes: '',
  power_supplied: '',
  lighting_requirements: '',
  heating_cooling_requirements: '',
  rental_requirements: '',
  rental_location: '',
  rental_duration: '',
  site_notes: '',
  hotel_name: '',
  hotel_location: '',
  reservation_number: '',
  reservation_contact: '',
  credit_card_auth: '',
  drive_time: '',
  per_diem: '',
  vehicles: '',
  trailers: '',
  travel_notes: '',
  prep_method: '',
  prep_removal: '',
  patching_materials: '',
  joint_requirements: '',
  sloping_requirements: '',
  backfill_patching: '',
  wet_area: '',
  climate_concerns: '',
  cooling_heating_constraints: '',
  prep_notes: '',
}

const FORM_KEY = 'project_report'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

export default function ReportWorkspace({ project, userId, userRole = 'crew', onBack }: ReportWorkspaceProps) {
  const readOnly = userRole === 'foreman'
  const projectId = project.id
  const projectName = project.name
  const { settings: companySettings } = useCompanySettings()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)
  const [formData, setFormData] = useState<ProjectReportData>(emptyReport)
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const { systems: materialSystems, addSystem: addMaterialSystem, updateSystem: updateMaterialSystem } = useMaterialSystems()
  const [materialRows, setMaterialRows] = useState<MaterialSystemRow[]>([])
  const [checklistData, setChecklistData] = useState<Map<string, ChecklistSectionData>>(new Map())
  const [checklistResponses, setChecklistResponses] = useState<Map<string, boolean>>(new Map())
  const [allChecklistTemplates, setAllChecklistTemplates] = useState<{ id: string; name: string; items: { id: string; text: string; sort_order: number }[] }[]>([])
  const [checklistSelections, setChecklistSelections] = useState<Map<string, string>>(new Map())
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstanceRow[]>([])
  const checklistDropdownRef = useRef<HTMLDivElement>(null)
  const [checklistDropdownFieldId, setChecklistDropdownFieldId] = useState<string | null>(null)
  const [checklistSearchQuery, setChecklistSearchQuery] = useState('')
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initialLoadDoneRef = useRef(false)

  const projectDefaults: Partial<ProjectReportData> = {
    project_name: project.name,
    client_name: project.client_name,
    address: project.address,
    estimate_number: project.estimate_number ?? '',
  }

  const loadReport = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('project_reports')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    if (fetchError) {
      setError(fetchError.message)
    } else if (data) {
      const savedData = data.data as Record<string, unknown>
      setFormData({ ...emptyReport, ...(savedData as unknown as ProjectReportData) })
      const custom: Record<string, string> = {}
      for (const [key, val] of Object.entries(savedData)) {
        if (!KNOWN_KEYS.has(key) && key !== 'material_system_rows' && key !== 'checklist_instances' && typeof val === 'string') {
          custom[key] = val
        }
      }
      setCustomValues(custom)
      if (Array.isArray(savedData.material_system_rows)) {
        setMaterialRows(savedData.material_system_rows as MaterialSystemRow[])
      }
      if (Array.isArray(savedData.checklist_instances)) {
        setChecklistInstances(savedData.checklist_instances as ChecklistInstanceRow[])
      }
    } else {
      setFormData({ ...emptyReport, ...projectDefaults })
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // Load checklist data for any checklist markers in the template
  useEffect(() => {
    const checklistIds = templateFields
      .filter((f) => f.id.startsWith('checklist-'))
      .map((f) => f.id.replace('checklist-', ''))
    if (checklistIds.length === 0) return

    async function loadChecklists() {
      const supabase = createClient()
      const { data: cls } = await supabase
        .from('job_report_checklists')
        .select('*')
        .in('id', checklistIds)
      const { data: items } = await supabase
        .from('job_report_checklist_items')
        .select('*')
        .in('checklist_id', checklistIds)
        .order('sort_order')

      const map = new Map<string, ChecklistSectionData>()
      for (const cl of (cls ?? []) as { id: string; name: string }[]) {
        map.set(cl.id, {
          name: cl.name,
          items: ((items ?? []) as { id: string; checklist_id: string; text: string; sort_order: number }[])
            .filter((i) => i.checklist_id === cl.id)
            .map((i) => ({ id: i.id, text: i.text, sort_order: i.sort_order })),
        })
      }
      setChecklistData(map)
    }
    loadChecklists()
  }, [templateFields])

  // Load checklist responses for this project
  useEffect(() => {
    async function loadResponses() {
      const supabase = createClient()
      const { data } = await supabase
        .from('job_report_checklist_responses')
        .select('*')
        .eq('project_id', projectId)

      const map = new Map<string, boolean>()
      for (const row of (data ?? []) as { checklist_item_id: string; checked: boolean }[]) {
        map.set(row.checklist_item_id, row.checked)
      }
      setChecklistResponses(map)
    }
    loadResponses()
  }, [projectId])

  // Load all checklist templates for checklist_placeholder dropdowns
  useEffect(() => {
    async function loadAllTemplates() {
      const supabase = createClient()
      const { data: cls } = await supabase
        .from('job_report_checklists')
        .select('*')
        .order('sort_order')
      const { data: items } = await supabase
        .from('job_report_checklist_items')
        .select('*')
        .order('sort_order')

      const templates = ((cls ?? []) as { id: string; name: string }[]).map((cl) => ({
        id: cl.id,
        name: cl.name,
        items: ((items ?? []) as { id: string; checklist_id: string; text: string; sort_order: number }[])
          .filter((i) => i.checklist_id === cl.id)
          .map((i) => ({ id: i.id, text: i.text, sort_order: i.sort_order })),
      }))
      setAllChecklistTemplates(templates)
    }
    loadAllTemplates()
  }, [])

  // Load checklist selections for this project (which template was selected for each placeholder)
  useEffect(() => {
    async function loadSelections() {
      const supabase = createClient()
      const { data } = await supabase
        .from('job_report_checklist_selections')
        .select('*')
        .eq('project_id', projectId)

      const map = new Map<string, string>()
      for (const row of (data ?? []) as { field_id: string; checklist_id: string }[]) {
        map.set(row.field_id, row.checklist_id)
      }
      setChecklistSelections(map)
    }
    loadSelections()
  }, [projectId])

  // Migrate old single-selection data to checklist instances
  useEffect(() => {
    if (checklistSelections.size === 0 || checklistInstances.length > 0 || allChecklistTemplates.length === 0) return
    const migrated: ChecklistInstanceRow[] = []
    checklistSelections.forEach((checklistId, fieldId) => {
      const tmpl = allChecklistTemplates.find((t) => t.id === checklistId)
      if (!tmpl) return
      const responses: Record<string, boolean> = {}
      for (const item of tmpl.items) {
        const checked = checklistResponses.get(item.id)
        if (checked !== undefined) responses[item.id] = checked
      }
      migrated.push({
        id: Math.random().toString(36).slice(2, 10),
        fieldId,
        checklistId,
        checklistName: tmpl.name,
        responses,
      })
    })
    if (migrated.length > 0) setChecklistInstances(migrated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistSelections, allChecklistTemplates, checklistResponses])

  async function handleChecklistSelectionChange(fieldId: string, checklistId: string) {
    setChecklistSelections((prev) => {
      const next = new Map(prev)
      next.set(fieldId, checklistId)
      return next
    })

    const supabase = createClient()
    await supabase.from('job_report_checklist_selections').upsert(
      {
        project_id: projectId,
        field_id: fieldId,
        checklist_id: checklistId,
      },
      { onConflict: 'project_id,field_id' }
    )
  }

  async function handleChecklistChange(itemId: string, checked: boolean) {
    setChecklistResponses((prev) => {
      const next = new Map(prev)
      next.set(itemId, checked)
      return next
    })

    const supabase = createClient()
    await supabase.from('job_report_checklist_responses').upsert(
      {
        project_id: projectId,
        checklist_item_id: itemId,
        checked,
      },
      { onConflict: 'project_id,checklist_item_id' }
    )
  }

  // Close checklist dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (checklistDropdownRef.current && !checklistDropdownRef.current.contains(e.target as Node)) {
        setChecklistDropdownFieldId(null)
        setChecklistSearchQuery('')
      }
    }
    if (checklistDropdownFieldId) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [checklistDropdownFieldId])

  function addChecklistInstance(fieldId: string, template: { id: string; name: string; items: { id: string }[] }) {
    const instance: ChecklistInstanceRow = {
      id: Math.random().toString(36).slice(2, 10),
      fieldId,
      checklistId: template.id,
      checklistName: template.name,
      responses: {},
    }
    setChecklistInstances((prev) => [...prev, instance])
    setChecklistDropdownFieldId(null)
    setChecklistSearchQuery('')
  }

  function removeChecklistInstance(instanceId: string) {
    setChecklistInstances((prev) => prev.filter((ci) => ci.id !== instanceId))
  }

  function handleChecklistInstanceCheck(instanceId: string, itemId: string, checked: boolean) {
    setChecklistInstances((prev) =>
      prev.map((ci) =>
        ci.id === instanceId
          ? { ...ci, responses: { ...ci.responses, [itemId]: checked } }
          : ci
      )
    )
  }

  function handleChange(key: string, value: string) {
    if (key in emptyReport) {
      setFormData((prev) => ({ ...prev, [key]: value }))
    } else {
      setCustomValues((prev) => ({ ...prev, [key]: value }))
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSavedMsg(false)

    const supabase = createClient()
    const mergedData: Record<string, unknown> = { ...formData }
    for (const [key, val] of Object.entries(customValues)) {
      if (typeof val === 'string' && val.trim()) {
        mergedData[key] = val.trim()
      }
    }
    mergedData.material_system_rows = materialRows
    mergedData.checklist_instances = checklistInstances

    const allValues: Record<string, string> = {}
    for (const [key, val] of Object.entries(mergedData)) {
      if (typeof val === 'string') allValues[key] = val
    }
    for (const [key, val] of Object.entries(customValues)) {
      allValues[key] = val
    }
    const dynamicFields = buildDynamicFields(FORM_KEY, allValues, templateFields)

    const { error: upsertError } = await supabase
      .from('project_reports')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          data: mergedData,
          dynamic_fields: dynamicFields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )

    if (upsertError) {
      setError(upsertError.message)
    } else {
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    }
    setSaving(false)
  }

  async function handleAutosave() {
    if (readOnly) return
    setAutosaveStatus('saving')

    const supabase = createClient()
    const mergedData: Record<string, unknown> = { ...formData }
    for (const [key, val] of Object.entries(customValues)) {
      if (typeof val === 'string' && val.trim()) {
        mergedData[key] = val.trim()
      }
    }
    mergedData.material_system_rows = materialRows
    mergedData.checklist_instances = checklistInstances

    const allValues: Record<string, string> = {}
    for (const [key, val] of Object.entries(mergedData)) {
      if (typeof val === 'string') allValues[key] = val
    }
    for (const [key, val] of Object.entries(customValues)) {
      allValues[key] = val
    }
    const dynamicFields = buildDynamicFields(FORM_KEY, allValues, templateFields)

    const { error: upsertError } = await supabase
      .from('project_reports')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          data: mergedData,
          dynamic_fields: dynamicFields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )

    if (upsertError) {
      setAutosaveStatus('error')
    } else {
      setAutosaveStatus('saved')
      setTimeout(() => setAutosaveStatus('idle'), 2000)
    }
  }

  // Autosave: debounced save after form data changes
  useEffect(() => {
    if (!initialLoadDoneRef.current) return
    if (readOnly || loading) return

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      handleAutosave()
    }, 1500)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, customValues, materialRows, checklistInstances])

  // Mark initial load as done after data is loaded
  useEffect(() => {
    if (!loading) {
      // Small delay to let the initial state settle
      const timer = setTimeout(() => { initialLoadDoneRef.current = true }, 100)
      return () => clearTimeout(timer)
    }
  }, [loading])

  function handlePrint() {
    window.print()
  }

  async function handleSavePdf() {
    if (!formRef.current) return
    setGeneratingPdf(true)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      const titleEl = formRef.current.querySelector('[data-report-title]') as HTMLElement | null
      if (titleEl) titleEl.style.display = 'flex'

      const inputs = formRef.current.querySelectorAll<HTMLElement>('input, textarea')
      const printValues = formRef.current.querySelectorAll<HTMLElement>('[data-print-value]')
      inputs.forEach((el) => { el.style.display = 'none' })
      printValues.forEach((el) => {
        el.style.display = 'block'
        el.style.borderBottom = '1px solid #e5e7eb'
        el.style.padding = '4px 0'
        el.style.fontSize = '9pt'
      })

      const canvas = await html2canvas(formRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      if (titleEl) titleEl.style.display = ''
      inputs.forEach((el) => { el.style.display = '' })
      printValues.forEach((el) => {
        el.style.display = ''
        el.style.borderBottom = ''
        el.style.padding = ''
        el.style.fontSize = ''
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = canvas.width
      const imgHeight = canvas.height

      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'letter',
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 28
      const contentWidth = pageWidth - margin * 2
      const scaledHeight = (imgHeight * contentWidth) / imgWidth
      let yOffset = 0

      while (yOffset < scaledHeight) {
        if (yOffset > 0) pdf.addPage()
        pdf.addImage(
          imgData,
          'PNG',
          margin,
          margin - yOffset,
          contentWidth,
          scaledHeight
        )
        yOffset += pageHeight - margin * 2
      }

      const safeName = projectName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim()
      pdf.save(`${safeName} - Project Report.pdf`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    }
    setGeneratingPdf(false)
  }

  function getFieldValue(contentKey: string): string {
    if (contentKey in emptyReport) {
      return formData[contentKey as keyof ProjectReportData] ?? ''
    }
    return customValues[contentKey] ?? ''
  }

  const MATERIAL_SYSTEM_SKIP_IDS = new Set(['pr-49', 'pr-50', 'pr-51', 'pr-52', 'pr-53', 'pr-54', 'pr-55'])
  const MATERIAL_SYSTEM_SKIP_LABELS = /^Material (System|Quantities) \d$/

  function renderField(field: FormField) {
    if (MATERIAL_SYSTEM_SKIP_IDS.has(field.id)) return null
    if (MATERIAL_SYSTEM_SKIP_LABELS.test(field.label)) return null

    // Material System placeholder — render full-width within parent section
    if (field.type === 'material_system_placeholder') {
      return (
        <div key={field.id} className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">
            {field.label || 'Material System'}
          </label>
          <MaterialSystemPicker
            rows={materialRows}
            onChange={setMaterialRows}
            systems={materialSystems}
            onAddNew={addMaterialSystem}
            onUpdateSystem={updateMaterialSystem}
            readOnly={readOnly}
            showQuantity
          />
        </div>
      )
    }

    // Checklist placeholder — render as stacked cards with "+ Add Checklist" button
    if (field.type === 'checklist_placeholder') {
      const fieldInstances = checklistInstances.filter((ci) => ci.fieldId === field.id)

      return (
        <div key={field.id} className="flex flex-col gap-1.5">
          <div className="space-y-3">
            {fieldInstances.map((instance) => {
              const tmpl = allChecklistTemplates.find((t) => t.id === instance.checklistId)
              const items = tmpl?.items ?? []
              return (
                <div key={instance.id} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-100/60 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-900">{instance.checklistName}</span>
                    {!readOnly && (
                      <button
                        onClick={() => removeChecklistInstance(instance.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {items.map((item) => {
                      const isChecked = instance.responses[item.id] ?? false
                      return (
                        <label key={item.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleChecklistInstanceCheck(instance.id, item.id, e.target.checked)}
                            disabled={readOnly}
                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                          />
                          <span className={`text-sm ${isChecked ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                            {item.text}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {!readOnly && (
              <div className="relative" ref={checklistDropdownFieldId === field.id ? checklistDropdownRef : undefined}>
                <button
                  onClick={() => setChecklistDropdownFieldId(checklistDropdownFieldId === field.id ? null : field.id)}
                  className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add Checklist
                </button>

                {checklistDropdownFieldId === field.id && (() => {
                  const query = checklistSearchQuery.toLowerCase()
                  const filtered = query
                    ? allChecklistTemplates.filter((t) => t.name.toLowerCase().includes(query))
                    : allChecklistTemplates
                  return (
                    <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-72 flex flex-col overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          value={checklistSearchQuery}
                          onChange={(e) => setChecklistSearchQuery(e.target.value)}
                          placeholder="Search checklists..."
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                          autoFocus
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {filtered.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => addChecklistInstance(field.id, t)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <span className="font-medium">{t.name}</span>
                            {t.items.length > 0 && (
                              <span className="text-xs text-gray-400 ml-1">({t.items.length} items)</span>
                            )}
                          </button>
                        ))}
                        {filtered.length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-400">No checklists found</div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )
    }

    // Checklist section (legacy format)
    if (field.id.startsWith('checklist-')) {
      const checklistId = field.id.replace('checklist-', '')
      const data = checklistData.get(checklistId)
      if (!data) return null
      return (
        <div key={field.id}>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
            <div className="px-3 py-2 bg-gray-100/60 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">{data.name}</span>
            </div>
            <div className="px-3 py-2 space-y-1">
              {data.items.map((item) => (
                <label key={item.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklistResponses.get(item.id) ?? false}
                    onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
                    disabled={readOnly}
                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                  />
                  <span className={`text-sm ${(checklistResponses.get(item.id) ?? false) ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (field.type === 'section_header') {
      if (field.id === 'pr-52' || field.label === 'Material Quantities') return null

      return (
        <div key={field.id}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3 lg:mb-3 border-b border-amber-100 pb-1.5 mt-2 first:mt-0">
            {field.label}
          </h3>
        </div>
      )
    }

    const contentKey = getContentKey(FORM_KEY, field)
    const value = getFieldValue(contentKey)
    const isTextarea = field.type === 'long_text'

    return (
      <div
        key={field.id}
        className="flex flex-col gap-1 lg:grid lg:grid-cols-[200px_1fr] lg:gap-4 lg:items-start"
      >
        <label className="text-xs font-medium text-gray-600 lg:pt-2 lg:text-right">
          {field.label}
          {field.required && <span className="text-red-400"> *</span>}
        </label>
        <div className="relative">
          {isTextarea ? (
            <textarea
              value={value}
              onChange={(e) => handleChange(contentKey, e.target.value)}
              rows={3}
              readOnly={readOnly}
              placeholder={field.placeholder || ''}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none resize-vertical ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(contentKey, e.target.value)}
              readOnly={readOnly}
              placeholder={field.placeholder || ''}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
            />
          )}
          <div
            data-print-value
            className="hidden text-sm text-gray-900 py-2 whitespace-pre-wrap"
          >
            {value || '\u00A0'}
          </div>
        </div>
      </div>
    )
  }

  const headerActions = (
    <>
      <button
        onClick={handlePrint}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
      >
        <PrinterIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Print</span>
      </button>
      <button
        onClick={handleSavePdf}
        disabled={loading || generatingPdf}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
      >
        <FileDownIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{generatingPdf ? 'Generating...' : 'PDF'}</span>
      </button>
      {!readOnly && autosaveStatus !== 'idle' && (
        <span className={`text-xs font-medium hidden sm:inline ${
          autosaveStatus === 'saving' ? 'text-gray-400' :
          autosaveStatus === 'saved' ? 'text-green-500' :
          'text-red-500'
        }`}>
          {autosaveStatus === 'saving' ? 'Saving...' :
           autosaveStatus === 'saved' ? 'All changes saved' :
           'Save failed'}
        </span>
      )}
      {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      )}
    </>
  )

  return (
    <WorkspaceShell
      title="Job Report"
      icon={<ClipboardListIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={headerActions}
    >
      <div data-report-print className="p-4 md:p-6">
        {(error || savedMsg) && (
          <div className="mb-3 max-w-4xl">
            {error && <p className="text-xs text-red-600">{error}</p>}
            {savedMsg && <p className="text-xs text-green-600">Saved successfully</p>}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <div ref={formRef} data-report-form className="space-y-6 print:space-y-4 max-w-4xl">
            <div data-report-title className="hidden print:flex items-center justify-between pb-2 border-b border-gray-300 mb-4">
              <h1 className="text-xl font-bold text-gray-900">
                Project Report: {projectName}
              </h1>
              {companySettings?.logo_url && (
                <Image
                  src={companySettings.logo_url}
                  alt="Company logo"
                  width={150}
                  height={75}
                  className="h-[75px] w-auto max-w-[150px] object-contain"
                  data-report-logo
                />
              )}
            </div>
            {templateLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Loading form template...
              </div>
            )}

            {templateFields.map((field) => renderField(field))}
          </div>
        )}
      </div>
    </WorkspaceShell>
  )
}
