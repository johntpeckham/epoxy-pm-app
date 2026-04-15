export type CompanyStatus =
  | 'prospect'
  | 'contacted'
  | 'hot_lead'
  | 'lost'
  | 'blacklisted'
export type CompanyPriority = 'high' | 'medium' | 'low'

export type FilterField =
  | 'status'
  | 'zone'
  | 'region'
  | 'state'
  | 'county'
  | 'city'
  | 'industry'
  | 'priority'
  | 'tags'

export interface ZoneMapCompany {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: CompanyStatus
  priority: CompanyPriority | null
  tag_ids: string[]
  primary_contact_name: string | null
  primary_contact_phone: string | null
  last_call_date: string | null
}

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  hot_lead: 'Hot Lead',
  lost: 'Lost',
  blacklisted: 'Blacklisted',
}

// Hex colors chosen to match the STATUS_TEXT_COLOR palette from CrmTableClient.
export const STATUS_MARKER_COLOR: Record<CompanyStatus, string> = {
  prospect: '#16a34a', // green
  contacted: '#2563eb', // blue
  hot_lead: '#f59e0b', // amber
  lost: '#dc2626', // red
  blacklisted: '#9ca3af', // gray
}

export const PRIORITY_LABELS: Record<CompanyPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export interface SmartListFilters {
  zone: string[]
  region: string[]
  state: string[]
  county: string[]
  city: string[]
  industry: string[]
  status: string[]
  priority: string[]
  tags: string[]
}

export interface SmartListRow {
  id: string
  name: string
  filters: SmartListFilters
  contact_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export const EMPTY_SMART_FILTERS: SmartListFilters = {
  zone: [],
  region: [],
  state: [],
  county: [],
  city: [],
  industry: [],
  status: [],
  priority: [],
  tags: [],
}
