'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftIcon, ShieldIcon, CheckIcon, LoaderIcon } from 'lucide-react'
import type { AccessLevel } from '@/types'
import {
  FEATURE_KEYS,
  FEATURE_METADATA,
  type FeatureKey,
  type FeatureCategory,
} from '@/lib/featureKeys'

interface PermissionTemplate {
  id: string
  name: string
  description: string | null
  is_system: boolean
}

interface TemplatePermissionRow {
  id: string
  template_id: string
  feature: FeatureKey
  access_level: AccessLevel
}

const ACCESS_OPTIONS: { value: AccessLevel; label: string; color: string; activeColor: string }[] = [
  { value: 'full',      label: 'Full',      color: 'border-green-200 text-green-700 bg-green-50',  activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'create',    label: 'Create',    color: 'border-blue-200 text-blue-700 bg-blue-50',     activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'view_only', label: 'View only', color: 'border-amber-200 text-amber-700 bg-amber-50',  activeColor: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'off',       label: 'Off',       color: 'border-gray-200 text-gray-500 bg-gray-50',     activeColor: 'border-gray-500 bg-gray-500 text-white' },
]

const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  core:      'Core',
  job_board: 'Job Board',
  sales:     'Sales',
  office:    'Office',
  settings:  'Settings',
  other:     'Other',
}

// Ordered list of features for rendering, grouped by category in sort_order.
// Driven entirely by FEATURE_METADATA (the canonical 35-key list).
const ORDERED_FEATURES: { feature: FeatureKey; displayName: string; category: FeatureCategory; sortOrder: number }[] =
  FEATURE_KEYS.map((feature) => ({ feature, ...FEATURE_METADATA[feature] })).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

// Preserve the category order by their first sortOrder occurrence.
const CATEGORY_ORDER: FeatureCategory[] = (() => {
  const seen = new Set<FeatureCategory>()
  const order: FeatureCategory[] = []
  for (const f of ORDERED_FEATURES) {
    if (!seen.has(f.category)) {
      seen.add(f.category)
      order.push(f.category)
    }
  }
  return order
})()

const FEATURES_BY_CATEGORY: Record<FeatureCategory, typeof ORDERED_FEATURES> = (() => {
  const grouped = { core: [], job_board: [], sales: [], office: [], settings: [], other: [] } as Record<
    FeatureCategory,
    typeof ORDERED_FEATURES
  >
  for (const f of ORDERED_FEATURES) grouped[f.category].push(f)
  return grouped
})()

