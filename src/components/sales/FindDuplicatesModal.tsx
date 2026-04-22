'use client'

import { useState, useMemo } from 'react'
import { XIcon, CheckIcon, MergeIcon } from 'lucide-react'
import Link from 'next/link'
import Portal from '@/components/ui/Portal'
import { companyNameSimilarity } from '@/lib/csv'

interface ContactInfo {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

interface CompanyInfo {
  id: string
  name: string
  city: string | null
  state: string | null
  industry: string | null
  contacts: ContactInfo[]
}

interface DuplicatePair {
  companyA: CompanyInfo
  companyB: CompanyInfo
  reasons: string[]
}

interface FindDuplicatesModalProps {
  companies: CompanyInfo[]
  onClose: () => void
  onMerge: (idA: string, idB: string) => void
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+\.]/g, '')
}

function findDuplicates(companies: CompanyInfo[]): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>()

  const pairKey = (a: string, b: string) =>
    a < b ? `${a}::${b}` : `${b}::${a}`

  const addPair = (a: CompanyInfo, b: CompanyInfo, reason: string) => {
    const key = pairKey(a.id, b.id)
    const existing = pairs.get(key)
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
    } else {
      pairs.set(key, { companyA: a, companyB: b, reasons: [reason] })
    }
  }

  // Name similarity
  for (let i = 0; i < companies.length; i++) {
    for (let j = i + 1; j < companies.length; j++) {
      const score = companyNameSimilarity(companies[i].name, companies[j].name)
      if (score >= 0.7) {
        addPair(companies[i], companies[j], `Similar names (${Math.round(score * 100)}%)`)
      }
    }
  }

  // Phone index
  const phoneIndex = new Map<string, CompanyInfo[]>()
  for (const c of companies) {
    for (const ct of c.contacts) {
      if (ct.phone) {
        const norm = normalizePhone(ct.phone)
        if (norm.length >= 7) {
          const list = phoneIndex.get(norm) ?? []
          if (!list.some((x) => x.id === c.id)) list.push(c)
          phoneIndex.set(norm, list)
        }
      }
    }
  }
  for (const group of phoneIndex.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addPair(group[i], group[j], 'Same phone number')
      }
    }
  }

  // Email index
  const emailIndex = new Map<string, CompanyInfo[]>()
  for (const c of companies) {
    for (const ct of c.contacts) {
      if (ct.email) {
        const norm = ct.email.trim().toLowerCase()
        if (norm) {
          const list = emailIndex.get(norm) ?? []
          if (!list.some((x) => x.id === c.id)) list.push(c)
          emailIndex.set(norm, list)
        }
      }
    }
  }
  for (const group of emailIndex.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addPair(group[i], group[j], 'Same email')
      }
    }
  }

  return Array.from(pairs.values()).sort((a, b) => b.reasons.length - a.reasons.length)
}

export default function FindDuplicatesModal({
  companies,
  onClose,
  onMerge,
}: FindDuplicatesModalProps) {
  const duplicates = useMemo(() => findDuplicates(companies), [companies])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visibleDuplicates = duplicates.filter(
    (d) => !dismissed.has(`${d.companyA.id}::${d.companyB.id}`)
  )

  function handleDismiss(a: string, b: string) {
    const key = a < b ? `${a}::${b}` : `${b}::${a}`
    setDismissed((prev) => new Set(prev).add(key))
  }

  function companyLabel(c: CompanyInfo) {
    const parts = [c.industry, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean)
    return parts.join(' · ')
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-5 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              Potential Duplicates
              {visibleDuplicates.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({visibleDuplicates.length} pair{visibleDuplicates.length !== 1 ? 's' : ''})
                </span>
              )}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {visibleDuplicates.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">
                No potential duplicates found.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleDuplicates.map((pair) => (
                  <div
                    key={`${pair.companyA.id}::${pair.companyB.id}`}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Link
                            href={`/sales/crm/${pair.companyA.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-amber-600"
                            target="_blank"
                          >
                            {pair.companyA.name}
                          </Link>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {companyLabel(pair.companyA) || 'No details'}
                          </div>
                          {pair.companyA.contacts.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {pair.companyA.contacts.length} contact{pair.companyA.contacts.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        <div>
                          <Link
                            href={`/sales/crm/${pair.companyB.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-amber-600"
                            target="_blank"
                          >
                            {pair.companyB.name}
                          </Link>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {companyLabel(pair.companyB) || 'No details'}
                          </div>
                          {pair.companyB.contacts.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {pair.companyB.contacts.length} contact{pair.companyB.contacts.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {pair.reasons.map((reason) => (
                          <span
                            key={reason}
                            className="inline-flex px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 rounded-full"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleDismiss(pair.companyA.id, pair.companyB.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          Not a duplicate
                        </button>
                        <button
                          onClick={() => onMerge(pair.companyA.id, pair.companyB.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          <MergeIcon className="w-3.5 h-3.5" />
                          Merge
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
