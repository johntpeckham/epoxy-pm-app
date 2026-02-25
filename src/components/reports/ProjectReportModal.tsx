'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { XIcon, Loader2Icon, PrinterIcon, FileDownIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ProjectReportData } from '@/types'
import type { UserRole } from '@/types'
import { useCompanySettings } from '@/lib/useCompanySettings'

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

interface FieldDef {
  key: keyof ProjectReportData
  label: string
  type?: 'input' | 'textarea'
}

interface SectionDef {
  title: string
  fields: FieldDef[]
}

const sections: SectionDef[] = [
  {
    title: 'Project Details',
    fields: [
      { key: 'project_name', label: 'Project Name' },
      { key: 'estimate_number', label: 'Estimate Number' },
      { key: 'address', label: 'Address' },
      { key: 'client_name', label: 'Client Name' },
      { key: 'client_email', label: 'Client Email' },
      { key: 'client_phone', label: 'Client Phone Number' },
      { key: 'site_contact', label: 'Site Contact' },
      { key: 'prevailing_wage', label: 'Prevailing Wage?' },
      { key: 'bonding_insurance', label: 'Bonding / Insurance Requirements' },
      { key: 'bid_date', label: 'Bid Date' },
      { key: 'bid_platform', label: 'Bid Platform' },
      { key: 'project_details_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Project Durations',
    fields: [
      { key: 'start_date', label: 'Start Date' },
      { key: 'finish_date', label: 'Finish Date' },
      { key: 'num_mobilizations', label: 'Number of Mobilizations' },
      { key: 'working_hours', label: 'Working Hours (e.g. 9-5 / 24hr / Split Shift)' },
      { key: 'durations_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Scope Of Work',
    fields: [
      { key: 'scope_description', label: 'What are we doing?', type: 'textarea' },
      { key: 'num_rooms_sections', label: 'Number of rooms / sections' },
      { key: 'square_footages', label: 'Square footages' },
      { key: 'linear_footage', label: 'Linear footage (cove or curbs)' },
      { key: 'cove_curb_height', label: 'Cove curb height measurement' },
      { key: 'room_numbers_names', label: 'Room Numbers / Names' },
      { key: 'open_areas_machines', label: 'Open Areas / Machines' },
      { key: 'scope_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Site Information',
    fields: [
      { key: 'power_supplied', label: 'Power Supplied?' },
      { key: 'lighting_requirements', label: 'Lighting Requirements' },
      { key: 'heating_cooling_requirements', label: 'Heating Cooling Requirements' },
      { key: 'rental_requirements', label: 'Rental Requirements' },
      { key: 'rental_location', label: 'Rental Location' },
      { key: 'rental_duration', label: 'Rental Duration' },
      { key: 'site_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Travel Information',
    fields: [
      { key: 'hotel_name', label: 'Hotel Name' },
      { key: 'hotel_location', label: 'Hotel Location' },
      { key: 'reservation_number', label: 'Reservation Number' },
      { key: 'reservation_contact', label: 'Reservation Contact' },
      { key: 'credit_card_auth', label: 'Credit Card Authorization' },
      { key: 'drive_time', label: 'Drive Time' },
      { key: 'per_diem', label: 'Per Diem' },
      { key: 'vehicles', label: 'Vehicles' },
      { key: 'trailers', label: 'Trailers' },
      { key: 'travel_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Material System',
    fields: [
      { key: 'material_system_1', label: 'Material System 1' },
      { key: 'material_system_2', label: 'Material System 2' },
      { key: 'material_system_3', label: 'Material System 3' },
    ],
  },
  {
    title: 'Material Quantities',
    fields: [
      { key: 'material_quantities_1', label: 'Material Quantities 1' },
      { key: 'material_quantities_2', label: 'Material Quantities 2' },
      { key: 'material_quantities_3', label: 'Material Quantities 3' },
    ],
  },
  {
    title: 'Prep',
    fields: [
      { key: 'prep_method', label: 'Method (Grinder / Sandblast / Scarify)' },
      { key: 'prep_removal', label: 'Removal (Full Removal / New Concrete)' },
      { key: 'patching_materials', label: 'Patching Materials' },
      { key: 'joint_requirements', label: 'Joint Requirements (Pre-fill / Cut / Polyurea)' },
      { key: 'sloping_requirements', label: 'Sloping Requirements' },
      { key: 'backfill_patching', label: 'Backfill / Excessive Patching' },
      { key: 'wet_area', label: 'Wet Area' },
      { key: 'climate_concerns', label: 'Climate Concerns' },
      { key: 'cooling_heating_constraints', label: 'Cooling Heating Constraints' },
      { key: 'prep_notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
]

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
  const [formData, setFormData] = useState<ProjectReportData>(emptyReport)
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
      setFormData({ ...emptyReport, ...(data.data as ProjectReportData) })
    } else {
      setFormData({ ...emptyReport, ...projectDefaults })
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  function handleChange(key: keyof ProjectReportData, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSavedMsg(false)

    const supabase = createClient()
    const { error: upsertError } = await supabase
      .from('project_reports')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          data: formData,
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

  return (
    <div data-report-print className="fixed inset-0 z-50 flex items-center justify-center px-2 sm:px-4 py-3 sm:py-6">
      {/* Overlay */}
      <div data-report-overlay className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div data-report-modal className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div data-report-header className="flex items-center justify-between px-4 lg:px-6 pt-4 lg:pt-5 pb-3 lg:pb-4 border-b border-gray-100 flex-shrink-0 print:hidden">
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
        <div data-report-body className="overflow-y-auto flex-1 px-4 lg:px-6 py-4 lg:py-5 print:overflow-visible">
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
              {sections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3 lg:mb-3 border-b border-amber-100 pb-1.5 mt-2 first:mt-0">
                    {section.title}
                  </h3>
                  <div className="space-y-2">
                    {section.fields.map((field) => (
                      <div
                        key={field.key}
                        className="flex flex-col gap-1 lg:grid lg:grid-cols-[180px_1fr] lg:gap-3 lg:items-start"
                      >
                        <label className="text-xs font-medium text-gray-600 lg:pt-2 lg:text-right">
                          {field.label}
                        </label>
                        <div className="relative">
                          {field.type === 'textarea' ? (
                            <textarea
                              value={formData[field.key]}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              rows={3}
                              readOnly={readOnly}
                              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none resize-vertical ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={formData[field.key]}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              readOnly={readOnly}
                              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none ${readOnly ? 'bg-gray-50 cursor-default' : 'focus:border-amber-400 focus:ring-1 focus:ring-amber-400'}`}
                            />
                          )}
                          <div
                            data-print-value
                            className="hidden text-sm text-gray-900 py-2 whitespace-pre-wrap"
                          >
                            {formData[field.key] || '\u00A0'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div data-report-footer className="flex flex-wrap items-center gap-2 lg:gap-3 px-4 lg:px-6 py-3 lg:py-4 border-t border-gray-100 flex-shrink-0 print:hidden">
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
  )
}
