'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  RulerIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'

export interface TakeoffListRow {
  id: string
  name: string
  company_id: string | null
  company_name: string | null
  created_at: string
  updated_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── NewTakeoffModal ──────────────────────────────────────────────────────────

interface NewTakeoffModalProps {
  userId: string
  onClose: () => void
  onCreated: (id: string) => void
}

function NewTakeoffModal({ userId, onClose, onCreated }: NewTakeoffModalProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape (unless a save is in flight)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [saving, onClose])

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !saving

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('estimating_projects')
      .insert({
        name: trimmed,
        created_by: userId,
        company_id: null,
        status: 'active',
        source: 'manual',
      })
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to create takeoff')
      setSaving(false)
      return
    }

    onCreated(data.id)
    // Modal stays open briefly while the router navigates — parent unmounts it
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => !saving && onClose()}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-[#242424] md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#3a3a3a] flex-shrink-0">
            <h3 className="text-lg font-semibold text-white">New Takeoff</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 text-[#6b6b6b] hover:text-white hover:bg-[#2e2e2e] rounded-md transition-colors disabled:opacity-50"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div className="px-5 py-5 space-y-4">
              {error && (
                <div className="bg-red-900/20 border border-red-900/40 text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wide mb-1">
                  Takeoff name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Street Warehouse"
                  className="w-full border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-[#2e2e2e]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end px-5 py-4 border-t border-[#3a3a3a]">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-[#a0a0a0] bg-[#2e2e2e] border border-[#3a3a3a] rounded-lg hover:bg-[#3a3a3a] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition"
              >
                {saving ? 'Creating…' : 'Create takeoff'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}

// ─── TakeoffRow ───────────────────────────────────────────────────────────────

function TakeoffRow({
  t,
  onNavigate,
}: {
  t: TakeoffListRow
  onNavigate: (id: string) => void
}) {
  return (
    <div
      onClick={() => onNavigate(t.id)}
      className="bg-[#242424] border border-[#2a2a2a] hover:border-amber-500/30 rounded-xl px-4 py-3.5 cursor-pointer transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
            {t.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t.company_name ?? 'No project linked'}
          </p>
        </div>
        <div className="flex-shrink-0 text-right hidden sm:block">
          <p className="text-xs text-gray-500">
            Created {formatDate(t.created_at)}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Modified {formatDate(t.updated_at)}
          </p>
        </div>
      </div>
      {/* Mobile: dates stacked below */}
      <div className="flex gap-3 mt-2 sm:hidden">
        <span className="text-xs text-gray-500">
          Created {formatDate(t.created_at)}
        </span>
        <span className="text-xs text-gray-600">
          · Modified {formatDate(t.updated_at)}
        </span>
      </div>
    </div>
  )
}

// ─── TakeoffSection ───────────────────────────────────────────────────────────

interface TakeoffSectionProps {
  title: string
  items: TakeoffListRow[]
  searchActive: boolean
  expanded: boolean
  onToggle: () => void
  onNavigate: (id: string) => void
}

function TakeoffSection({
  title,
  items,
  searchActive,
  expanded,
  onToggle,
  onNavigate,
}: TakeoffSectionProps) {
  const ChevronIcon = expanded ? ChevronDownIcon : ChevronRightIcon

  return (
    <div>
      {/* Section header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-1 py-2 text-left group"
      >
        <ChevronIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
          {title}
        </span>
        <span className="ml-1 text-xs font-medium text-[#6b6b6b] bg-[#2a2a2a] rounded-full px-1.5 py-0.5">
          {items.length}
        </span>
      </button>

      {/* Section body */}
      {expanded && (
        <div className="mt-1 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs italic text-[#6b6b6b] px-1 py-1">
              {searchActive ? 'No matches' : 'No takeoffs in this section'}
            </p>
          ) : (
            items.map((t) => (
              <TakeoffRow key={t.id} t={t} onNavigate={onNavigate} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── TakeoffListClient ────────────────────────────────────────────────────────

interface Props {
  initialTakeoffs: TakeoffListRow[]
  userId: string
}

export default function TakeoffListClient({ initialTakeoffs, userId }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [standaloneExpanded, setStandaloneExpanded] = useState(true)
  const [projectExpanded, setProjectExpanded] = useState(true)

  const searchLower = search.toLowerCase()

  // Partition by company_id, preserving server-side newest-first order
  const standalone = initialTakeoffs.filter((t) => t.company_id === null)
  const projectLinked = initialTakeoffs.filter((t) => t.company_id !== null)

  const filteredStandalone = standalone.filter((t) =>
    t.name.toLowerCase().includes(searchLower)
  )
  const filteredProject = projectLinked.filter((t) =>
    t.name.toLowerCase().includes(searchLower)
  )

  function handleNavigate(id: string) {
    router.push(`/tools/takeoff/${id}`)
  }

  function handleCreated(id: string) {
    setModalOpen(false)
    router.push(`/tools/takeoff/${id}`)
  }

  return (
    <div className="min-h-full bg-[#1a1a1a] px-4 py-6 sm:px-6 lg:px-8">
      {/* New Takeoff Modal */}
      {modalOpen && (
        <NewTakeoffModal
          userId={userId}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <RulerIcon className="w-6 h-6 text-amber-400" />
          Takeoff
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Takeoff
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search takeoffs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#242424] border border-[#2a2a2a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 transition-colors"
        />
      </div>

      {/* Empty state — no takeoffs at all (sections would be misleading) */}
      {initialTakeoffs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-[#242424] rounded-full flex items-center justify-center mb-4">
            <RulerIcon className="w-7 h-7 text-gray-500" />
          </div>
          <p className="text-gray-400 font-medium mb-1">No takeoffs yet</p>
          <p className="text-sm text-gray-600 mb-6">
            Create your first takeoff to get started.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Takeoff
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <TakeoffSection
            title="Standalone Takeoffs"
            items={filteredStandalone}
            searchActive={search.length > 0}
            expanded={standaloneExpanded}
            onToggle={() => setStandaloneExpanded((v) => !v)}
            onNavigate={handleNavigate}
          />
          <TakeoffSection
            title="Project Takeoffs"
            items={filteredProject}
            searchActive={search.length > 0}
            expanded={projectExpanded}
            onToggle={() => setProjectExpanded((v) => !v)}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  )
}
