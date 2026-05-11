'use client'

import { LEAD_SOURCE_OPTIONS, isCanonicalLeadSource, formatLeadSource } from '@/lib/crm/leadSources'

interface LeadSourceDropdownProps {
  value: string
  onChange: (next: string) => void
  className?: string
  disabled?: boolean
}

export default function LeadSourceDropdown({
  value,
  onChange,
  className,
  disabled,
}: LeadSourceDropdownProps) {
  const isLegacy = value !== '' && !isCanonicalLeadSource(value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">— Select —</option>
      {LEAD_SOURCE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {isLegacy && (
        <option value={value}>{formatLeadSource(value)} (legacy)</option>
      )}
    </select>
  )
}
