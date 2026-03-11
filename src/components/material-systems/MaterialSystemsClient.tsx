'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, LayersIcon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useMaterialSystems } from '@/lib/useMaterialSystems'

export default function MaterialSystemsClient() {
  const router = useRouter()
  const { systems, loading, addSystem, updateSystem, deleteSystem } = useMaterialSystems()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    await addSystem(newName)
    setNewName('')
    setAdding(false)
    setSaving(false)
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    await updateSystem(id, editName)
    setEditId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <LayersIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Material System Management</h1>
            <p className="text-sm text-gray-500">Manage the master list of material systems used in Project Reports and Estimates.</p>
          </div>
        </div>

        {/* Content card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Material Systems ({systems.length})
            </h2>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add Material System
              </button>
            )}
          </div>

          {/* Add new inline form */}
          {adding && (
            <div className="px-6 py-4 border-b border-gray-100 bg-amber-50/50">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">System Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Epoxy Broadcast, Polyurea, MMA..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd()
                    if (e.key === 'Escape') { setAdding(false); setNewName('') }
                  }}
                />
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setAdding(false); setNewName('') }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : systems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <LayersIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No material systems yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click &quot;Add Material System&quot; to create your first one.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {systems.map((ms) => (
                <div key={ms.id} className="flex items-center gap-3 px-6 py-3 group hover:bg-gray-50 transition">
                  {editId === ms.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(ms.id)
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(ms.id)}
                        disabled={!editName.trim()}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-900">{ms.name}</span>
                      <button
                        onClick={() => { setEditId(ms.id); setEditName(ms.name) }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-amber-600 transition-all"
                        title="Edit"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSystem(ms.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                        title="Delete"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
