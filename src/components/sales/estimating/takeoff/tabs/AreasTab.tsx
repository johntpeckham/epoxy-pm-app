'use client'

import { PlusIcon } from 'lucide-react'
import { AREA_TYPE_STYLES } from '../../types'
import type { TakeoffAreaType } from '../../types'

const ADD_BUTTONS: { type: TakeoffAreaType; label: string }[] = [
  { type: 'floor', label: '+ Add floor' },
  { type: 'roof', label: '+ Add roof' },
  { type: 'walls', label: '+ Add walls' },
  { type: 'cove', label: '+ Add cove' },
  { type: 'custom', label: '+ Add custom' },
]

interface SampleArea {
  id: string
  type: TakeoffAreaType
  name: string
  totalLabel: string
  sections: { name: string; length: number; width: number | null; total: number }[]
  showCoveButton?: boolean
}

const SAMPLE_AREAS: SampleArea[] = [
  {
    id: '1',
    type: 'floor',
    name: 'Main production floor',
    totalLabel: '3,200 SF',
    sections: [
      { name: 'Section A', length: 80, width: 20, total: 1600 },
      { name: 'Section B', length: 80, width: 20, total: 1600 },
    ],
    showCoveButton: true,
  },
  {
    id: '2',
    type: 'cove',
    name: 'Cove base — main floor',
    totalLabel: '420 LF',
    sections: [
      { name: 'North wall', length: 80, width: null, total: 80 },
      { name: 'South wall', length: 80, width: null, total: 80 },
      { name: 'East wall', length: 130, width: null, total: 130 },
      { name: 'West wall', length: 130, width: null, total: 130 },
    ],
  },
  {
    id: '3',
    type: 'walls',
    name: 'North wall',
    totalLabel: '380 SF',
    sections: [
      { name: 'Section 1', length: 40, width: 9.5, total: 380 },
    ],
  },
]

export default function AreasTab() {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Mobile-only: Measurement references shown first */}
      <div className="lg:hidden">
        <MeasurementReferences />
      </div>

      {/* Left column: area buttons + area cards */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Area type add buttons */}
        <div className="flex flex-wrap gap-2">
          {ADD_BUTTONS.map((btn) => (
            <button
              key={btn.type}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:text-amber-600 hover:border-amber-400 transition"
            >
              {btn.label}
            </button>
          ))}
        </div>

      {/* Area cards */}
      {SAMPLE_AREAS.map((area) => {
        const style = AREA_TYPE_STYLES[area.type]
        const isLinear = area.type === 'cove'
        return (
          <div
            key={area.id}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style.className}`}
                >
                  {style.label}
                </span>
                <h4 className="text-sm font-semibold text-gray-900">
                  {area.name}
                </h4>
              </div>
              <span className="text-sm font-medium text-gray-500">
                {area.totalLabel}
              </span>
            </div>

            {/* Measurement table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide">
                    <th className="pb-2 pr-3 font-medium">Section</th>
                    <th className="pb-2 pr-3 font-medium text-right">Length</th>
                    {!isLinear && (
                      <th className="pb-2 pr-3 font-medium text-right">Width</th>
                    )}
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {area.sections.map((s, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-gray-700">{s.name}</td>
                      <td className="py-2 pr-3 text-right text-gray-600">
                        {s.length}
                      </td>
                      {!isLinear && (
                        <td className="py-2 pr-3 text-right text-gray-600">
                          {s.width}
                        </td>
                      )}
                      <td className="py-2 text-right font-medium text-gray-900">
                        {s.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition">
                <PlusIcon className="w-3.5 h-3.5" />
                Add section
              </button>
              {area.showCoveButton && (
                <button className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 transition">
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add cove to this floor
                </button>
              )}
            </div>
          </div>
        )
      })}

      </div>

      {/* Right column: sticky measurement references (desktop only) */}
      <div className="hidden lg:block w-80 flex-shrink-0">
        <div className="sticky top-4">
          <MeasurementReferences />
        </div>
      </div>
    </div>
  )
}

function MeasurementReferences() {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Measurement references
      </h4>
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600">
            Floor plan — main area
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            From project measurements
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600">
            Photo — warehouse overview
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            From project measurements
          </p>
        </div>
      </div>
    </div>
  )
}
