'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { XIcon, Loader2Icon, PrinterIcon, FileDownIcon, ClipboardListIcon, CheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ProjectReportData, FormField } from '@/types'
import type { UserRole } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys } from '@/lib/formFieldMaps'
import Portal from '@/components/ui/Portal'
import type { MaterialSystemRow } from '@/components/ui/MaterialSystemPicker'
import type { ChecklistInstanceRow } from '@/components/job-board/workspaces/ReportWorkspace'

interface ChecklistSectionData {
  name: string
  items: { id: string; text: string; sort_order: number }[]
}

interface ProjectReportModalProps {
  projectId: string
  projectName: string
  clientName: string
  address: string
  estimateNumber: string
  userId: string
  userRole?: UserRole
  onClose: () => void
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

// Skip all old static Material System 1/2/3 and Material Quantities 1/2/3 fields
const MATERIAL_SYSTEM_SKIP_IDS = new Set(['pr-49', 'pr-50', 'pr-51', 'pr-52', 'pr-53', 'pr-54', 'pr-55'])
const MATERIAL_SYSTEM_SKIP_LABELS = /^Material (System|Quantities) \d$/

export default function ProjectReportModal({
  projectId,
  projectName,
  onClose,
}: ProjectReportModalProps) {
  const { settings: companySettings } = useCompanySettings()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)
  const [formData, setFormData] = useState<ProjectReportData>(emptyReport)
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [materialRows, setMaterialRows] = useState<MaterialSystemRow[]>([])
  const [checklistData, setChecklistData] = useState<Map<string, ChecklistSectionData>>(new Map())
  const [checklistResponses, setChecklistResponses] = useState<Map<string, boolean>>(new Map())
  const [allChecklistTemplates, setAllChecklistTemplates] = useState<{ id: string; name: string; items: { id: string; text: string; sort_order: number }[] }[]>([])
  const [checklistSelections, setChecklistSelections] = useState<Map<string, string>>(new Map())
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reportExists, setReportExists] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

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
      setReportExists(true)
      // Load custom field values (keys not in the known set)
      const custom: Record<string, string> = {}
      for (const [key, val] of Object.entries(savedData)) {
        if (!KNOWN_KEYS.has(key) && key !== 'material_system_rows' && key !== 'checklist_instances' && typeof val === 'string') {
          custom[key] = val
        }
      }
      setCustomValues(custom)
      // Load material system rows
      if (Array.isArray(savedData.material_system_rows)) {
        setMaterialRows(savedData.material_system_rows as MaterialSystemRow[])
      }
      if (Array.isArray(savedData.checklist_instances)) {
        setChecklistInstances(savedData.checklist_instances as ChecklistInstanceRow[])
      }
    } else {
      setReportExists(false)
    }
    setLoading(false)
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

  // Load all checklist templates for checklist_placeholder display
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

  // Load checklist selections for this project
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

  function handleChecklistInstanceCheck(instanceId: string, itemId: string, checked: boolean) {
    setChecklistInstances((prev) =>
      prev.map((ci) =>
        ci.id === instanceId
          ? { ...ci, responses: { ...ci.responses, [itemId]: checked } }
          : ci
      )
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

  function handlePrint() {
    window.print()
  }

  async function handleSavePdf() {
    if (!formRef.current) return
    setGeneratingPdf(true)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(formRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
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

  /**
   * Group template fields into sections. Each section has a header label and
   * a list of data fields. We filter out empty fields and skip sections that
   * have no populated fields so the read-only view stays clean.
   */
  type SectionField = {
    label: string
    value: string
    isLongText: boolean
    inlineType?: 'material_system' | 'checklist'
    checklistId?: string
    checklistPlaceholderFieldId?: string
    checklistFieldId?: string
  }

  type Section = {
    header: string
    fields: SectionField[]
    checklistId?: string
  }

  function buildSections(): Section[] {
    const sections: Section[] = []
    let currentSection: Section | null = null

    for (const field of templateFields) {
      if (MATERIAL_SYSTEM_SKIP_IDS.has(field.id)) continue
      if (MATERIAL_SYSTEM_SKIP_LABELS.test(field.label)) continue

      // Material System placeholder — add as inline field within current section
      if (field.type === 'material_system_placeholder') {
        if (currentSection) {
          currentSection.fields.push({
            label: field.label || 'Material System',
            value: '',
            isLongText: false,
            inlineType: 'material_system',
          })
        }
        continue
      }

      // Checklist placeholder — add as inline field within current section
      if (field.type === 'checklist_placeholder') {
        if (currentSection) {
          currentSection.fields.push({
            label: field.label || 'Checklist',
            value: '',
            isLongText: false,
            inlineType: 'checklist',
            checklistFieldId: field.id,
          })
        }
        continue
      }

      if (field.type === 'section_header') {
        // Skip Material Quantities section header (replaced by Material System picker)
        if (field.id === 'pr-52' || field.label === 'Material Quantities') continue

        // Checklist section (legacy format) — handled separately
        if (field.id.startsWith('checklist-')) {
          const checklistId = field.id.replace('checklist-', '')
          const data = checklistData.get(checklistId)
          currentSection = { header: data?.name ?? field.label, fields: [], checklistId }
          sections.push(currentSection)
          currentSection = null
          continue
        }

        currentSection = { header: field.label, fields: [] }
        sections.push(currentSection)
        continue
      }

      if (!currentSection) continue

      const contentKey = getContentKey(FORM_KEY, field)
      const value = getFieldValue(contentKey)
      if (value.trim()) {
        currentSection.fields.push({
          label: field.label,
          value: value.trim(),
          isLongText: field.type === 'long_text',
        })
      }
    }

    return sections
  }

  function renderMaterialRows() {
    if (materialRows.length === 0) return null

    return (
      <div className="space-y-3">
        {materialRows.map((row) => (
          <div
            key={row.id}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* System name header */}
            <div className="px-3 sm:px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">{row.systemName}</span>
            </div>

            {/* Material items */}
            {row.items.length > 0 && (
              <div className="divide-y divide-gray-100">
                {row.items.map((item, idx) => (
                  <div key={idx} className="px-3 sm:px-4 py-2.5">
                    {/* Mobile: stacked layout */}
                    <div className="sm:hidden space-y-1.5">
                      <p className="text-sm font-medium text-gray-900">{item.material_name}</p>
                      {item.thickness && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">Thickness</span>
                          <span className="text-sm text-gray-700">{item.thickness}</span>
                        </div>
                      )}
                      {item.coverage_rate && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">Coverage Rate</span>
                          <span className="text-sm text-gray-700">{item.coverage_rate}</span>
                        </div>
                      )}
                      {item.quantity && (
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">Quantity</span>
                          <span className="text-sm font-medium text-gray-900">{item.quantity}</span>
                        </div>
                      )}
                      {item.item_notes && (
                        <p className="text-xs text-gray-400 italic">{item.item_notes}</p>
                      )}
                    </div>

                    {/* Desktop: grid layout */}
                    <div className="hidden sm:block">
                      {idx === 0 && (
                        <div className="grid grid-cols-4 gap-3 mb-1">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Material</span>
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Thickness</span>
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Coverage Rate</span>
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Quantity</span>
                        </div>
                      )}
                      <div className="grid grid-cols-4 gap-3">
                        <span className="text-sm text-gray-900">{item.material_name}</span>
                        <span className="text-sm text-gray-600">{item.thickness || '\u2014'}</span>
                        <span className="text-sm text-gray-600">{item.coverage_rate || '\u2014'}</span>
                        <span className="text-sm text-gray-600">{item.quantity || '\u2014'}</span>
                      </div>
                      {item.item_notes && (
                        <p className="text-xs text-gray-400 italic mt-1">{item.item_notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* System notes */}
            {row.notes && (
              <div className="px-3 sm:px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-gray-500 mb-0.5 font-medium">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{row.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const sections = !loading && reportExists ? buildSections() : []

  const hasMaterialContent = materialRows.length > 0

  return (
    <Portal>
    <div data-report-print className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      {/* Modal */}
      <div data-report-modal className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div data-report-header className="flex-none flex items-center justify-between px-4 border-b border-gray-200 print:hidden" style={{ minHeight: '56px' }}>
          <div>
            <h2 className="text-base font-bold text-gray-900">Project Report</h2>
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div data-report-body className="flex-1 overflow-y-auto print:overflow-visible min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
            </div>
          ) : !reportExists ? (
            /* No report exists — show empty state */
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <ClipboardListIcon className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-gray-500 text-sm font-medium">No job report yet</p>
              <p className="text-gray-400 text-xs mt-1">Reports are created from the Job Board.</p>
            </div>
          ) : (
            /* Report exists — read-only view */
            <div ref={formRef} data-report-form className="px-4 py-5 sm:px-6 sm:py-6">
              {/* PDF title (shown in print/PDF only) */}
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
                  Loading...
                </div>
              )}

              <div className="space-y-6">
                {sections.map((section, sIdx) => {
                  // Checklist section (legacy) — render interactive checklist in card
                  if (section.checklistId) {
                    const data = checklistData.get(section.checklistId)
                    if (!data || data.items.length === 0) return null
                    return (
                      <div key={`section-${sIdx}`}>
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                          <div className="px-3 py-2 bg-gray-100/60 border-b border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">{data.name}</span>
                          </div>
                          <div className="px-3 py-2 space-y-1">
                            {data.items.map((item) => {
                              const isChecked = checklistResponses.get(item.id) ?? false
                              return (
                                <label key={item.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
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
                      </div>
                    )
                  }

                  // Regular section — only render if it has populated fields (including inline types)
                  const hasContent = section.fields.some((f) => f.value.trim() || f.inlineType)
                  if (!hasContent) return null

                  return (
                    <div key={`section-${sIdx}`}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3 border-b border-amber-100 pb-1.5">
                        {section.header}
                      </h3>
                      <div className="space-y-3">
                        {section.fields.map((f, fIdx) => {
                          // Inline material system — full width
                          if (f.inlineType === 'material_system') {
                            if (!hasMaterialContent) return null
                            return (
                              <div key={`field-${sIdx}-${fIdx}`} className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-gray-500">
                                  {f.label}
                                </span>
                                {renderMaterialRows()}
                              </div>
                            )
                          }

                          // Inline checklist — render all instances as stacked cards
                          if (f.inlineType === 'checklist' && f.checklistFieldId) {
                            const fieldInstances = checklistInstances.filter((ci) => ci.fieldId === f.checklistFieldId)
                            if (fieldInstances.length === 0) return null
                            return (
                              <div key={`field-${sIdx}-${fIdx}`} className="flex flex-col gap-3">
                                {fieldInstances.map((instance) => {
                                  const tmpl = allChecklistTemplates.find((t) => t.id === instance.checklistId)
                                  const items = tmpl?.items ?? []
                                  return (
                                    <div key={instance.id} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                                      <div className="px-3 py-2 bg-gray-100/60 border-b border-gray-200">
                                        <span className="text-sm font-semibold text-gray-900">{instance.checklistName}</span>
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
                              </div>
                            )
                          }

                          // Skip inline checklist with no instances
                          if (f.inlineType === 'checklist') return null

                          // Regular text field
                          return (
                            <div
                              key={`field-${sIdx}-${fIdx}`}
                              className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[160px_1fr] sm:gap-3 sm:items-start"
                            >
                              <span className="text-xs font-medium text-gray-500 sm:pt-0.5 sm:text-right">
                                {f.label}
                              </span>
                              <p className={`text-sm text-gray-900 ${f.isLongText ? 'whitespace-pre-wrap' : ''} break-words`}>
                                {f.value}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}



              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div data-report-footer className="flex-none flex flex-wrap items-center gap-2 sm:gap-3 p-4 border-t border-gray-200 print:hidden" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
          {error && <p className="text-xs text-red-600 w-full sm:w-auto sm:flex-1">{error}</p>}
          {!error && <div className="hidden sm:block flex-1" />}
          {reportExists && (
            <>
              <button
                onClick={handlePrint}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
              >
                <PrinterIcon className="w-4 h-4" />
                Print
              </button>
              <button
                onClick={handleSavePdf}
                disabled={loading || generatingPdf}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
              >
                <FileDownIcon className="w-4 h-4" />
                {generatingPdf ? 'Generating...' : 'PDF'}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
