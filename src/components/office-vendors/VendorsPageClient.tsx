'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import VendorsManager from '@/components/vendors/VendorsManager'

interface Props {
  userId: string
}

export default function VendorsPageClient({ userId }: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-4 h-full flex flex-col">
        {/* Back link */}
        <Link
          href="/office"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Office
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        </div>

        {/* Vendors manager content */}
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <VendorsManager userId={userId} />
        </div>
      </div>
    </div>
  )
}
