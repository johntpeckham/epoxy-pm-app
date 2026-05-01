import type { TakeoffItem, TakeoffSection } from './types'

// ─── Pure helpers for sectioned measurement rendering ───────────────────
// Used by every surface that displays grouped measurements (in-PDF
// sidebar, Takeoff overview card, downloaded report). Keeping the math
// here means subtotal + project-total numbers stay consistent across
// surfaces — change the rules in one place and every view updates.

export function sortSections(sections: TakeoffSection[]): TakeoffSection[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Group items by their sectionId, preserving array order within each
 * group. Items whose sectionId points at a non-existent section get
 * bucketed under the first section so they remain visible.
 *
 * Returns a Map keyed by sectionId. Sections with zero items are still
 * present in the map (empty array) so the caller can render headers +
 * subtotals for them.
 */
export function groupItemsBySection(
  sections: TakeoffSection[],
  items: TakeoffItem[]
): Map<string, TakeoffItem[]> {
  const sorted = sortSections(sections)
  const fallback = sorted[0]?.id
  const map = new Map<string, TakeoffItem[]>()
  for (const s of sorted) map.set(s.id, [])
  for (const it of items) {
    const target =
      it.sectionId && map.has(it.sectionId) ? it.sectionId : fallback
    if (!target) continue
    const arr = map.get(target)
    if (arr) arr.push(it)
  }
  return map
}

export interface MeasurementTotals {
  linear: number
  area: number
  perim: number
}

export function computeTotals(items: TakeoffItem[]): MeasurementTotals {
  let linear = 0
  let area = 0
  let perim = 0
  for (const it of items) {
    if (it.type === 'linear') {
      for (const m of it.measurements) linear += m.valueInFeet
    } else {
      for (const m of it.measurements) {
        area += m.valueInFeet
        perim += m.perimeterFt || 0
      }
    }
  }
  return { linear, area, perim }
}

/**
 * Per-section subtotals. Project totals are computed by summing the
 * subtotals (or by passing all items to computeTotals) — both produce
 * the same result.
 */
export function computeSectionTotals(
  sections: TakeoffSection[],
  items: TakeoffItem[]
): Map<string, MeasurementTotals> {
  const grouped = groupItemsBySection(sections, items)
  const result = new Map<string, MeasurementTotals>()
  for (const [sectionId, sectionItems] of grouped) {
    result.set(sectionId, computeTotals(sectionItems))
  }
  return result
}

export function computeProjectTotals(items: TakeoffItem[]): MeasurementTotals {
  return computeTotals(items)
}
