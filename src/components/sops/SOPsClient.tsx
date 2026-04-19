'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import {
  ArrowLeftIcon,
  FileTextIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  XIcon,
} from 'lucide-react'

interface Division {
  id: string
  name: string
  type: 'office' | 'field'
  sort_order: number
  created_at: string
}

interface SOP {
  id: string
  title: string
  type: 'office' | 'field'
  division_id: string | null
  status: 'draft' | 'published'
  created_by: string
  created_at: string
  updated_at: string
}

interface Props {
  userId: string
}

export default function SOPsClient({ userId }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [sops, setSOPs] = useState<SOP[]>([])
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'office' | 'field'>('office')
  const [editingDivision, setEditingDivision] = useState<Division | null>(null)
  const [divisionName, setDivisionName] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const [divisionsRes, sopsRes, profilesRes] = await Promise.all([
      supabase.from('sop_divisions').select('*').order('sort_order').order('created_at'),
      supabase.from('sops').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name'),
    ])

    setDivisions((divisionsRes.data as Division[]) ?? [])
    setSOPs((sopsRes.data as SOP[]) ?? [])

    const map = new Map<string, string>()
    for (const p of (profilesRes.data ?? []) as { id: string; display_name: string | null }[]) {
      map.set(p.id, p.display_name ?? 'Unknown')
    }
    setProfiles(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openCreateModal = (type: 'office' | 'field') => {
    setModalType(type)
    setEditingDivision(null)
    setDivisionName('')
    setModalOpen(true)
  }

  const openEditModal = (division: Division) => {
    setModalType(division.type)
    setEditingDivision(division)
    setDivisionName(division.name)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingDivision(null)
    setDivisionName('')
    setSaving(false)
  }

  const handleSaveDivision = async () => {
    if (!divisionName.trim()) return
    setSaving(true)
    const supabase = createClient()

    if (editingDivision) {
      await supabase
        .from('sop_divisions')
        .update({ name: divisionName.trim() })
        .eq('id', editingDivision.id)
    } else {
      const maxSort = divisions
        .filter((d) => d.type === modalType)
        .reduce((max, d) => Math.max(max, d.sort_order), -1)
      await supabase.from('sop_divisions').insert({
        name: divisionName.trim(),
        type: modalType,
        sort_order: maxSort + 1,
      })
    }

    await fetchData()
    closeModal()
  }

  const handleDeleteDivision = async (division: Division) => {
    const assignedSOPs = sops.filter((s) => s.division_id === division.id)
    if (assignedSOPs.length > 0) {
      alert('Remove SOPs from this division first')
      return
    }

    const supabase = createClient()
    await supabase.from('sop_divisions').delete().eq('id', division.id)
    await fetchData()
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const renderSOPRow = (sop: SOP) => (
    <div
      key={sop.id}
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition cursor-default"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{sop.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Created by {profiles.get(sop.created_by) ?? 'Unknown'} &middot; {formatDate(sop.created_at)}
        </p>
      </div>
      <span
        className={`ml-3 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
          sop.status === 'published'
            ? 'text-green-700 bg-green-100'
            : 'text-gray-500 bg-gray-100'
        }`}
      >
        {sop.status === 'published' ? 'Published' : 'Draft'}
      </span>
    </div>
  )

  const renderSection = (type: 'office' | 'field') => {
    const typeDivisions = divisions.filter((d) => d.type === type)
    const typeSOPs = sops.filter((s) => s.type === type)
    const uncategorized = typeSOPs.filter((s) => !s.division_id)
    const label = type === 'office' ? 'Office SOPs' : 'Field SOPs'
    const emptyMsg = type === 'office' ? 'No office SOPs yet' : 'No field SOPs yet'

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
        </div>

        {typeSOPs.length === 0 && typeDivisions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-400">{emptyMsg}</p>
          </div>
        ) : (
          <div>
            {typeDivisions.map((division) => {
              const divSOPs = typeSOPs.filter((s) => s.division_id === division.id)
              return (
                <div key={division.id}>
                  <div className="group flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-1">
                      {division.name}
                    </span>
                    <button
                      onClick={() => openEditModal(division)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                      title="Rename division"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDivision(division)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title={
                        sops.filter((s) => s.division_id === division.id).length > 0
                          ? 'Remove SOPs from this division first'
                          : 'Delete division'
                      }
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {divSOPs.length === 0 ? (
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400 italic">No SOPs in this division</p>
                    </div>
                  ) : (
                    divSOPs.map(renderSOPRow)
                  )}
                </div>
              )
            })}

            {uncategorized.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-1">
                    Uncategorized
                  </span>
                </div>
                {uncategorized.map(renderSOPRow)}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-gray-100">
          <button
            onClick={() => openCreateModal(type)}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-md transition"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New Division
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/office" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <FileTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 truncate">SOPs &amp; Forms</h1>
        </div>
        <button
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
          onClick={() => {}}
        >
          <PlusIcon className="w-4 h-4" />
          New SOP
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 flex-1 min-h-0 w-full space-y-4">
        {renderSection('office')}
        {renderSection('field')}
      </div>

      {modalOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">
                  {editingDivision ? 'Rename Division' : 'New Division'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Division Name
                </label>
                <input
                  type="text"
                  value={divisionName}
                  onChange={(e) => setDivisionName(e.target.value)}
                  placeholder="e.g. Safety, HR, Training"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDivision()
                  }}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  This division will appear under {modalType === 'office' ? 'Office' : 'Field'} SOPs
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
                <button
                  onClick={closeModal}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDivision}
                  disabled={!divisionName.trim() || saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingDivision ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
