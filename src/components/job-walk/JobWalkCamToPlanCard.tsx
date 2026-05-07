'use client'

import { ScanLineIcon } from 'lucide-react'

export default function JobWalkCamToPlanCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <ScanLineIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Cam to Plan</h3>
      </div>
      <div className="py-8 text-center">
        <p className="text-sm text-gray-400">Coming soon</p>
      </div>
    </div>
  )
}
