export interface Customer {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  created_at: string
  user_id: string
}

export interface LineItem {
  id: string
  description: string
  ft: number | null
  rate: number | null
  amount: number
}

export interface MaterialSystemItemRow {
  material_name: string
  thickness: string
  coverage_rate: string
  item_notes: string
  quantity: string
}

export interface MaterialSystemRow {
  id: string
  systemName: string
  notes: string
  items: MaterialSystemItemRow[]
}

export interface Estimate {
  id: string
  estimate_number: number
  customer_id: string
  date: string
  project_name: string | null
  description: string | null
  salesperson: string | null
  line_items: LineItem[]
  material_systems: MaterialSystemRow[]
  subtotal: number
  tax: number
  total: number
  terms: string | null
  notes: string | null
  status: 'Draft' | 'Sent' | 'Accepted' | 'Invoiced'
  created_at: string
  user_id: string
}

export interface EstimateSettings {
  id: string
  user_id: string
  next_estimate_number: number
  company_name: string | null
  company_address: string | null
  company_city_state_zip: string | null
  company_website: string | null
  company_phone: string | null
  logo_base64: string | null
}

export interface ChangeOrder {
  id: string
  parent_type: 'estimate' | 'invoice'
  parent_id: string
  change_order_number: string
  description: string
  line_items: LineItem[]
  subtotal: number
  status: 'Pending' | 'Approved' | 'Rejected'
  notes: string | null
  created_at: string
  updated_at: string
  user_id: string
}

export const DEFAULT_TERMS = `Payment Terms
- 40% deposit due when material is ordered.
- Net 30 upon completion of project.
Pricing assumes:
- Site will be clean and free of debris prior to arrival.
- Peckham will not remove or move customer equipment.
- Overtime is not included unless otherwise addressed.
- Open shop labor is assumed unless otherwise addressed.
Exclusions:
- Excessive patching of substrate.
- Anything that can not be visually determined prior to starting the project.
- Sloping is not assumed. Coatings will follow contour of existing substrate unless otherwise addressed.
Warranty Information:
- One year warranty will apply to all projects unless otherwise addressed.
- Peckham Inc. DBA Peckham Coatings will not warrant coating failures caused by inadequate substrate, conditions that cannot be visually determined, occur after installation, or are beyond our control.`
