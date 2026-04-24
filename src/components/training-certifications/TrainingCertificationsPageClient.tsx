'use client'

import Link from 'next/link'
import { ArrowLeftIcon, GraduationCapIcon } from 'lucide-react'

export default function TrainingCertificationsPageClient() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Link
          href="/office"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Office
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <GraduationCapIcon className="w-5 h-5 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training & Certifications</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Track employee training, certifications, and compliance. Coming soon.
        </p>

        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl py-16 text-center">
          <GraduationCapIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Nothing here yet.</p>
        </div>
      </div>
    </div>
  )
}
