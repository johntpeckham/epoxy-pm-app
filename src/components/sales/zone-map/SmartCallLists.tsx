'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PlusIcon, PhoneIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SmartCallListModal, {
  buildMatchingContacts,
} from './SmartCallListModal'
import {
  type SmartListRow,
  type SmartListFilters,
  STATUS_LABELS,
  PRIORITY_LABELS,
  EMPTY_SMART_FILTERS,
} from './zoneMapTypes'

interface SmartCallListsProps {
  userId: string
}

interface CompanyLite {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: string
  priority: 'high' | 'medium' | 'low' | null
}

interface ContactLite {
  id: string
  company_id: string
  first_name: string
  last_name: string
  is_primary: boolean
}

export default function SmartCallLists({ userId }: SmartCallListsProps) {
  const supabase = useMemo(() => createClient(), [])

  const [lists, setLists] = useState<SmartListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<SmartListRow | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [contacts, setContacts] = useState<ContactLite[]>([])
  const [lastCallMap, setLastCallMap] = useState<Map<string, string>>(new Map())
  const [tagsByCompany, setTagsByCompany] = useState<Map<string, string[]>>(
    new Map()
  )

  const fetchLists = useCallback(async () => {
    const { data } = await supabase
      .from('crm_smart_lists')
      .select('id, name, filters, contact_count, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false })
    const rows = (data ?? []) as Array<{
      id: string
      name: string
      filters: SmartListFilters | null
      contact_count: number | null
      created_by: string | null
      created_at: string
      updated_at: string
    }>
    setLists(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        filters: { ...EMPTY_SMART_FILTERS, ...(r.filters ?? {}) },
        contact_count: r.contact_count ?? 25,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }))
    )
    setLoading(false)
  }, [supabase])

  const fetchMatchingData = useCallback(async () => {
    const [
      { data: compData },
      { data: contactData },
      { data: callData },
      { data: tagJunctions },
    ] = await Promise.all([
      supabase
        .from('crm_companies')
        .select(
          'id, name, industry, zone, region, state, county, city, status, priority'
        ),
      supabase
        .from('crm_contacts')
        .select('id, company_id, first_name, last_name, is_primary'),
      supabase
        .from('crm_call_log')
        .select('company_id, call_date')
        .order('call_date', { ascending: false }),
      supabase.from('crm_company_tags').select('company_id, tag_id'),
    ])
    setCompanies((compData ?? []) as CompanyLite[])
    setContacts((contactData ?? []) as ContactLite[])
    const m = new Map<string, string>()
    for (const r of (callData ?? []) as { company_id: string; call_date: string }[]) {
      if (!m.has(r.company_id)) m.set(r.company_id, r.call_date)
    }
    setLastCallMap(m)
    const tm = new Map<string, string[]>()
    for (const r of (tagJunctions ?? []) as { company_id: string; tag_id: string }[]) {
      const arr = tm.get(r.company_id) ?? []
      arr.push(r.tag_id)
      tm.set(r.company_id, arr)
    }
    setTagsByCompany(tm)
  }, [supabase])

  useEffect(() => {
    fetchLists()
    fetchMatchingData()
  }, [fetchLists, fetchMatchingData])

  async function handleDelete(id: string) {
    await supabase.from('crm_smart_lists').delete().eq('id', id)
    setDeleteId(null)
    fetchLists()
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-medium text-gray-900">
          Smart call lists
        </h2>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New list
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">Loading lists…</div>
      ) : lists.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
          <p className="text-sm text-gray-500">
            No saved lists yet. Create one to quickly generate call queues.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lists.map((list) => (
            <SmartListCard
              key={list.id}
              list={list}
              companies={companies}
              contacts={contacts}
              lastCallMap={lastCallMap}
              tagsByCompany={tagsByCompany}
              onEdit={() => setEditing(list)}
              onDelete={() => setDeleteId(list.id)}
            />
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <SmartCallListModal
          userId={userId}
          existing={editing}
          onClose={() => {
            setShowNew(false)
            setEditing(null)
          }}
          onSaved={() => {
            setShowNew(false)
            setEditing(null)
            fetchLists()
          }}
        />
      )}

      {deleteId && (
        <ConfirmDialog
          title="Delete smart list?"
          message="This will permanently delete this saved list."
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
          variant="destructive"
        />
      )}
    </div>
  )
}

function SmartListCard({
  list,
  companies,
  contacts,
  lastCallMap,
  tagsByCompany,
  onEdit,
  onDelete,
}: {
  list: SmartListRow
  companies: CompanyLite[]
  contacts: ContactLite[]
  lastCallMap: Map<string, string>
  tagsByCompany: Map<string, string[]>
  onEdit: () => void
  onDelete: () => void
}) {
  const match = useMemo(
    () =>
      buildMatchingContacts({
        filters: list.filters,
        contactCount: list.contact_count,
        sortLeastRecent: true,
        companies,
        contacts,
        lastCallMap,
        tagsByCompany,
      }),
    [list, companies, contacts, lastCallMap, tagsByCompany]
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-900">{list.name}</h3>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          {summarize(list)}
        </p>
        <p className="text-xs text-gray-400 mt-2 tabular-nums">
          {match.matchCount} matching contact
          {match.matchCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Link
          href={`/sales/dialer?list=${list.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
        >
          <PhoneIcon className="w-3.5 h-3.5" />
          Start dialer
        </Link>
        <button
          onClick={onEdit}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function summarize(list: SmartListRow): string {
  const parts: string[] = []
  const f = list.filters
  if (f.zone.length) parts.push(`Zone ${f.zone.join(', ')}`)
  if (f.region.length) parts.push(f.region.join(', '))
  if (f.state.length) parts.push(f.state.join(', '))
  if (f.county.length) parts.push(f.county.join(', '))
  if (f.city.length) parts.push(f.city.join(', '))
  if (f.industry.length) parts.push(f.industry.join(', '))
  if (f.status.length) {
    parts.push(
      f.status
        .map((s) =>
          (STATUS_LABELS as Record<string, string>)[s] ?? s
        )
        .join(' + ')
    )
  }
  if (f.priority.length) {
    parts.push(
      f.priority
        .map((p) =>
          (PRIORITY_LABELS as Record<string, string>)[p] ?? p
        )
        .join(', ')
    )
  }
  parts.push(`${list.contact_count} calls`)
  return parts.length > 0 ? parts.join(' · ') : `${list.contact_count} calls`
}
