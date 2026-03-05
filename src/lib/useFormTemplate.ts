'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormField, FormFieldType } from '@/types'

// Fallback fields matching the seed data from the migration
// Used when fetch fails or returns no fields so forms never break
const FALLBACK_FIELDS: Record<string, FormField[]> = {
  daily_report: [
    { id: 'dr-01', type: 'section_header', label: 'Header', placeholder: '', required: false, options: [], order: 1 },
    { id: 'dr-02', type: 'short_text', label: 'Project Name', placeholder: '', required: false, options: [], order: 2 },
    { id: 'dr-03', type: 'date', label: 'Date', placeholder: '', required: false, options: [], order: 3 },
    { id: 'dr-04', type: 'short_text', label: 'Address', placeholder: '', required: false, options: [], order: 4 },
    { id: 'dr-05', type: 'section_header', label: 'Crew', placeholder: '', required: false, options: [], order: 5 },
    { id: 'dr-06', type: 'short_text', label: 'Reported By', placeholder: 'Name', required: false, options: [], order: 6 },
    { id: 'dr-07', type: 'short_text', label: 'Project Foreman', placeholder: 'Name', required: false, options: [], order: 7 },
    { id: 'dr-08', type: 'short_text', label: 'Weather', placeholder: 'e.g. 72°F, Partly Cloudy, Wind 8 mph', required: false, options: [], order: 8 },
    { id: 'dr-09', type: 'section_header', label: 'Progress', placeholder: '', required: false, options: [], order: 9 },
    { id: 'dr-10', type: 'long_text', label: 'Progress', placeholder: 'Describe work completed today...', required: false, options: [], order: 10 },
    { id: 'dr-11', type: 'long_text', label: 'Delays', placeholder: 'Any delays or issues...', required: false, options: [], order: 11 },
    { id: 'dr-12', type: 'long_text', label: 'Safety', placeholder: 'Safety observations, incidents, PPE notes...', required: false, options: [], order: 12 },
    { id: 'dr-13', type: 'long_text', label: 'Materials Used', placeholder: 'Epoxy products, quantities, other materials...', required: false, options: [], order: 13 },
    { id: 'dr-14', type: 'long_text', label: 'Employees', placeholder: 'Names of employees on site today...', required: false, options: [], order: 14 },
  ],
  jsa_report: [
    { id: 'jsa-01', type: 'section_header', label: 'Project Info', placeholder: '', required: false, options: [], order: 1 },
    { id: 'jsa-02', type: 'short_text', label: 'Project Name', placeholder: '', required: false, options: [], order: 2 },
    { id: 'jsa-03', type: 'date', label: 'Date', placeholder: '', required: false, options: [], order: 3 },
    { id: 'jsa-04', type: 'short_text', label: 'Address', placeholder: '', required: false, options: [], order: 4 },
    { id: 'jsa-05', type: 'short_text', label: 'Weather', placeholder: 'e.g. 72°F, Partly Cloudy, Wind 8 mph', required: false, options: [], order: 5 },
    { id: 'jsa-06', type: 'section_header', label: 'Personnel', placeholder: '', required: false, options: [], order: 6 },
    { id: 'jsa-07', type: 'short_text', label: 'Prepared By', placeholder: 'Name', required: false, options: [], order: 7 },
    { id: 'jsa-08', type: 'short_text', label: 'Site Supervisor', placeholder: 'Name', required: false, options: [], order: 8 },
    { id: 'jsa-09', type: 'short_text', label: 'Competent Person', placeholder: 'Name', required: false, options: [], order: 9 },
    { id: 'jsa-10', type: 'section_header', label: 'Tasks', placeholder: '', required: false, options: [], order: 10 },
    { id: 'jsa-11', type: 'checkbox_group', label: 'Task Selection', placeholder: '', required: false, options: ['Surface Preparation', 'Coating Application', 'Cove / Curb Installation', 'Concrete Repair', 'Safety Setup'], order: 11 },
    { id: 'jsa-12', type: 'long_text', label: 'Hazards', placeholder: 'Identified hazards...', required: false, options: [], order: 12 },
    { id: 'jsa-13', type: 'long_text', label: 'Precautions', placeholder: 'Safety precautions...', required: false, options: [], order: 13 },
    { id: 'jsa-14', type: 'long_text', label: 'PPE Required', placeholder: 'Required PPE...', required: false, options: [], order: 14 },
    { id: 'jsa-15', type: 'section_header', label: 'Employee Acknowledgment & Signatures', placeholder: '', required: false, options: [], order: 15 },
    { id: 'jsa-16', type: 'signature' as FormFieldType, label: 'Employee Signatures', placeholder: '', required: false, options: [], order: 16 },
  ],
  expense: [
    { id: 'exp-01', type: 'section_header', label: 'Receipt Photo', placeholder: '', required: false, options: [], order: 1 },
    { id: 'exp-02', type: 'section_header', label: 'Receipt Details', placeholder: '', required: false, options: [], order: 2 },
    { id: 'exp-03', type: 'short_text', label: 'Vendor / Store Name', placeholder: 'e.g. Home Depot, Shell, Sunbelt Rentals', required: false, options: [], order: 3 },
    { id: 'exp-04', type: 'date', label: 'Date on Receipt', placeholder: '', required: false, options: [], order: 4 },
    { id: 'exp-05', type: 'number', label: 'Total Amount', placeholder: '0.00', required: false, options: [], order: 5 },
    { id: 'exp-06', type: 'dropdown', label: 'Category', placeholder: '', required: false, options: ['Materials', 'Fuel', 'Tools', 'Equipment Rental', 'Subcontractor', 'Office Supplies', 'Other'], order: 6 },
  ],
  timesheet: [
    { id: 'ts-01', type: 'section_header', label: 'Project Info', placeholder: '', required: false, options: [], order: 1 },
    { id: 'ts-02', type: 'short_text', label: 'Project Name', placeholder: '', required: false, options: [], order: 2 },
    { id: 'ts-03', type: 'date', label: 'Date', placeholder: '', required: false, options: [], order: 3 },
    { id: 'ts-04', type: 'short_text', label: 'Address', placeholder: '', required: false, options: [], order: 4 },
    { id: 'ts-05', type: 'section_header', label: 'Employees', placeholder: '', required: false, options: [], order: 5 },
    { id: 'ts-06', type: 'short_text', label: 'Employee Name', placeholder: 'Employee name', required: false, options: [], order: 6 },
    { id: 'ts-07', type: 'short_text', label: 'Time In', placeholder: '', required: false, options: [], order: 7 },
    { id: 'ts-08', type: 'short_text', label: 'Time Out', placeholder: '', required: false, options: [], order: 8 },
    { id: 'ts-09', type: 'dropdown', label: 'Lunch', placeholder: '', required: false, options: ['0 min', '15 min', '30 min', '45 min', '60 min'], order: 9 },
  ],
  task: [
    { id: 'tsk-01', type: 'short_text', label: 'Title', placeholder: 'Task title...', required: true, options: [], order: 1 },
    { id: 'tsk-02', type: 'long_text', label: 'Description', placeholder: 'Task details...', required: false, options: [], order: 2 },
    { id: 'tsk-03', type: 'dropdown', label: 'Assign To', placeholder: '', required: false, options: [], order: 3 },
    { id: 'tsk-04', type: 'date', label: 'Due Date', placeholder: '', required: false, options: [], order: 4 },
    { id: 'tsk-05', type: 'dropdown', label: 'Status', placeholder: '', required: false, options: ['New Task', 'In Progress', 'Completed', 'Unable to Complete'], order: 5 },
  ],
  project_report: [
    { id: 'pr-01', type: 'section_header', label: 'Project Details', placeholder: '', required: false, options: [], order: 1 },
    { id: 'pr-02', type: 'short_text', label: 'Project Name', placeholder: '', required: false, options: [], order: 2 },
    { id: 'pr-03', type: 'short_text', label: 'Estimate Number', placeholder: '', required: false, options: [], order: 3 },
    { id: 'pr-04', type: 'short_text', label: 'Address', placeholder: '', required: false, options: [], order: 4 },
    { id: 'pr-05', type: 'short_text', label: 'Client Name', placeholder: '', required: false, options: [], order: 5 },
    { id: 'pr-06', type: 'short_text', label: 'Client Email', placeholder: '', required: false, options: [], order: 6 },
    { id: 'pr-07', type: 'short_text', label: 'Client Phone Number', placeholder: '', required: false, options: [], order: 7 },
    { id: 'pr-08', type: 'short_text', label: 'Site Contact', placeholder: '', required: false, options: [], order: 8 },
    { id: 'pr-09', type: 'short_text', label: 'Prevailing Wage?', placeholder: '', required: false, options: [], order: 9 },
    { id: 'pr-10', type: 'short_text', label: 'Bonding / Insurance Requirements', placeholder: '', required: false, options: [], order: 10 },
    { id: 'pr-11', type: 'short_text', label: 'Bid Date', placeholder: '', required: false, options: [], order: 11 },
    { id: 'pr-12', type: 'short_text', label: 'Bid Platform', placeholder: '', required: false, options: [], order: 12 },
    { id: 'pr-13', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 13 },
    { id: 'pr-14', type: 'section_header', label: 'Project Durations', placeholder: '', required: false, options: [], order: 14 },
    { id: 'pr-15', type: 'short_text', label: 'Start Date', placeholder: '', required: false, options: [], order: 15 },
    { id: 'pr-16', type: 'short_text', label: 'Finish Date', placeholder: '', required: false, options: [], order: 16 },
    { id: 'pr-17', type: 'short_text', label: 'Number of Mobilizations', placeholder: '', required: false, options: [], order: 17 },
    { id: 'pr-18', type: 'short_text', label: 'Working Hours', placeholder: '', required: false, options: [], order: 18 },
    { id: 'pr-19', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 19 },
    { id: 'pr-20', type: 'section_header', label: 'Scope Of Work', placeholder: '', required: false, options: [], order: 20 },
    { id: 'pr-21', type: 'long_text', label: 'What are we doing?', placeholder: '', required: false, options: [], order: 21 },
    { id: 'pr-22', type: 'short_text', label: 'Number of rooms / sections', placeholder: '', required: false, options: [], order: 22 },
    { id: 'pr-23', type: 'short_text', label: 'Square footages', placeholder: '', required: false, options: [], order: 23 },
    { id: 'pr-24', type: 'short_text', label: 'Linear footage (cove or curbs)', placeholder: '', required: false, options: [], order: 24 },
    { id: 'pr-25', type: 'short_text', label: 'Cove curb height measurement', placeholder: '', required: false, options: [], order: 25 },
    { id: 'pr-26', type: 'short_text', label: 'Room Numbers / Names', placeholder: '', required: false, options: [], order: 26 },
    { id: 'pr-27', type: 'short_text', label: 'Open Areas / Machines', placeholder: '', required: false, options: [], order: 27 },
    { id: 'pr-28', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 28 },
    { id: 'pr-29', type: 'section_header', label: 'Site Information', placeholder: '', required: false, options: [], order: 29 },
    { id: 'pr-30', type: 'short_text', label: 'Power Supplied?', placeholder: '', required: false, options: [], order: 30 },
    { id: 'pr-31', type: 'short_text', label: 'Lighting Requirements', placeholder: '', required: false, options: [], order: 31 },
    { id: 'pr-32', type: 'short_text', label: 'Heating Cooling Requirements', placeholder: '', required: false, options: [], order: 32 },
    { id: 'pr-33', type: 'short_text', label: 'Rental Requirements', placeholder: '', required: false, options: [], order: 33 },
    { id: 'pr-34', type: 'short_text', label: 'Rental Location', placeholder: '', required: false, options: [], order: 34 },
    { id: 'pr-35', type: 'short_text', label: 'Rental Duration', placeholder: '', required: false, options: [], order: 35 },
    { id: 'pr-36', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 36 },
    { id: 'pr-37', type: 'section_header', label: 'Travel Information', placeholder: '', required: false, options: [], order: 37 },
    { id: 'pr-38', type: 'short_text', label: 'Hotel Name', placeholder: '', required: false, options: [], order: 38 },
    { id: 'pr-39', type: 'short_text', label: 'Hotel Location', placeholder: '', required: false, options: [], order: 39 },
    { id: 'pr-40', type: 'short_text', label: 'Reservation Number', placeholder: '', required: false, options: [], order: 40 },
    { id: 'pr-41', type: 'short_text', label: 'Reservation Contact', placeholder: '', required: false, options: [], order: 41 },
    { id: 'pr-42', type: 'short_text', label: 'Credit Card Authorization', placeholder: '', required: false, options: [], order: 42 },
    { id: 'pr-43', type: 'short_text', label: 'Drive Time', placeholder: '', required: false, options: [], order: 43 },
    { id: 'pr-44', type: 'short_text', label: 'Per Diem', placeholder: '', required: false, options: [], order: 44 },
    { id: 'pr-45', type: 'short_text', label: 'Vehicles', placeholder: '', required: false, options: [], order: 45 },
    { id: 'pr-46', type: 'short_text', label: 'Trailers', placeholder: '', required: false, options: [], order: 46 },
    { id: 'pr-47', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 47 },
    { id: 'pr-48', type: 'section_header', label: 'Material System', placeholder: '', required: false, options: [], order: 48 },
    { id: 'pr-49', type: 'short_text', label: 'Material System 1', placeholder: '', required: false, options: [], order: 49 },
    { id: 'pr-50', type: 'short_text', label: 'Material System 2', placeholder: '', required: false, options: [], order: 50 },
    { id: 'pr-51', type: 'short_text', label: 'Material System 3', placeholder: '', required: false, options: [], order: 51 },
    { id: 'pr-52', type: 'section_header', label: 'Material Quantities', placeholder: '', required: false, options: [], order: 52 },
    { id: 'pr-53', type: 'short_text', label: 'Material Quantities 1', placeholder: '', required: false, options: [], order: 53 },
    { id: 'pr-54', type: 'short_text', label: 'Material Quantities 2', placeholder: '', required: false, options: [], order: 54 },
    { id: 'pr-55', type: 'short_text', label: 'Material Quantities 3', placeholder: '', required: false, options: [], order: 55 },
    { id: 'pr-56', type: 'section_header', label: 'Prep', placeholder: '', required: false, options: [], order: 56 },
    { id: 'pr-57', type: 'short_text', label: 'Method (Grinder / Sandblast / Scarify)', placeholder: '', required: false, options: [], order: 57 },
    { id: 'pr-58', type: 'short_text', label: 'Removal (Full Removal / New Concrete)', placeholder: '', required: false, options: [], order: 58 },
    { id: 'pr-59', type: 'short_text', label: 'Patching Materials', placeholder: '', required: false, options: [], order: 59 },
    { id: 'pr-60', type: 'short_text', label: 'Joint Requirements (Pre-fill / Cut / Polyurea)', placeholder: '', required: false, options: [], order: 60 },
    { id: 'pr-61', type: 'short_text', label: 'Sloping Requirements', placeholder: '', required: false, options: [], order: 61 },
    { id: 'pr-62', type: 'short_text', label: 'Backfill / Excessive Patching', placeholder: '', required: false, options: [], order: 62 },
    { id: 'pr-63', type: 'short_text', label: 'Wet Area', placeholder: '', required: false, options: [], order: 63 },
    { id: 'pr-64', type: 'short_text', label: 'Climate Concerns', placeholder: '', required: false, options: [], order: 64 },
    { id: 'pr-65', type: 'short_text', label: 'Cooling Heating Constraints', placeholder: '', required: false, options: [], order: 65 },
    { id: 'pr-66', type: 'long_text', label: 'Additional Notes', placeholder: '', required: false, options: [], order: 66 },
  ],
}

/**
 * Hook to fetch form template fields from form_templates table.
 * Starts with fallback fields and updates when fetch completes.
 * If fetch fails or returns empty, fallback fields remain.
 */
export function useFormTemplate(formKey: string) {
  const [fields, setFields] = useState<FormField[]>(FALLBACK_FIELDS[formKey] ?? [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('form_templates')
      .select('fields')
      .eq('form_key', formKey)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.fields && Array.isArray(data.fields) && data.fields.length > 0) {
          const sorted = [...(data.fields as FormField[])].sort((a, b) => a.order - b.order)
          setFields(sorted)
        }
        // On error or empty result, keep fallback fields
        setLoading(false)
      })
  }, [formKey])

  return { fields, loading }
}
