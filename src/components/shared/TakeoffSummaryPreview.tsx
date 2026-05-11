'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { TakeoffItem, TakeoffSection } from '@/components/takeoff/types'
import {
  computeProjectTotals,
  computeSectionTotals,
  groupItemsBySection,
  sortSections,
} from '@/components/takeoff/sectionTotals'

interface TakeoffSummaryPreviewProps {
  projectId: string
}

interface SectionRow {
  id: string
  project_id: string
  name: string
  sort_order: number
}

interface MeasurementRow {
  id: string
  project_id: string
  pdf_id: string
  page_number: number
  // Persisted as jsonb. Shape matches MeasurementPageSlice from TakeoffClient.
  measurements: { items?: TakeoffItem[] } | null
  hidden: boolean
}

/**
 * Mirrors mergeItemsById from TakeoffClient (src/components/sales/estimating/
 * TakeoffClient.tsx). Items live as duplicated entries across pages in the
 * estimating_project_measurements jsonb (one row per PDF page); each entry
 * carries the same id but only the measurements that fall on that page.
 * Without this merge, computeTotals would over-count an item that spans
 * multiple pages, and groupItemsBySection would push the same item into the
 * same section bucket more than once — inflating the "item count" display.
 *
 * Keep this function behaviorally identical to TakeoffClient's local copy;
 * if that one changes (e.g. handles new TakeoffItem fields), update this
 * one too.
 */
function mergeItemsById(items: TakeoffItem[]): TakeoffItem[] {
  const merged: TakeoffItem[] = []
  for (const incoming of items) {
    const existing = merged.find((i) => i.id === incoming.id)
    if (existing) {
      existing.measurements = [...existing.measurements, ...incoming.measurements]
    } else {
      merged.push({ ...incoming, measurements: [...incoming.measurements] })
    }
  }
  return merged
}

function formatFeet(value: number): string {
  // Two-decimal precision matches the rest of the takeoff UI (sidebar +
  // dashboard subtotals use the same fixed(2)).
  return value.toFixed(2)
}

export default function TakeoffSummaryPreview({ projectId }: TakeoffSummaryPreviewProps) {
  const [sections, setSections] = useState<TakeoffSection[]>([])
  const [items, setItems] = useState<TakeoffItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const [sectionsRes, measurementsRes] = await Promise.all([
        supabase
          .from('estimating_project_measurement_sections')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('estimating_project_measurements')
          .select('id, project_id, pdf_id, page_number, measurements, hidden')
          .eq('project_id', projectId),
      ])

      if (cancelled) return

      if (sectionsRes.error) {
        console.error('[TakeoffSummaryPreview] Sections load failed:', {
          code: sectionsRes.error.code,
          message: sectionsRes.error.message,
          hint: sectionsRes.error.hint,
          details: sectionsRes.error.details,
        })
      }
      if (measurementsRes.error) {
        console.error('[TakeoffSummaryPreview] Measurements load failed:', {
          code: measurementsRes.error.code,
          message: measurementsRes.error.message,
          hint: measurementsRes.error.hint,
          details: measurementsRes.error.details,
        })
      }

      const sectionRows = (sectionsRes.data ?? []) as SectionRow[]
      const measurementRows = (measurementsRes.data ?? []) as MeasurementRow[]

      // Match TakeoffClient's data flow exactly: flatten every row's
      // measurements.items[] (including rows where hidden=true), then merge
      // by id. TakeoffClient/TakeoffSidebar/TakeoffDashboard all feed the
      // full merged item list into computeProjectTotals without a hidden
      // filter — see src/components/takeoff/TakeoffSidebar.tsx:262 and
      // src/components/takeoff/TakeoffDashboard.tsx:452. Mirroring that
      // means the summary preview and the live takeoff view always agree.
      const allItems: TakeoffItem[] = []
      for (const row of measurementRows) {
        const slice = row.measurements ?? {}
        const sliceItems = (slice.items ?? []) as TakeoffItem[]
        for (const it of sliceItems) allItems.push(it)
      }
      const mergedItems = mergeItemsById(allItems)

      const clientSections: TakeoffSection[] = sectionRows.map((s) => ({
        id: s.id,
        projectId: s.project_id,
        name: s.name,
        sortOrder: s.sort_order,
      }))

      setSections(clientSections)
      setItems(mergedItems)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const sortedSections = useMemo(() => sortSections(sections), [sections])
  const projectTotals = useMemo(() => computeProjectTotals(items), [items])
  const sectionTotals = useMemo(
    () => computeSectionTotals(sortedSections, items),
    [sortedSections, items]
  )
  const itemsBySectionId = useMemo(
    () => groupItemsBySection(sortedSections, items),
    [sortedSections, items]
  )

  if (loading) {
    return (
      <div className="py-4 flex items-center justify-center text-gray-400">
        <Loader2Icon className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  // Empty state — no sections at all (a fresh project that hasn't been
  // opened in the takeoff tool yet, so the Default section backfill never
  // ran for it) OR sections exist but no items have been drawn yet.
  if (sortedSections.length === 0 || items.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        No takeoff measurements yet. Click View takeoff to start.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Overall totals row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Total Linear
          </p>
          <p className="text-sm font-medium text-gray-900 tabular-nums">
            {formatFeet(projectTotals.linear)} ft
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Total Area
          </p>
          <p className="text-sm font-medium text-gray-900 tabular-nums">
            {formatFeet(projectTotals.area)} ft²
          </p>
        </div>
      </div>

      {/* Per-section breakdown */}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
        {sortedSections.map((s) => {
          const totals = sectionTotals.get(s.id) ?? { linear: 0, area: 0, perim: 0 }
          const itemCount = itemsBySectionId.get(s.id)?.length ?? 0
          return (
            <div
              key={s.id}
              className="flex items-baseline justify-between gap-3 px-3 py-2 bg-white"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{s.name}</p>
                <p className="text-[11px] text-gray-400">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-600 tabular-nums">
                  {formatFeet(totals.linear)} ft
                </p>
                <p className="text-xs text-gray-600 tabular-nums">
                  {formatFeet(totals.area)} ft²
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
