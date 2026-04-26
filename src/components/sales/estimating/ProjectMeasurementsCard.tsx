'use client'

import { RulerIcon } from 'lucide-react'
import Link from 'next/link'
import type { EstimatingProject } from './types'

interface ProjectMeasurementsCardProps {
  project: EstimatingProject
}

export default function ProjectMeasurementsCard({
  project,
}: ProjectMeasurementsCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <RulerIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Takeoffs</h3>
      </div>

      <Link
        href={`/sales/estimating/measurement-tool/${project.id}`}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition"
      >
        <RulerIcon className="w-4 h-4" />
        View takeoff
      </Link>
    </div>
  )
}
