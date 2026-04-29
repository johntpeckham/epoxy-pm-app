'use client'

import { RulerIcon, ArrowRightIcon } from 'lucide-react'
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
      <div className="flex items-center gap-2">
        <span className="text-amber-500">
          <RulerIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Takeoffs</h3>
        <Link
          href={`/estimating/takeoff/${project.id}`}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
        >
          <ArrowRightIcon className="w-3.5 h-3.5" />
          View takeoff
        </Link>
      </div>
    </div>
  )
}
