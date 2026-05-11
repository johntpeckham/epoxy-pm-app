export interface LeadSourceOption {
  value: string
  label: string
}

export const LEAD_SOURCE_OPTIONS: LeadSourceOption[] = [
  { value: 'google_maps', label: 'Google Maps' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'other', label: 'Other' },
]

export const LEAD_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_SOURCE_OPTIONS.map((o) => [o.value, o.label])
)

export function isCanonicalLeadSource(value: string | null | undefined): boolean {
  if (!value) return false
  return LEAD_SOURCE_OPTIONS.some((o) => o.value === value)
}

export function formatLeadSource(value: string | null | undefined): string | null {
  if (!value) return null
  return LEAD_SOURCE_LABELS[value] ?? value
}
