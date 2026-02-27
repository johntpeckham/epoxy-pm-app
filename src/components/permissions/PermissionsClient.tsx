'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftIcon, ShieldIcon, CheckIcon, LoaderIcon } from 'lucide-react'
import type { AccessLevel, RolePermission } from '@/types'

const ROLES = ['salesman', 'foreman', 'crew'] as const
const ROLE_LABELS: Record<string, string> = {
  salesman: 'Salesman',
  foreman: 'Foreman',
  crew: 'Crew',
}
const ROLE_COLORS: Record<string, string> = {
  salesman: 'bg-blue-100 text-blue-700',
  foreman: 'bg-amber-100 text-amber-700',
  crew: 'bg-gray-100 text-gray-600',
}

const FEATURES = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'daily_reports', label: 'Daily Reports' },
  { key: 'jsa_reports', label: 'JSA Reports' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'photos', label: 'Photos' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'project_reports', label: 'Project Reports' },
] as const

const ACCESS_OPTIONS: { value: AccessLevel; label: string; color: string; activeColor: string }[] = [
  { value: 'full', label: 'Full', color: 'border-green-200 text-green-700 bg-green-50', activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'create', label: 'Create', color: 'border-blue-200 text-blue-700 bg-blue-50', activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'view_only', label: 'View', color: 'border-amber-200 text-amber-700 bg-amber-50', activeColor: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'off', label: 'Off', color: 'border-gray-200 text-gray-500 bg-gray-50', activeColor: 'border-gray-500 bg-gray-500 text-white' },
]

export default function PermissionsClient() {
  const router = useRouter()
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // "role:feature" being saved
  const [saved, setSaved] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role')
      .order('feature')

    setPermissions((data as RolePermission[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  function getAccess(role: string, feature: string): AccessLevel {
    const perm = permissions.find((p) => p.role === role && p.feature === feature)
    return perm?.access_level ?? 'full'
  }

  async function updatePermission(role: string, feature: string, level: AccessLevel) {
    const key = `${role}:${feature}`
    setSaving(key)

    const supabase = createClient()
    const existing = permissions.find((p) => p.role === role && p.feature === feature)

    if (existing) {
      await supabase
        .from('role_permissions')
        .update({ access_level: level, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('role_permissions')
        .insert({ role, feature, access_level: level })
    }

    // Optimistically update local state
    setPermissions((prev) => {
      const idx = prev.findIndex((p) => p.role === role && p.feature === feature)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], access_level: level }
        return next
      }
      return [...prev, { id: '', role, feature, access_level: level, updated_at: new Date().toISOString() } as RolePermission]
    })

    setSaving(null)
    setSaved(key)
    setTimeout(() => setSaved(null), 1000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <ShieldIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
            <p className="text-sm text-gray-500">Control what each role can access. Admin always has full access.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop Matrix */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Feature</th>
                    {ROLES.map((role) => (
                      <th key={role} className="px-5 py-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[role]}`}>
                          {ROLE_LABELS[role]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((feature, i) => (
                    <tr key={feature.key} className={i < FEATURES.length - 1 ? 'border-b border-gray-100' : ''}>
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">{feature.label}</td>
                      {ROLES.map((role) => {
                        const current = getAccess(role, feature.key)
                        const cellKey = `${role}:${feature.key}`
                        return (
                          <td key={role} className="px-5 py-4">
                            <div className="flex items-center justify-center gap-1">
                              {ACCESS_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => updatePermission(role, feature.key, opt.value)}
                                  disabled={saving === cellKey}
                                  className={`px-2.5 py-1 rounded-md border text-xs font-medium transition ${
                                    current === opt.value ? opt.activeColor : opt.color
                                  } ${saving === cellKey ? 'opacity-50' : 'hover:opacity-80'}`}
                                >
                                  {saved === cellKey && current === opt.value ? (
                                    <CheckIcon className="w-3 h-3 inline" />
                                  ) : (
                                    opt.label
                                  )}
                                </button>
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden space-y-4">
              {ROLES.map((role) => (
                <div key={role} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[role]}`}>
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {FEATURES.map((feature) => {
                      const current = getAccess(role, feature.key)
                      const cellKey = `${role}:${feature.key}`
                      return (
                        <div key={feature.key} className="px-4 py-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900">{feature.label}</span>
                          <div className="flex items-center gap-1">
                            {ACCESS_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => updatePermission(role, feature.key, opt.value)}
                                disabled={saving === cellKey}
                                className={`px-2 py-1 rounded-md border text-xs font-medium transition ${
                                  current === opt.value ? opt.activeColor : opt.color
                                } ${saving === cellKey ? 'opacity-50' : ''}`}
                              >
                                {saved === cellKey && current === opt.value ? (
                                  <CheckIcon className="w-3 h-3 inline" />
                                ) : (
                                  opt.label
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Access Levels</p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span><strong>Full</strong> — View, create, edit, and delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span><strong>Create</strong> — View and create, but no edit or delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span><strong>View</strong> — Read-only access, no create/edit/delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  <span><strong>Off</strong> — Feature is completely hidden</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
