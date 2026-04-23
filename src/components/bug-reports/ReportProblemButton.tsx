'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BugIcon } from 'lucide-react'
import ReportProblemModal from './ReportProblemModal'
import { usePermissions } from '@/lib/usePermissions'

interface ReportProblemButtonProps {
  /** Retained for back-compat; now ignored — permissions come from the hook. */
  role?: string
  userId: string
}

export default function ReportProblemButton({ userId }: ReportProblemButtonProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { canView } = usePermissions()

  const isAdmin = canView('bug_reports')

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  function handleClick() {
    if (isAdmin) {
      setShowDropdown((prev) => !prev)
    } else {
      setShowModal(true)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
      >
        <BugIcon className="w-4 h-4 flex-shrink-0" />
        Report a Problem
      </button>

      {/* Admin dropdown */}
      {showDropdown && isAdmin && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
          <button
            onClick={() => {
              setShowDropdown(false)
              setShowModal(true)
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <BugIcon className="w-4 h-4 flex-shrink-0" />
            Report a Problem
          </button>
          <div className="border-t border-gray-700" />
          <button
            onClick={() => {
              setShowDropdown(false)
              router.push('/bug-reports')
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View All Reports
          </button>
        </div>
      )}

      {showModal && (
        <ReportProblemModal
          onClose={() => setShowModal(false)}
          userId={userId}
        />
      )}
    </div>
  )
}
