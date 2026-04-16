'use client'

import { useState, useEffect } from 'react'
import { XIcon, Loader2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CustomerSearchSelector from '../shared/CustomerSearchSelector'
import type { Customer } from '../estimates/types'
import type { ProjectTakeoffProject } from './types'

interface NewProjectModalProps {
  customers: Customer[]
  userId: string
  preselectedCustomerId: string | null
  onClose: () => void
  onCreated: (project: ProjectTakeoffProject) => void
}

export default function NewProjectModal({
  customers,
  userId,
  preselectedCustomerId,
  onClose,
  onCreated,
}: NewProjectModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    preselectedCustomerId
  )
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  async function handleCreate() {
    if (!selectedCustomerId) {
      setError('Please select a customer')
      return
    }
    if (!name.trim()) {
      setError('Project name is required')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data, error: dbError } = await supabase
      .from('project_takeoff_projects')
      .insert({
        customer_id: selectedCustomerId,
        name: name.trim(),
        description: description.trim() || null,
        status: 'active',
        created_by: userId,
      })
      .select()
      .single()

    if (dbError || !data) {
      console.error('[NewProjectModal] Create failed:', dbError)
      setError('Failed to create project')
      setSaving(false)
      return
    }

    onCreated(data as ProjectTakeoffProject)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">New project</h2>
          <button
            onClick={() => !saving && onClose()}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            disabled={saving}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
            <CustomerSearchSelector
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              onSelect={(c) => setSelectedCustomerId(c.id)}
              label="Customer"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Project name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Warehouse Floor Coating"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this project"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2Icon className="w-3.5 h-3.5 animate-spin" />}
            Create project
          </button>
        </div>
      </div>
    </div>
  )
}
