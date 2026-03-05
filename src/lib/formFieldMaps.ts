import { FormField } from '@/types'

/**
 * Maps template field IDs and labels to content keys for backwards compatibility.
 * When a form is saved, the content structure must match the original typed interfaces
 * so that existing saved reports continue to load and display correctly.
 */

interface FieldKeyMap {
  byId: Record<string, string>
  byLabel: Record<string, string>
}

const FORM_FIELD_MAPS: Record<string, FieldKeyMap> = {
  daily_report: {
    byId: {
      'dr-02': 'project_name', 'dr-03': 'date', 'dr-04': 'address',
      'dr-06': 'reported_by', 'dr-07': 'project_foreman', 'dr-08': 'weather',
      'dr-10': 'progress', 'dr-11': 'delays', 'dr-12': 'safety',
      'dr-13': 'materials_used', 'dr-14': 'employees',
    },
    byLabel: {
      'Project Name': 'project_name', 'Date': 'date', 'Address': 'address',
      'Reported By': 'reported_by', 'Project Foreman': 'project_foreman',
      'Weather': 'weather', 'Progress': 'progress', 'Delays': 'delays',
      'Safety': 'safety', 'Materials Used': 'materials_used', 'Employees': 'employees',
    },
  },
  jsa_report: {
    byId: {
      'jsa-02': 'projectName', 'jsa-03': 'date', 'jsa-04': 'address',
      'jsa-05': 'weather', 'jsa-07': 'preparedBy', 'jsa-08': 'siteSupervisor',
      'jsa-09': 'competentPerson',
    },
    byLabel: {
      'Project Name': 'projectName', 'Date': 'date', 'Address': 'address',
      'Weather': 'weather', 'Prepared By': 'preparedBy',
      'Site Supervisor': 'siteSupervisor', 'Competent Person': 'competentPerson',
    },
  },
  expense: {
    byId: {
      'exp-03': 'vendor_name', 'exp-04': 'receipt_date',
      'exp-05': 'total_amount', 'exp-06': 'category',
    },
    byLabel: {
      'Vendor / Store Name': 'vendor_name', 'Date on Receipt': 'receipt_date',
      'Total Amount': 'total_amount', 'Category': 'category',
    },
  },
  timesheet: {
    byId: {
      'ts-02': 'project_name', 'ts-03': 'date', 'ts-04': 'address',
    },
    byLabel: {
      'Project Name': 'project_name', 'Date': 'date', 'Address': 'address',
    },
  },
  task: {
    byId: {
      'tsk-01': 'title', 'tsk-02': 'description', 'tsk-03': 'assigned_to',
      'tsk-04': 'due_date', 'tsk-05': 'status',
    },
    byLabel: {
      'Title': 'title', 'Description': 'description', 'Assign To': 'assigned_to',
      'Due Date': 'due_date', 'Status': 'status',
    },
  },
  project_report: {
    byId: {
      'pr-02': 'project_name', 'pr-03': 'estimate_number', 'pr-04': 'address',
      'pr-05': 'client_name', 'pr-06': 'client_email', 'pr-07': 'client_phone',
      'pr-08': 'site_contact', 'pr-09': 'prevailing_wage', 'pr-10': 'bonding_insurance',
      'pr-11': 'bid_date', 'pr-12': 'bid_platform', 'pr-13': 'project_details_notes',
      'pr-15': 'start_date', 'pr-16': 'finish_date', 'pr-17': 'num_mobilizations',
      'pr-18': 'working_hours', 'pr-19': 'durations_notes',
      'pr-21': 'scope_description', 'pr-22': 'num_rooms_sections',
      'pr-23': 'square_footages', 'pr-24': 'linear_footage', 'pr-25': 'cove_curb_height',
      'pr-26': 'room_numbers_names', 'pr-27': 'open_areas_machines', 'pr-28': 'scope_notes',
      'pr-30': 'power_supplied', 'pr-31': 'lighting_requirements',
      'pr-32': 'heating_cooling_requirements', 'pr-33': 'rental_requirements',
      'pr-34': 'rental_location', 'pr-35': 'rental_duration', 'pr-36': 'site_notes',
      'pr-38': 'hotel_name', 'pr-39': 'hotel_location', 'pr-40': 'reservation_number',
      'pr-41': 'reservation_contact', 'pr-42': 'credit_card_auth', 'pr-43': 'drive_time',
      'pr-44': 'per_diem', 'pr-45': 'vehicles', 'pr-46': 'trailers', 'pr-47': 'travel_notes',
      'pr-49': 'material_system_1', 'pr-50': 'material_system_2', 'pr-51': 'material_system_3',
      'pr-53': 'material_quantities_1', 'pr-54': 'material_quantities_2', 'pr-55': 'material_quantities_3',
      'pr-57': 'prep_method', 'pr-58': 'prep_removal', 'pr-59': 'patching_materials',
      'pr-60': 'joint_requirements', 'pr-61': 'sloping_requirements',
      'pr-62': 'backfill_patching', 'pr-63': 'wet_area', 'pr-64': 'climate_concerns',
      'pr-65': 'cooling_heating_constraints', 'pr-66': 'prep_notes',
    },
    byLabel: {
      // Project report has duplicate labels ("Additional Notes") so label mapping
      // is less reliable. We rely primarily on field IDs for this form.
      'Project Name': 'project_name', 'Estimate Number': 'estimate_number',
      'Address': 'address', 'Client Name': 'client_name', 'Client Email': 'client_email',
      'Client Phone Number': 'client_phone', 'Site Contact': 'site_contact',
      'Prevailing Wage?': 'prevailing_wage', 'Bonding / Insurance Requirements': 'bonding_insurance',
      'Bid Date': 'bid_date', 'Bid Platform': 'bid_platform',
      'Start Date': 'start_date', 'Finish Date': 'finish_date',
      'Number of Mobilizations': 'num_mobilizations',
      'Working Hours': 'working_hours',
      'What are we doing?': 'scope_description',
      'Number of rooms / sections': 'num_rooms_sections',
      'Square footages': 'square_footages', 'Linear footage (cove or curbs)': 'linear_footage',
      'Cove curb height measurement': 'cove_curb_height',
      'Room Numbers / Names': 'room_numbers_names', 'Open Areas / Machines': 'open_areas_machines',
      'Power Supplied?': 'power_supplied', 'Lighting Requirements': 'lighting_requirements',
      'Heating Cooling Requirements': 'heating_cooling_requirements',
      'Rental Requirements': 'rental_requirements', 'Rental Location': 'rental_location',
      'Rental Duration': 'rental_duration',
      'Hotel Name': 'hotel_name', 'Hotel Location': 'hotel_location',
      'Reservation Number': 'reservation_number', 'Reservation Contact': 'reservation_contact',
      'Credit Card Authorization': 'credit_card_auth', 'Drive Time': 'drive_time',
      'Per Diem': 'per_diem', 'Vehicles': 'vehicles', 'Trailers': 'trailers',
      'Material System 1': 'material_system_1', 'Material System 2': 'material_system_2',
      'Material System 3': 'material_system_3',
      'Material Quantities 1': 'material_quantities_1', 'Material Quantities 2': 'material_quantities_2',
      'Material Quantities 3': 'material_quantities_3',
      'Method (Grinder / Sandblast / Scarify)': 'prep_method',
      'Removal (Full Removal / New Concrete)': 'prep_removal',
      'Patching Materials': 'patching_materials',
      'Joint Requirements (Pre-fill / Cut / Polyurea)': 'joint_requirements',
      'Sloping Requirements': 'sloping_requirements',
      'Backfill / Excessive Patching': 'backfill_patching',
      'Wet Area': 'wet_area', 'Climate Concerns': 'climate_concerns',
      'Cooling Heating Constraints': 'cooling_heating_constraints',
    },
  },
}

