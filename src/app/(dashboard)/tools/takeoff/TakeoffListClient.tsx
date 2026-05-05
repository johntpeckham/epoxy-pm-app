'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RulerIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

interface Props {
  initialTakeoffs: TakeoffListRow[]
  userId: string
}

export default function TakeoffListClient({ initialTakeoffs, userId }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [isCreating, startCreating] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)

  const filtered = initialTakeoffs.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleNewTakeoff() {
    setCreateError(null)
    startCreating(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('estimating_projects')
        .insert({
          name: 'Untitled Takeoff',
          created_by: userId,
          company_id: null,
          status: 'active',
          source: 'manual',
        })
        .select('id')
        .single()

      if (error || !data) {
        setCreateError(error?.message ?? 'Failed to create takeoff')
        return
      }
      router.push(`/tools/takeoff/${data.id}`)
    })
  }

  return (
    <div className="min-h-full bg-[#1a1a1a] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <RulerIcon className="w-6 h-6 text-amber-400" />
          Takeoff
        </h1>
        <button
          onClick={handleNewTakeoff}
          disabled={isCreating}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          {isCreating ? 'Creating…' : 'New Takeoff'}
        </button>
      </div>

      {createError && (
        <p className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {createError}
        </p>
      )}

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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-[#242424] rounded-full flex items-center justify-center mb-4">
            <RulerIcon className="w-7 h-7 text-gray-500" />
          </div>
          <p className="text-gray-400 font-medium mb-1">
            {search ? 'No takeoffs match your search' : 'No takeoffs yet'}
          </p>
          {!search && (
            <p className="text-sm text-gray-600 mb-6">
              Create your first takeoff to get started.
            </p>
          )}
          {!search && (
            <button
              onClick={handleNewTakeoff}
              disabled={isCreating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              {isCreating ? 'Creating…' : 'New Takeoff'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/tools/takeoff/${t.id}`)}
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
          ))}
        </div>
      )}
    </div>
  )
}
