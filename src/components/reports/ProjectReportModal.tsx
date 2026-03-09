'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { XIcon, Loader2Icon, PrinterIcon, FileDownIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ProjectReportData, FormField } from '@/types'
import type { UserRole } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import Portal from '@/components/ui/Portal'

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
  material_system_1: '',
  material_system_2: '',
  material_system_3: '',
  material_quantities_1: '',
  material_quantities_2: '',
  material_quantities_3: '',
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

export default function ProjectReportModal({
  projectId,
  projectName,
  clientName,
  address,
  estimateNumber,
  userId,
  userRole = 'crew',
  onClose,
}: ProjectReportModalProps) {
  const readOnly = userRole === 'foreman'
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

  const projectDefaults: Partial<ProjectReportData> = {
    project_name: projectName,
    client_name: clientName,
    address: address,
    estimate_number: estimateNumber,
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
      const savedData = data.data as Record<string, string>
      setFormData({ ...emptyReport, ...(savedData as unknown as ProjectReportData) })
      // Load custom field values (keys not in the known set)
      const custom: Record<string, string> = {}
      for (const [key, val] of Object.entries(savedData)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string') {
          custom[key] = val
        }
      }
      setCustomValues(custom)
    } else {
      setFormData({ ...emptyReport, ...projectDefaults })
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    loadReport()
  }, [loadReport])

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
    // Merge known fields with custom field values
    const mergedData: Record<string, string> = { ...formData }
    for (const [key, val] of Object.entries(customValues)) {
      if (typeof val === 'string' && val.trim()) {
        mergedData[key] = val.trim()
      }
    }

    // Build dynamic fields for custom fields added via Form Management
    const allValues: Record<string, string> = { ...mergedData }
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

  function handlePrint() {
    window.print()
  }

  async function handleSavePdf() {
    if (!formRef.current) return
    setGeneratingPdf(true)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      // Temporarily swap inputs for plain-text print values and show title
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

      // Restore original visibility
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

  function renderField(field: FormField) {
    if (field.type === 'section_header') {
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
        className="flex flex-col gap-1 lg:grid lg:grid-cols-[180px_1fr] lg:gap-3 lg:items-start"
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

  return (
    <Portal>
    <div data-report-print className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      {/* Modal */}
      <div data-report-modal className="mt-auto md:mt-0 md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div data-report-header className="flex-none flex items-center justify-between px-4 border-b print:hidden" style={{ minHeight: '56px' }}>
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
        <div data-report-body className="flex-1 overflow-y-auto p-4 md:p-6 print:overflow-visible min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
            </div>
          ) : (
            <div ref={formRef} data-report-form className="space-y-6 print:space-y-4">
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

        {/* Footer */}
        <div data-report-footer className="flex-none flex flex-wrap items-center gap-2 lg:gap-3 p-4 border-t print:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {error && <p className="text-xs text-red-600 w-full lg:w-auto lg:flex-1">{error}</p>}
          {savedMsg && <p className="text-xs text-green-600 w-full lg:w-auto lg:flex-1">Saved successfully</p>}
          {!error && !savedMsg && <div className="hidden lg:block flex-1" />}
          <button
            onClick={handlePrint}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
          >
            <PrinterIcon className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleSavePdf}
            disabled={loading || generatingPdf}
            className="flex items-center gap-1.5 px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
          >
            <FileDownIcon className="w-4 h-4" />
            {generatingPdf ? 'Generating...' : 'PDF'}
          </button>
          <button
            onClick={onClose}
            className="px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 lg:px-6 py-2 lg:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold transition ml-auto"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  )
}
