'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  lookupCityCoords,
  CA_DEFAULT_CENTER,
  CA_DEFAULT_ZOOM,
} from '@/lib/caCityCoords'
import { XIcon, ChevronDownIcon } from 'lucide-react'
import {
  type ZoneMapCompany,
  type CompanyStatus,
  type FilterField,
  STATUS_MARKER_COLOR,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from './zoneMapTypes'
import SmartCallLists from './SmartCallLists'

interface TagRowMini {
  id: string
  name: string
}

const FILTER_CONFIG: { field: FilterField; label: string }[] = [
  { field: 'status', label: 'Status' },
  { field: 'zone', label: 'Zone' },
  { field: 'region', label: 'Region' },
  { field: 'state', label: 'State' },
  { field: 'county', label: 'County' },
  { field: 'city', label: 'City' },
  { field: 'industry', label: 'Industry' },
  { field: 'priority', label: 'Priority' },
  { field: 'tags', label: 'Tags' },
]

const EMPTY_FILTERS: Record<FilterField, Set<string>> = {
  status: new Set(),
  zone: new Set(),
  region: new Set(),
  state: new Set(),
  county: new Set(),
  city: new Set(),
  industry: new Set(),
  priority: new Set(),
  tags: new Set(),
}

// Minimal Leaflet typings — we load the library from CDN at runtime, so we
// don't bring in the @types/leaflet dep.
interface LeafletMarker {
  remove: () => void
  bindPopup: (html: string) => LeafletMarker
  on: (event: string, handler: () => void) => LeafletMarker
}
interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  remove: () => void
}
interface LeafletGlobal {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap
  tileLayer: (
    url: string,
    opts?: Record<string, unknown>
  ) => { addTo: (m: LeafletMap) => unknown }
  circleMarker: (
    latLng: [number, number],
    opts: Record<string, unknown>
  ) => { addTo: (m: LeafletMap) => LeafletMarker }
}
declare global {
  interface Window {
    L?: LeafletGlobal
  }
}

const LEAFLET_JS_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'