/**
 * Get the content key for a template field.
 * First checks by field ID, then by label, then falls back to field.id.
 */
export function getContentKey(formKey: string, field: FormField): string {
  const map = FORM_FIELD_MAPS[formKey]
  if (!map) return field.id
  return map.byId[field.id] || map.byLabel[field.label] || field.id
}

/**
 * Check if a field is a "weather" field that needs special rendering
 * (auto-fetch with loading indicator).
 */
export function isWeatherField(formKey: string, field: FormField): boolean {
  const key = getContentKey(formKey, field)
  return key === 'weather'
}

/**
 * Get the set of all known content keys for a form.
 * Used when saving to distinguish known keys from custom field keys.
 */
export function getKnownContentKeys(formKey: string): Set<string> {
  const map = FORM_FIELD_MAPS[formKey]
  if (!map) return new Set()
  return new Set(Object.values(map.byId))
}

/**
 * Initialize values from saved content using the content key mapping.
 * Handles both known and custom field values.
 */
export function initValuesFromContent(
  formKey: string,
  content: Record<string, unknown>,
  fields: FormField[]
): Record<string, string> {
  const values: Record<string, string> = {}
  const knownKeys = getKnownContentKeys(formKey)

  // Map known content keys
  for (const key of knownKeys) {
    if (key in content) {
      values[key] = String(content[key] ?? '')
    }
  }

  // Map custom fields (content keys that match field IDs)
  for (const field of fields) {
    if (field.type === 'section_header' || field.type === 'signature') continue
    const contentKey = getContentKey(formKey, field)
    if (!knownKeys.has(contentKey) && field.id in content) {
      values[field.id] = String(content[field.id] ?? '')
    }
  }

  return values
}
