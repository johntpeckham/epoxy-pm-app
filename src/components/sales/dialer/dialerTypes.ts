export type ContactPhoneType = 'office' | 'mobile' | 'fax' | 'other'

export interface ContactPhone {
  id: string
  phone_number: string
  phone_type: ContactPhoneType
  is_primary: boolean
}

export interface QueuedContact {
  id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  is_primary: boolean
  phones: ContactPhone[]
}

export interface QueuedCompany {
  company_id: string
  company_name: string
  company_industry: string | null
  company_zone: string | null
  company_city: string | null
  company_state: string | null
  company_status: string
  company_priority: 'high' | 'medium' | 'low' | null
  contacts: QueuedContact[]
  activeContactId: string
  lastCallDate: string | null
}

export interface SessionStats {
  total: number
  connected: number
  voicemail: number
  no_answer: number
  busy: number
  wrong_number: number
  appointment: number
  skipped: number
}

export const OUTCOME_OPTIONS = [
  { value: 'connected', label: 'Connected' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'appointment', label: 'Set appointment' },
] as const

export type OutcomeValue = (typeof OUTCOME_OPTIONS)[number]['value']

// Logged outcomes. 'appointment' is special — it opens the appointment modal,
// but we also log it as 'connected' in crm_call_log.
export function outcomeToCallLog(
  outcome: OutcomeValue
): 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'wrong_number' {
  if (outcome === 'appointment') return 'connected'
  return outcome
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (!withTime) return date
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} · ${time}`
}

// Company-level cooldown: exclude companies whose most recent call is within
// the last 30 days. Hardcoded — no UI toggle.
export const COMPANY_COOLDOWN_DAYS = 30
export const COMPANY_COOLDOWN_MS = COMPANY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

export function isWithinCooldown(
  lastCallDate: string | null,
  now: number = Date.now()
): boolean {
  if (!lastCallDate) return false
  const t = new Date(lastCallDate).getTime()
  if (Number.isNaN(t)) return false
  return now - t < COMPANY_COOLDOWN_MS
}

const PHONE_TYPE_RANK: Record<ContactPhoneType, number> = {
  office: 0,
  mobile: 1,
  fax: 2,
  other: 3,
}

export function normalizePhoneType(raw: string | null | undefined): ContactPhoneType {
  if (raw === 'mobile' || raw === 'fax' || raw === 'other') return raw
  return 'office'
}

export function sortPhones(phones: ContactPhone[]): ContactPhone[] {
  return [...phones].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return PHONE_TYPE_RANK[a.phone_type] - PHONE_TYPE_RANK[b.phone_type]
  })
}

export const PHONE_TYPE_LABEL: Record<ContactPhoneType, string> = {
  office: 'Office',
  mobile: 'Mobile',
  fax: 'Fax',
  other: 'Other',
}

function compareContacts(a: QueuedContact, b: QueuedContact): number {
  const ln = (a.last_name || '').localeCompare(b.last_name || '')
  if (ln !== 0) return ln
  return (a.first_name || '').localeCompare(b.first_name || '')
}

// Initial active contact: prefer is_primary = true; otherwise alphabetical by
// last name then first name. Caller must guarantee `contacts` is non-empty.
export function pickInitialActiveContactId(contacts: QueuedContact[]): string {
  const primary = contacts.find((c) => c.is_primary)
  if (primary) return primary.id
  const sorted = [...contacts].sort(compareContacts)
  return sorted[0].id
}

// Helper: look up the active contact on a queued company, falling back to the
// first contact in the array if the id is somehow missing.
export function getActiveContact(company: QueuedCompany): QueuedContact {
  return (
    company.contacts.find((c) => c.id === company.activeContactId) ??
    company.contacts[0]
  )
}
