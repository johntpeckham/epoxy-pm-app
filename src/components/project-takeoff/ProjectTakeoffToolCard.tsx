'use client'

import Link from 'next/link'
import { CompassIcon, ArrowUpRightIcon } from 'lucide-react'

export default function ProjectTakeoffToolCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <CompassIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Takeoff</h3>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Upload plans and take measurements with polygon and polyline tools in the full takeoff workspace.
      </p>

      <Link
        href="/job-takeoff"
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
      >
        Open takeoff tool
        <ArrowUpRightIcon className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
