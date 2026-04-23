export interface QueuedContact {
  contact_id: string
  contact_first_name: string
  contact_last_name: string
  contact_job_title: string | null
  contact_email: string | null
  contact_phone: string | null
  company_id: string
  company_name: string
  company_industry: string | null
  company_zone: string | null
  company_city: string | null
  company_state: string | null
  company_priority: 'high' | 'medium' | 'low' | null
  last_call_date: string | null
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
