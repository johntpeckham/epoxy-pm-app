'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  PencilIcon,
  WrenchIcon,
  ArrowLeftIcon,
  Settings2Icon,
  GripVerticalIcon,
  Trash2Icon,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import type { EquipmentCategory } from '@/types'
import EquipmentModal from './EquipmentModal'

interface Props {
  initialEquipment: EquipmentRow[]
  userId: string
  userRole: string
  /** When provided, clicking "View" calls this instead of navigating to /equipment/[id]. */
  onViewItem?: (id: string) => void
  /**
   * When provided, the component renders in embedded mode: a full-bleed
   * header bar with a back button + icon + title + Add Equipment, and a
   * body that fills the parent (no centered max-width container).
   */
  onBack?: () => void
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'out_of_service', label: 'Out of Service' },
]

// Deterministic colour for a category badge — picks one of a small palette
// based on a hash of the category name so the same category always gets the
// same colour.
const CATEGORY_BADGE_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-orange-100 text-orange-700',
  'bg-gray-100 text-gray-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]

function categoryBadgeClass(name: string | null | undefined): string {
  if (!name) return 'bg-gray-100 text-gray-700'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % CATEGORY_BADGE_PALETTE.length
  return CATEGORY_BADGE_PALETTE[idx]
}

function SortableCategoryRow({
  category,
  onRename,
  onDelete,
  deleting,
}: {
  category: EquipmentCategory
  onRename: (category: EquipmentCategory, newName: string) => void
  onDelete: (category: EquipmentCategory) => void
  deleting: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })
  const [localName, setLocalName] = useState(category.name)

  useEffect(() => {
    setLocalName(category.name)
  }, [category.name])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleBlur() {
    if (localName.trim() !== category.name) {
      onRename(category, localName)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2 rounded-md bg-gray-50 ${isDragging ? 'z-50 opacity-80 shadow-lg ring-2 ring-amber-400' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVerticalIcon className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="flex-1 min-w-0 text-sm text-gray-700 bg-transparent border border-transparent rounded px-2 py-0.5 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
      />
      <button
        onClick={() => onDelete(category)}
        disabled={deleting}
        className="text-gray-400 hover:text-red-500 transition disabled:opacity-50 flex-shrink-0"
      >
        <Trash2Icon className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function EquipmentPageClient({ initialEquipment, userId, userRole, onViewItem, onBack }: Props) {
  const router = useRouter()
  const [equipment, setEquipment] = useState(initialEquipment)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<EquipmentRow | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Dynamic categories
  const [categories, setCategories] = useState<EquipmentCategory[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  // Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const canManage = userRole === 'admin' || userRole === 'foreman' || userRole === 'office_manager'

  const fetchCategories = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('equipment_categories')
      .select('*')
      .order('sort_order', { ascending: true })
    setCategories((data as EquipmentCategory[]) ?? [])
    setCategoriesLoaded(true)
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

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

  // Group filtered equipment by category, following the order from
  // equipment_categories.sort_order. Categories with no items are skipped.
  // Any equipment whose category doesn't match a known category is collected
  // under "Other" at the bottom.
  const groupedEquipment = useMemo(() => {
    const groups: { categoryName: string; items: EquipmentRow[] }[] = []
    const knownNames = new Set(categories.map((c) => c.name))

    for (const c of categories) {
      const matched = filtered.filter((e) => e.category === c.name)
      if (matched.length > 0) {
        groups.push({ categoryName: c.name, items: matched })
      }
    }

    const other = filtered.filter((e) => !e.category || !knownNames.has(e.category))
    if (other.length > 0) {
      groups.push({ categoryName: 'Other', items: other })
    }

    return groups
  }, [filtered, categories])

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
              photo_url: row.photo_url ?? null,
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
      // If the delete was triggered from inside the Edit modal, close it too.
      setShowModal(false)
      setEditingItem(null)
    }
    setDeleting(false)
    setDeleteConfirmId(null)
  }

  // ── Category management ──

  async function handleAddCategory() {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    // Reject duplicate (case-insensitive)
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError(`Category "${trimmed}" already exists`)
      return
    }

    setAddingCategory(true)
    setCategoryError(null)

    const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 1

    const supabase = createClient()
    const { error } = await supabase
      .from('equipment_categories')
      .insert({ name: trimmed, sort_order: nextOrder })

    if (error) {
      setCategoryError(error.message.includes('duplicate') ? 'Category already exists' : error.message)
    } else {
      setNewCategoryName('')
      await fetchCategories()
    }
    setAddingCategory(false)
  }

  async function handleDeleteCategory(category: EquipmentCategory) {
    // Count equipment using this category
    const usageCount = equipment.filter(e => e.category === category.name).length
    if (usageCount > 0) {
      setCategoryError(
        `${usageCount} equipment item${usageCount === 1 ? '' : 's'} use this category. Reassign them first.`
      )
      return
    }

    setDeletingCategoryId(category.id)
    setCategoryError(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('equipment_categories')
      .delete()
      .eq('id', category.id)

    if (error) {
      setCategoryError(error.message)
    } else {
      await fetchCategories()
    }
    setDeletingCategoryId(null)
  }

  async function handleRenameCategory(category: EquipmentCategory, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCategoryError('Category name cannot be empty')
      return
    }
    if (trimmed === category.name) return

    const duplicate = categories.find(
      c => c.id !== category.id && c.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      setCategoryError(`Category "${trimmed}" already exists`)
      return
    }

    setCategoryError(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('equipment_categories')
      .update({ name: trimmed })
      .eq('id', category.id)

    if (error) {
      setCategoryError(error.message)
      return
    }

    // Update any equipment records that reference the old category name.
    await supabase
      .from('equipment')
      .update({ category: trimmed })
      .eq('category', category.name)

    // Update local equipment state so filters/badges keep working.
    setEquipment(prev =>
      prev.map(e => (e.category === category.name ? { ...e, category: trimmed } : e))
    )
    if (categoryFilter === category.name) setCategoryFilter(trimmed)

    await fetchCategories()
  }

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = categories.findIndex(c => c.id === active.id)
    const newIdx = categories.findIndex(c => c.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...categories]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    const updated = reordered.map((c, i) => ({ ...c, sort_order: i + 1 }))
    setCategories(updated)

    const supabase = createClient()
    for (const c of updated) {
      await supabase
        .from('equipment_categories')
        .update({ sort_order: c.sort_order })
        .eq('id', c.id)
    }
  }

  const embedded = !!onBack

  const addButton = canManage && (
    <button
      onClick={() => {
        setEditingItem(null)
        setShowModal(true)
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
    >
      <PlusIcon className="w-4 h-4" />
      Add Equipment
    </button>
  )

  const settingsButton = canManage && (
    <button
      onClick={() => setSettingsOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-700 text-xs font-medium rounded-lg transition"
      title="Equipment Settings"
    >
      <Settings2Icon className="w-4 h-4" />
      Settings
    </button>
  )

  const filtersBlock = (
    <div className="flex flex-wrap gap-3 mb-6">
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-[#a0a0a0]! bg-white dark:bg-[#2e2e2e]! focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none"
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="border border-gray-300 dark:border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-[#a0a0a0]! bg-white dark:bg-[#2e2e2e]! focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 appearance-none"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )

  const renderCard = (item: EquipmentRow) => {
    const openDetail = () => {
      if (onViewItem) onViewItem(item.id)
      else router.push(`/equipment/${item.id}`)
    }
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openDetail()
          }
        }}
        className="relative bg-white dark:bg-[#242424]! border border-gray-200 dark:border-[#3a3a3a] rounded-xl p-5 cursor-pointer hover:border-gray-300 dark:hover:border-[#4a4a4a] hover:bg-gray-50 dark:hover:bg-[#2a2a2a]! hover:shadow-md transition"
      >
        {/* Top-right action buttons — stopPropagation so clicks don't navigate */}
        {canManage && (
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingItem(item)
                setShowModal(true)
              }}
              className="p-1.5 text-gray-400 dark:text-[#6b6b6b]! hover:text-amber-500 dark:hover:text-[#a0a0a0]! hover:bg-gray-100 rounded-md transition-colors"
              title="Edit"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-start gap-4">
          {/* Photo thumbnail on the left */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-[#2e2e2e]! flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-[#3a3a3a]">
            {item.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.photo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <WrenchIcon className="w-8 h-8 text-gray-400 dark:text-[#4a4a4a]!" />
            )}
          </div>

          {/* Content on the right */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3 className="text-lg font-bold text-gray-900 pr-16">{item.name}</h3>

            {/* Badges */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryBadgeClass(item.category)}`}
              >
                {item.category}
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
          </div>
        </div>
      </div>
    )
  }

  const gridColsClass = `grid grid-cols-1 gap-4 ${
    embedded ? 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'md:grid-cols-2'
  }`

  const gridBlock =
    filtered.length === 0 ? (
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
      <div>
        {groupedEquipment.map((group, idx) => (
          <div key={group.categoryName}>
            {/* Category divider — matches Employee Management role divider */}
            <div
              className={`flex items-center gap-3 ${idx === 0 ? 'mb-4' : 'mt-6 mb-4'}`}
              aria-label={group.categoryName}
            >
              <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a]" />
              <span className="text-xs font-medium text-gray-400 dark:text-[#4a4a4a] uppercase tracking-widest">
                {group.categoryName}
              </span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a]" />
            </div>
            {/* Cards */}
            <div className={gridColsClass}>
              {group.items.map((item) => renderCard(item))}
            </div>
          </div>
        ))}
      </div>
    )

  const manageCategoriesBody = (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Manage Categories */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Manage Categories
        </h4>
        {categoryError && <p className="text-xs text-red-500 mb-2">{categoryError}</p>}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <button
            onClick={handleAddCategory}
            disabled={addingCategory || !newCategoryName.trim()}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
          >
            {addingCategory ? '...' : 'Add'}
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {categories.map((category) => (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  onRename={handleRenameCategory}
                  onDelete={handleDeleteCategory}
                  deleting={deletingCategoryId === category.id}
                />
              ))}
              {categoriesLoaded && categories.length === 0 && (
                <p className="text-xs text-gray-400 py-2">No categories defined.</p>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )

  const embeddedSettingsOverlay = settingsOpen && (
    <div className="absolute inset-0 top-[56px] z-10 bg-white flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {manageCategoriesBody}
      </div>
    </div>
  )

  const dialogs = (
    <>
      {/* Delete Confirmation Dialog — z-[70] so it appears above the Edit
          Equipment modal (which is in a Portal at z-[60]). */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmId(null)}>
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
          categories={categories}
          onCategoriesChanged={fetchCategories}
          onClose={() => {
            setShowModal(false)
            setEditingItem(null)
          }}
          onSaved={handleSaved}
          onDelete={(id) => setDeleteConfirmId(id)}
        />
      )}
    </>
  )

  /* ── Embedded layout (Office work area) — matches EmployeeManagement ── */
  if (embedded) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col bg-gray-50 dark:bg-[#1a1a1a]! overflow-hidden relative">
        {/* Header bar */}
        <div className="flex-none flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            {settingsOpen ? (
              <>
                <button onClick={() => { setSettingsOpen(false); setCategoryError(null) }} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                <Settings2Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Equipment Settings</h1>
              </>
            ) : (
              <>
                <button onClick={onBack} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                <WrenchIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Equipment</h1>
              </>
            )}
          </div>
          {!settingsOpen && (
            <div className="flex items-center gap-2">
              {settingsButton}
              {addButton}
            </div>
          )}
        </div>

        {/* Body — fills full width edge to edge */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {filtersBlock}
          {gridBlock}
        </div>

        {embeddedSettingsOverlay}
        {dialogs}
      </div>
    )
  }

  /* ── Standalone /equipment route layout ── */
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
      {settingsOpen ? (
        <>
          {/* Settings header */}
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 mb-6 -mx-4 sm:-mx-6">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => { setSettingsOpen(false); setCategoryError(null) }} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
              <Settings2Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Equipment Settings</h1>
            </div>
          </div>
          {manageCategoriesBody}
        </>
      ) : (
        <>
          {/* Equipment header */}
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <WrenchIcon className="w-5 h-5 text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-700 text-sm font-medium rounded-lg transition"
                  title="Equipment Settings"
                >
                  <Settings2Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
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
              </div>
            )}
          </div>

          {filtersBlock}
          {gridBlock}
        </>
      )}
      {dialogs}
    </div>
  )
}