function loadLeafletScript(): Promise<LeafletGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'))
  }
  if (window.L) return Promise.resolve(window.L)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-leaflet="1"]`
    )
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.L) resolve(window.L)
        else reject(new Error('Leaflet failed to load'))
      })
      existing.addEventListener('error', () =>
        reject(new Error('Leaflet script load failed'))
      )
      return
    }
    const s = document.createElement('script')
    s.src = LEAFLET_JS_URL
    s.async = true
    s.dataset.leaflet = '1'
    s.crossOrigin = ''
    s.addEventListener('load', () => {
      if (window.L) resolve(window.L)
      else reject(new Error('Leaflet failed to load'))
    })
    s.addEventListener('error', () =>
      reject(new Error('Leaflet script load failed'))
    )
    document.head.appendChild(s)
  })
}

interface ZoneMapClientProps {
  userId: string
}

export default function ZoneMapClient({ userId }: ZoneMapClientProps) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<ZoneMapCompany[]>([])
  const [tags, setTags] = useState<TagRowMini[]>([])

  const [filters, setFilters] =
    useState<Record<FilterField, Set<string>>>(EMPTY_FILTERS)
  const [openFilter, setOpenFilter] = useState<FilterField | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')

  function toggleFilterValue(field: FilterField, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [field]: new Set(prev[field]) }
      if (next[field].has(value)) next[field].delete(value)
      else next[field].add(value)
      return next
    })
  }

  function clearFilter(field: FilterField) {
    setFilters((prev) => ({ ...prev, [field]: new Set<string>() }))
  }

  const activeFilterCount = useMemo(
    () =>
      (Object.keys(filters) as FilterField[]).reduce(
        (sum, f) => sum + filters[f].size,
        0
      ),
    [filters]
  )

  // Load companies + tag junctions + primary contacts + last call map.
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [
      { data: compRows },
      { data: contactRows },
      { data: callRows },
      { data: tagJunctionRows },
      { data: tagDefRows },
    ] = await Promise.all([
      supabase
        .from('crm_companies')
        .select(
          'id, name, industry, zone, region, state, county, city, status, priority'
        )
        .order('name', { ascending: true }),
      supabase
        .from('crm_contacts')
        .select('company_id, first_name, last_name, phone, is_primary'),
      supabase
        .from('crm_call_log')
        .select('company_id, call_date')
        .order('call_date', { ascending: false }),
      supabase.from('crm_company_tags').select('company_id, tag_id'),
      supabase.from('crm_tags').select('id, name').order('name'),
    ])
    setTags((tagDefRows ?? []) as TagRowMini[])

    type CompRow = Omit<ZoneMapCompany, 'tag_ids' | 'primary_contact_name' | 'primary_contact_phone' | 'last_call_date'>
    type ContactRow = {
      company_id: string
      first_name: string
      last_name: string
      phone: string | null
      is_primary: boolean
    }
    type CallRow = { company_id: string; call_date: string }
    type TagRow = { company_id: string; tag_id: string }

    // Map of company_id → primary contact (prefer is_primary; else first)
    const contactByCompany = new Map<string, ContactRow>()
    for (const c of (contactRows ?? []) as ContactRow[]) {
      const existing = contactByCompany.get(c.company_id)
      if (!existing) contactByCompany.set(c.company_id, c)
      else if (!existing.is_primary && c.is_primary)
        contactByCompany.set(c.company_id, c)
    }

    const lastCallMap = new Map<string, string>()
    for (const r of (callRows ?? []) as CallRow[]) {
      if (!lastCallMap.has(r.company_id)) lastCallMap.set(r.company_id, r.call_date)
    }

    const tagsByCompany = new Map<string, string[]>()
    for (const r of (tagJunctionRows ?? []) as TagRow[]) {
      const arr = tagsByCompany.get(r.company_id) ?? []
      arr.push(r.tag_id)
      tagsByCompany.set(r.company_id, arr)
    }

    const out: ZoneMapCompany[] = ((compRows ?? []) as CompRow[]).map((c) => {
      const contact = contactByCompany.get(c.id)
      return {
        ...c,
        tag_ids: tagsByCompany.get(c.id) ?? [],
        primary_contact_name: contact
          ? `${contact.first_name} ${contact.last_name}`.trim()
          : null,
        primary_contact_phone: contact?.phone ?? null,
        last_call_date: lastCallMap.get(c.id) ?? null,
      }
    })
    setCompanies(out)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Filter option sets ───────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const collect = (key: keyof ZoneMapCompany) => {
      const s = new Set<string>()
      for (const c of companies) {
        const v = c[key]
        if (typeof v === 'string' && v) s.add(v)
      }
      return [...s].sort()
    }
    return {
      status: (['prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted'] as CompanyStatus[]).map(
        (s) => ({ value: s, label: STATUS_LABELS[s] })
      ),
      zone: collect('zone').map((v) => ({ value: v, label: v })),
      region: collect('region').map((v) => ({ value: v, label: v })),
      state: collect('state').map((v) => ({ value: v, label: v })),
      county: collect('county').map((v) => ({ value: v, label: v })),
      city: collect('city').map((v) => ({ value: v, label: v })),
      industry: collect('industry').map((v) => ({ value: v, label: v })),
      priority: (['high', 'medium', 'low'] as const).map((p) => ({
        value: p,
        label: PRIORITY_LABELS[p],
      })),
      tags: tags.map((t) => ({ value: t.id, label: t.name })),
    } as Record<FilterField, { value: string; label: string }[]>
  }, [companies, tags])

  // ── Filtered rows (AND across fields, OR within a field) ─────────────
  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (filters.status.size > 0 && !filters.status.has(c.status)) return false
      if (filters.zone.size > 0 && (!c.zone || !filters.zone.has(c.zone)))
        return false
      if (filters.region.size > 0 && (!c.region || !filters.region.has(c.region)))
        return false
      if (filters.state.size > 0 && (!c.state || !filters.state.has(c.state)))
        return false
      if (filters.county.size > 0 && (!c.county || !filters.county.has(c.county)))
        return false
      if (filters.city.size > 0 && (!c.city || !filters.city.has(c.city)))
        return false
      if (
        filters.industry.size > 0 &&
        (!c.industry || !filters.industry.has(c.industry))
      )
        return false
      if (
        filters.priority.size > 0 &&
        (!c.priority || !filters.priority.has(c.priority))
      )
        return false
      if (filters.tags.size > 0) {
        if (!c.tag_ids.some((t) => filters.tags.has(t))) return false
      }
      return true
    })
  }, [companies, filters])

  const stats = useMemo(() => {
    const s = {
      total: filtered.length,
      prospect: 0,
      contacted: 0,
      hot_lead: 0,
      lost: 0,
      blacklisted: 0,
    }
    for (const c of filtered) s[c.status] += 1
    return s
  }, [filtered])

  // ── Map rendering ─────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletMarker[]>([])
  const [mapReady, setMapReady] = useState(false)

  // Initialize (or re-initialize) the map whenever the map view is active.
  useEffect(() => {
    if (view !== 'map') return
    let cancelled = false
    loadLeafletScript()
      .then((L) => {
        if (cancelled || !mapContainerRef.current) return
        if (mapRef.current) return // already set up
        const map = L.map(mapContainerRef.current, {
          scrollWheelZoom: true,
          zoomControl: true,
        }).setView(
          [CA_DEFAULT_CENTER.lat, CA_DEFAULT_CENTER.lng],
          CA_DEFAULT_ZOOM
        )
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map)
        mapRef.current = map
        setMapReady(true)
      })
      .catch(() => {
        // If the CDN fails we simply leave the map blank.
      })
    return () => {
      cancelled = true
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setMapReady(false)
    }
  }, [view])

  // Re-render markers whenever filtered list changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L) return
    const L = window.L
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
    for (const c of filtered) {
      const coords = lookupCityCoords(c.city)
      if (!coords) continue
      const color = STATUS_MARKER_COLOR[c.status as CompanyStatus] ?? '#6b7280'
      const radius =
        c.status === 'hot_lead' ? 10 : c.status === 'blacklisted' ? 6 : 8
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: c.status === 'blacklisted' ? 0.45 : 0.75,
        weight: 1.5,
      }).addTo(mapRef.current!)
      marker.bindPopup(renderPopupHtml(c))
      markersRef.current.push(marker)
    }
  }, [filtered, mapReady])

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[22px] font-medium text-gray-900">Zone Map</h1>
          <p className="text-sm text-gray-400">
            Visual overview of your territory.
          </p>
        </div>
        <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden text-xs">
          <button
            onClick={() => setView('map')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              view === 'map'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 ${
              view === 'list'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-xs text-gray-400 mb-2">Loading companies…</div>
      )}

      {/* ── Filter bar ── */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filter:</span>
        {FILTER_CONFIG.map(({ field, label }) => {
          const selected = filters[field]
          const options = filterOptions[field]
          const active = selected.size > 0
          return (
            <div key={field} className="relative">
              <button
                onClick={() =>
                  setOpenFilter((f) => (f === field ? null : field))
                }
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                style={{ borderRadius: 20 }}
              >
                {label}
                {active && (
                  <span className="text-[10px] text-blue-500">
                    ({selected.size})
                  </span>
                )}
                {active ? (
                  <XIcon
                    className="w-3 h-3 ml-0.5 hover:text-blue-900"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFilter(field)
                    }}
                  />
                ) : (
                  <ChevronDownIcon className="w-3 h-3" />
                )}
              </button>
              {openFilter === field && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setOpenFilter(null)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[200px] max-h-[300px] overflow-y-auto">
                    {options.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">
                        No values
                      </div>
                    ) : (
                      options.map((opt) => {
                        const checked = selected.has(opt.value)
                        return (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleFilterValue(field, opt.value)
                              }
                              className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                            />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="mb-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="text-gray-900 font-medium">
          Showing {stats.total} {stats.total === 1 ? 'company' : 'companies'}
        </span>
        <span className="text-gray-300">·</span>
        <StatChip color="#16a34a" count={stats.prospect} label="prospect" />
        <StatChip color="#2563eb" count={stats.contacted} label="contacted" />
        <StatChip color="#f59e0b" count={stats.hot_lead} label="hot lead" />
        <StatChip color="#dc2626" count={stats.lost} label="lost" />
      </div>

      {view === 'map' ? (
        <div className="relative">
          <div
            ref={mapContainerRef}
            className="w-full rounded-xl border border-gray-200 bg-white overflow-hidden"
            style={{ height: 500 }}
          />
          {/* Legend overlay */}
          <div className="absolute bottom-3 right-3 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-[11px] leading-tight">
            <div className="text-gray-500 mb-1 font-medium">Status</div>
            <LegendRow color="#16a34a" label="Prospect" />
            <LegendRow color="#2563eb" label="Contacted" />
            <LegendRow color="#f59e0b" label="Hot lead" />
            <LegendRow color="#dc2626" label="Lost" />
            <LegendRow color="#9ca3af" label="Blacklisted" />
          </div>
        </div>
      ) : (
        <ListView rows={filtered} />
      )}

      {/* Smart call lists section */}
      <SmartCallLists userId={userId} />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function StatChip({
  color,
  count,
  label,
}: {
  color: string
  count: number
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-600">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="tabular-nums">{count}</span>
      <span className="text-gray-400">{label}</span>
    </span>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-gray-700">{label}</span>
    </div>
  )
}

function ListView({ rows }: { rows: ZoneMapCompany[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center text-sm text-gray-400">
        No companies match the current filters.
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">Zone</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/sales/crm/${r.id}`}
                    className="text-gray-900 hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {STATUS_LABELS[r.status] ?? r.status}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.city ?? '—'}</td>
                <td className="px-4 py-2 text-gray-600">{r.zone ?? '—'}</td>
                <td className="px-4 py-2 text-gray-600">{r.industry ?? '—'}</td>
                <td className="px-4 py-2 text-gray-500 tabular-nums">
                  {formatDate(r.last_call_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderPopupHtml(c: ZoneMapCompany): string {
  const href = `/sales/crm/${c.id}`
  const statusLabel = STATUS_LABELS[c.status] ?? c.status
  const lines: string[] = []
  lines.push(
    `<a href="${href}" style="font-weight:600;color:#111827;text-decoration:none">${escapeHtml(c.name)}</a>`
  )
  const metaParts: string[] = [statusLabel]
  if (c.industry) metaParts.push(escapeHtml(c.industry))
  if (c.zone) metaParts.push(`Zone ${escapeHtml(c.zone)}`)
  lines.push(
    `<div style="color:#6b7280;font-size:11px;margin-top:2px">${metaParts.join(' · ')}</div>`
  )
  if (c.primary_contact_name) {
    const phone = c.primary_contact_phone
      ? ` · ${escapeHtml(c.primary_contact_phone)}`
      : ''
    lines.push(
      `<div style="color:#374151;font-size:12px;margin-top:6px">${escapeHtml(c.primary_contact_name)}${phone}</div>`
    )
  }
  lines.push(
    `<div style="color:#9ca3af;font-size:11px;margin-top:4px">Last call: ${formatDate(c.last_call_date)}</div>`
  )
  lines.push(
    `<div style="margin-top:8px"><a href="${href}" style="color:#0d9488;font-size:12px;font-weight:500;text-decoration:none">Open →</a></div>`
  )
  return `<div style="min-width:180px">${lines.join('')}</div>`
}
