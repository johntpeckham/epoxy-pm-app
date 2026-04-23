export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeftIcon, UserPlusIcon } from 'lucide-react'
import { requirePermission } from '@/lib/requirePermission'

export default async function AddUserPage() {
  await requirePermission('user_management', 'create')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a1a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 min-w-0 mb-6">
          <Link href="/settings/users" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <UserPlusIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Add user</h1>
        </div>
        <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Coming soon — the add user flow is being built.
          </p>
        </div>
      </div>
    </div>
  )
}
