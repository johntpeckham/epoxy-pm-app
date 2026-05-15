'use client'

import { useMemo } from 'react'
import { AREA_TYPE_STYLES } from '../../types'
import type { EstimateArea, EstimateAreaMeasurement } from '../../types'

interface Props {
  areas: EstimateArea[]
  sections: EstimateAreaMeasurement[]
  totalSfMeasurements: number
}

function formatTotal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function unitForType(type: EstimateArea['area_type']): 'SF' | 'LF' {
  return type === 'cove' ? 'LF' : 'SF'
}

export default function SummaryTab({ areas, sections, totalSfMeasurements }: Props) {
  // Per-area totals for the Measurements summary block.
  const areaSummary = useMemo(() => {
    const sectionsByArea = new Map<string, EstimateAreaMeasurement[]>()
    for (const s of sections) {
      const arr = sectionsByArea.get(s.area_id) ?? []
      arr.push(s)
      sectionsByArea.set(s.area_id, arr)
    }
    return areas.map((a) => {
      const rows = sectionsByArea.get(a.id) ?? []
      let total = 0
      for (const s of rows) if (typeof s.total === 'number') total += s.total
      return { area: a, total, unit: unitForType(a.area_type) }
    })
  }, [areas, sections])

  const hasAreas = areas.length > 0

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Total measurements"
          value={hasAreas ? `${formatTotal(totalSfMeasurements)} sf` : '—'}
        />
        <MetricCard label="Hard cost" value="—" />
        <MetricCard label="Final total" value="—" highlight />
      </div>

      {/* Proposal calculator — all rows em-dash until later phases wire it */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Proposal calculator</h3>
        <div className="space-y-2 text-sm">
          <LineItem label="Material cost" value="—" />
          <LineItem label="Labor" value="—" />
          <LineItem label="Travel" value="—" />
          <LineItem label="Prep & tools" value="—" />
          <LineItem label="Sundries" value="—" />
          <LineItem label="Misc" value="—" />
          <LineItem label="Mobilization cost" value="—" />
          <div className="border-t border-gray-200 my-2" />
          <LineItem label="Hard cost" value="—" bold bg />
          <LineItem label="Overhead (15%)" value="—" />
          <LineItem label="Subtotal" value="—" />
          <LineItem label="Profit (30%)" value="—" />
          <div className="border-t border-gray-200 my-2" />
          <div className="flex justify-between items-center py-1.5 px-2 bg-gray-50 rounded-lg">
            <span className="font-semibold text-gray-900">Final total</span>
            <span className="text-lg font-bold text-gray-400">—</span>
          </div>
          <LineItem label="$/SF" value="—" />
        </div>
      </div>

      {/* Measurements summary — wired to real area / section data */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Measurements summary</h3>
        {!hasAreas ? (
          <p className="text-xs text-gray-500 italic">No areas yet — add one on the Areas & measurements tab.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Array.from(new Set(areas.map((a) => a.area_type))).map((type) => {
                const style = AREA_TYPE_STYLES[type]
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style.className}`}
                  >
                    {style.label}
                  </span>
                )
              })}
            </div>
            <div className="space-y-1.5 text-sm">
              {areaSummary.map(({ area, total, unit }) => {
                const style = AREA_TYPE_STYLES[area.area_type]
                return (
                  <div key={area.id} className="flex items-center justify-between gap-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 ${style.className}`}
                      >
                        {style.label}
                      </span>
                      <span className="text-gray-700 truncate">
                        {area.name || `Untitled ${area.area_type}`}
                      </span>
                    </div>
                    <span className="text-gray-500 font-medium flex-shrink-0">
                      {formatTotal(total)} {unit}
                    </span>
                  </div>
                )
              })}
              <div className="border-t border-gray-200 my-1" />
              <div className="flex justify-between py-1 font-semibold">
                <span className="text-gray-900">Total (SF)</span>
                <span className="text-gray-900">{formatTotal(totalSfMeasurements)} SF</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function LineItem({
  label,
  value,
  bold,
  bg,
}: {
  label: string
  value: string
  bold?: boolean
  bg?: boolean
}) {
  return (
    <div className={`flex justify-between py-1 px-2 rounded ${bg ? 'bg-amber-50' : ''}`}>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{value}</span>
    </div>
  )
}
