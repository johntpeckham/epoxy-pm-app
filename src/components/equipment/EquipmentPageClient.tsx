'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PlusIcon, PencilIcon, TrashIcon, WrenchIcon, EyeIcon } from 'lucide-react'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import EquipmentModal from './EquipmentModal'

interface Props {
  initialEquipment: EquipmentRow[]
  userId: string
  userRole: string
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'heavy_equipment', label: 'Heavy Equipment' },
  { value: 'trailer', label: 'Trailers' },
  { value: 'tool', label: 'Tools' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'out_of_service', label: 'Out of Service' },
]

const CATEGORY_BADGE: Record<string, string> = {
  vehicle: 'bg-blue-100 text-blue-700',
  heavy_equipment: 'bg-orange-100 text-orange-700',
  trailer: 'bg-gray-100 text-gray-700',
  tool: 'bg-green-100 text-green-700',
}

const CATEGORY_LABEL: Record<string, string> = {
  vehicle: 'Vehicle',
  heavy_equipment: 'Heavy Equipment',
  trailer: 'Trailer',
  tool: 'Tool',
}

export default function EquipmentPageClient({ initialEquipment, userId, userRole }: Props) {
  const router = useRouter()
  const [equipment, setEquipment] = useState(initialEquipment)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<EquipmentRow | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage = userRole === 'admin' || userRole === 'foreman'

  const filtered = useMemo(() => {
    let result = equipment
    if (categoryFilter) {
      result = result.filter((e) => e.category === categoryFilter)
    }
    if (statusFilter) {
      result = result.filter((e) => e.status === statusFilter)
    }
    return result
  }, [equipment, categoryFilter, statusFilter])

  const handleSaved = useCallback(() => {
    setShowModal(false)
    setEditingItem(null)
    router.refresh()
    // Re-fetch client-side to update immediately
    const supabase = createClient()
    supabase
      .from('equipment')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setEquipment(
            data.map((row) => ({
              id: row.id,
              name: row.name,
              category: row.category,
              year: row.year,
              make: row.make,
              model: row.model,
              serial_number: row.serial_number,
              vin: row.vin,
              license_plate: row.license_plate,
              custom_fields: (row.custom_fields ?? []) as { label: string; value: string }[],
              status: row.status,
              created_at: row.created_at,
              created_by: row.created_by,
            }))
          )
        }
      })
  }, [router])

  const handleDelete = async (id: string) => {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('equipment').delete().eq('id', id)
    if (!error) {
      setEquipment((prev) => prev.filter((e) => e.id !== id))
    }
    setDeleting(false)
    setDeleteConfirmId(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        {canManage && (
          <button
            onClick={() => {
              setEditingItem(null)
              setShowModal(true)
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Equipment
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent appearance-none"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent appearance-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Equipment Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
            <WrenchIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No equipment found</p>
          <p className="text-gray-400 text-sm mt-1">
            {canManage ? 'Add your first piece of equipment to get started.' : 'No equipment has been added yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="relative bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              {/* Top-right action buttons */}
              {canManage && (
                <div className="absolute top-3 right-3 flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingItem(item)
                      setShowModal(true)
                    }}
                    className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-100 rounded-md transition-colors"
                    title="Edit"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Name */}
              <h3 className="text-lg font-bold text-gray-900 pr-16">{item.name}</h3>

              {/* Badges */}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    CATEGORY_BADGE[item.category] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {CATEGORY_LABEL[item.category] ?? item.category}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    item.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {item.status === 'active' ? 'Active' : 'Out of Service'}
                </span>
              </div>

              {/* Year / Make / Model */}
              {(item.year || item.make || item.model) && (
                <p className="text-sm text-gray-600 mt-2">
                  {[item.year, item.make, item.model].filter(Boolean).join(' / ')}
                </p>
              )}

              {/* Serial / VIN */}
              {item.serial_number && (
                <p className="text-xs text-gray-400 mt-1">SN: {item.serial_number}</p>
              )}
              {item.vin && <p className="text-xs text-gray-400 mt-0.5">VIN: {item.vin}</p>}

              {/* View button */}
              <div className="mt-4">
                <button
                  onClick={() => router.push(`/equipment/${item.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <EyeIcon className="w-3.5 h-3.5" />
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Delete Equipment</h3>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to delete this equipment? This will also remove all associated documents and maintenance logs. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <EquipmentModal
          item={editingItem}
          userId={userId}
          onClose={() => {
            setShowModal(false)
            setEditingItem(null)
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