export default function PermissionsClient() {
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [rows, setRows] = useState<TemplatePermissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)   // `${template_id}:${feature}`
  const [saved, setSaved] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const fetchAll = useCallback(async () => {
    const [tplRes, permRes] = await Promise.all([
      supabase
        .from('permission_templates')
        .select('id, name, description, is_system')
        .order('name'),
      supabase
        .from('template_permissions')
        .select('id, template_id, feature, access_level'),
    ])

    if (tplRes.error) console.error('[Permissions] Fetch templates failed:', tplRes.error)
    if (permRes.error) console.error('[Permissions] Fetch template_permissions failed:', permRes.error)

    setTemplates((tplRes.data as PermissionTemplate[]) ?? [])
    setRows((permRes.data as TemplatePermissionRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Build a quick lookup: `${template_id}:${feature}` → row
  const rowIndex = useMemo(() => {
    const map = new Map<string, TemplatePermissionRow>()
    for (const r of rows) map.set(`${r.template_id}:${r.feature}`, r)
    return map
  }, [rows])

  function getAccess(templateId: string, feature: FeatureKey): AccessLevel {
    return rowIndex.get(`${templateId}:${feature}`)?.access_level ?? 'off'
  }

  async function updateAccess(templateId: string, feature: FeatureKey, level: AccessLevel) {
    const cellKey = `${templateId}:${feature}`
    setSaving(cellKey)

    const existing = rowIndex.get(cellKey)
    let returnedRow: TemplatePermissionRow | null = null

    if (existing) {
      const { data, error } = await supabase
        .from('template_permissions')
        .update({ access_level: level })
        .eq('id', existing.id)
        .select('id, template_id, feature, access_level')
        .single()
      if (error) {
        console.error('[Permissions] Update failed:', error)
        setSaving(null)
        return
      }
      returnedRow = data as TemplatePermissionRow
    } else {
      const { data, error } = await supabase
        .from('template_permissions')
        .insert({ template_id: templateId, feature, access_level: level })
        .select('id, template_id, feature, access_level')
        .single()
      if (error) {
        console.error('[Permissions] Insert failed:', error)
        setSaving(null)
        return
      }
      returnedRow = data as TemplatePermissionRow
    }

    // Replace or append using the DB-returned row (real id, no '' placeholder).
    setRows((prev) => {
      const idx = prev.findIndex((p) => p.template_id === templateId && p.feature === feature)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = returnedRow as TemplatePermissionRow
        return next
      }
      return [...prev, returnedRow as TemplatePermissionRow]
    })

    setSaving(null)
    setSaved(cellKey)
    setTimeout(() => setSaved((k) => (k === cellKey ? null : k)), 1000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/settings/users" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <ShieldIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">User permissions</h1>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-500 mb-6">
          Edit default permission templates for new users. Changing a template does
          {' '}<strong className="text-gray-700">not</strong> change existing users — it only affects users added from here on.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600">
            No templates found. Re-run the Phase 2a migration to seed the default templates.
          </div>
        ) : (
          <>
            {/* Desktop matrix */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Feature
                    </th>
                    {templates.map((tpl) => (
                      <th key={tpl.id} className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{tpl.name}</span>
                          {tpl.is_system && (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium uppercase tracking-wide">
                              System
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_ORDER.map((category) => (
                    <CategoryGroup
                      key={category}
                      category={category}
                      columnCount={templates.length + 1}
                    >
                      {FEATURES_BY_CATEGORY[category].map((feature) => (
                        <tr key={feature.feature} className="border-t border-gray-100">
                          <td className="px-5 py-3 text-sm font-medium text-gray-900">
                            {feature.displayName}
                          </td>
                          {templates.map((tpl) => {
                            const cellKey = `${tpl.id}:${feature.feature}`
                            const current = getAccess(tpl.id, feature.feature)
                            const isSaving = saving === cellKey
                            const justSaved = saved === cellKey
                            return (
                              <td key={tpl.id} className="px-5 py-3">
                                <div className="flex items-center justify-center">
                                  <AccessLevelSelect
                                    value={current}
                                    disabled={isSaving}
                                    justSaved={justSaved}
                                    onChange={(next) => updateAccess(tpl.id, feature.feature, next)}
                                  />
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </CategoryGroup>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card layout — one card per template */}
            <div className="md:hidden space-y-4">
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{tpl.name}</span>
                    {tpl.is_system && (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium uppercase tracking-wide">
                        System
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {CATEGORY_ORDER.map((category) => (
                      <div key={category}>
                        <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {CATEGORY_LABEL[category]}
                        </div>
                        {FEATURES_BY_CATEGORY[category].map((feature) => {
                          const cellKey = `${tpl.id}:${feature.feature}`
                          const current = getAccess(tpl.id, feature.feature)
                          const isSaving = saving === cellKey
                          const justSaved = saved === cellKey
                          return (
                            <div
                              key={feature.feature}
                              className="px-4 py-3 flex items-center justify-between gap-3 border-t border-gray-100"
                            >
                              <span className="text-sm font-medium text-gray-900">{feature.displayName}</span>
                              <AccessLevelSelect
                                value={current}
                                disabled={isSaving}
                                justSaved={justSaved}
                                onChange={(next) => updateAccess(tpl.id, feature.feature, next)}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Access levels</p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span><strong>Full</strong> — view, create, edit, and delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span><strong>Create</strong> — view and create, but no edit or delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span><strong>View only</strong> — read-only access, no create/edit/delete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  <span><strong>Off</strong> — feature is completely hidden</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Desktop table row group: renders the category divider followed by the rows
// supplied as children (one row per feature in the category).
function CategoryGroup({
  category,
  columnCount,
  children,
}: {
  category: FeatureCategory
  columnCount: number
  children: React.ReactNode
}) {
  return (
    <>
      <tr className="bg-gray-50">
        <td
          colSpan={columnCount}
          className="px-5 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide"
        >
          {CATEGORY_LABEL[category]}
        </td>
      </tr>
      {children}
    </>
  )
}

// Native <select> styled to match the existing palette. Accessible by default
// (Tab, Arrow keys, Enter/Escape).
function AccessLevelSelect({
  value,
  disabled,
  justSaved,
  onChange,
}: {
  value: AccessLevel
  disabled: boolean
  justSaved: boolean
  onChange: (next: AccessLevel) => void
}) {
  const option = ACCESS_OPTIONS.find((o) => o.value === value) ?? ACCESS_OPTIONS[3]
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AccessLevel)}
        className={`appearance-none pl-3 pr-7 py-1 rounded-md border text-xs font-medium transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${option.activeColor} ${disabled ? 'opacity-50 cursor-wait' : ''}`}
      >
        {ACCESS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-gray-900 bg-white">
            {opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-white/90">
        {justSaved ? <CheckIcon className="w-3 h-3" /> : <CaretDown />}
      </span>
    </div>
  )
}

function CaretDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
