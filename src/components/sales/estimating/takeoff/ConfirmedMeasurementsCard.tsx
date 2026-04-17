'use client'

import { AREA_TYPE_STYLES } from '../types'
import type { TakeoffAreaType } from '../types'

interface AreaSummary {
  name: string
  type: TakeoffAreaType
  total: string
}

const SAMPLE_AREAS: AreaSummary[] = [
  { name: 'Main production floor', type: 'floor', total: '3,200 SF' },
  { name: 'Office area floor', type: 'floor', total: '850 SF' },
  { name: 'Cove base — main floor', type: 'cove', total: '420 LF' },
  { name: 'North wall', type: 'walls', total: '380 SF' },
]

export default function ConfirmedMeasurementsCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Project measurements
      </h4>
      <div className="space-y-2">
        {SAMPLE_AREAS.map((area, i) => {
          const style = AREA_TYPE_STYLES[area.type]
          return (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 ${style.className}`}
                >
                  {style.label}
                </span>
                <span className="text-xs text-gray-700 truncate">
                  {area.name}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-500 flex-shrink-0">
                {area.total}
              </span>
            </div>
          )
        })}
      </div>
      <div className="border-t border-gray-200 mt-3 pt-2 flex justify-between">
        <span className="text-xs font-semibold text-gray-900">Total</span>
        <span className="text-xs font-semibold text-gray-900">4,850 SF</span>
      </div>
    </div>
  )
}
