'use client'

import Link from 'next/link'
import { ArrowLeftIcon, TruckIcon } from 'lucide-react'
import VendorsManager from '@/components/vendors/VendorsManager'

interface Props {
  userId: string
}

export default function VendorsPageClient({ userId }: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
      <div className="bg-white dark:bg-[#242424] px-4 sm:px-6 pt-4 pb-0">
        <Link
          href="/office"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Office
        </Link>
      </div>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2">
          <TruckIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 flex-1 min-h-0 w-full flex flex-col">
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 p-4">
          <VendorsManager userId={userId} />
        </div>
      </div>
    </div>
  )
}
