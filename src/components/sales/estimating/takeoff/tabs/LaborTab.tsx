'use client'

import { PlusIcon, UsersIcon } from 'lucide-react'

interface CrewMember {
  role: string
  rate: number
  hours: number
  total: number
}

const CREW_1: CrewMember[] = [
  { role: 'Foreman', rate: 55, hours: 40, total: 2200 },
  { role: 'Finisher', rate: 45, hours: 40, total: 1800 },
  { role: 'Laborer', rate: 35, hours: 40, total: 1400 },
]

const DRIVE_TIME: CrewMember[] = [
  { role: 'Foreman', rate: 20, hours: 8, total: 160 },
  { role: 'Finisher', rate: 20, hours: 8, total: 160 },
  { role: 'Laborer', rate: 20, hours: 8, total: 160 },
]

function crewTotal(members: CrewMember[]) {
  return members.reduce((s, m) => s + m.total, 0)
}

export default function LaborTab() {
  const crew1Total = crewTotal(CREW_1)
  const driveTotal = crewTotal(DRIVE_TIME)
  const laborTotal = crew1Total + driveTotal

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Crew 1 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <UsersIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Crew 1</h3>
          </div>
          <span className="text-sm font-medium text-gray-500">
            ${crew1Total.toLocaleString()}
          </span>
        </div>

        <CrewTable members={CREW_1} />

        <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition">
          <PlusIcon className="w-3.5 h-3.5" />
          Add crew member
        </button>
      </div>

      {/* Add crew group button */}
      <button className="w-full inline-flex items-center justify-center gap-1 px-3 py-2.5 text-sm font-medium text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:text-amber-600 hover:border-amber-400 transition">
        <PlusIcon className="w-4 h-4" />
        Add crew group
      </button>

      {/* Drive time */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <UsersIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900">Drive time</h3>
          </div>
          <span className="text-sm font-medium text-gray-500">
            ${driveTotal.toLocaleString()}
          </span>
        </div>

        <CrewTable members={DRIVE_TIME} />

        <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition">
          <PlusIcon className="w-3.5 h-3.5" />
          Add crew member
        </button>
      </div>

      {/* Labor total */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between font-semibold text-sm">
          <span className="text-gray-900">Labor total</span>
          <span className="text-gray-900">${laborTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

function CrewTable({ members }: { members: CrewMember[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide">
            <th className="pb-2 pr-3 font-medium">Role</th>
            <th className="pb-2 pr-3 font-medium text-right">$/hr</th>
            <th className="pb-2 pr-3 font-medium text-right">Est. hours</th>
            <th className="pb-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {members.map((m, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3 font-medium text-gray-900">{m.role}</td>
              <td className="py-2.5 pr-3 text-right text-gray-600">${m.rate}</td>
              <td className="py-2.5 pr-3 text-right text-gray-600">{m.hours}</td>
              <td className="py-2.5 text-right font-medium text-gray-900">
                ${m.total.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
