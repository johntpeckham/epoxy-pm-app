'use client'

import { useState } from 'react'
import { Settings2Icon, UsersIcon } from 'lucide-react'
import TeamTasksSection from './TeamTasksSection'
import ManageAssignedTasksModal from './ManageAssignedTasksModal'

interface Props {
  currentUserId: string
}

export default function TeamTasksCard({ currentUserId }: Props) {
  const [showManage, setShowManage] = useState(false)
  // Remount TeamTasksSection after changes to refetch
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <UsersIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Team Tasks</h3>
        <button
          onClick={() => setShowManage(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
        >
          <Settings2Icon className="w-3.5 h-3.5" />
          Manage tasks
        </button>
      </div>

      <TeamTasksSection key={reloadKey} currentUserId={currentUserId} />

      {showManage && (
        <ManageAssignedTasksModal
          onClose={() => setShowManage(false)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
