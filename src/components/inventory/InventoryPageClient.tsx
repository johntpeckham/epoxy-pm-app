'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SupplierModal from './SupplierModal'
import ProductModal, { type ProductFormData } from './ProductModal'
import KitGroupModal, { type KitGroupFormData } from './KitGroupModal'
import StockCheckRequestModal from './StockCheckRequestModal'
import type {
  InventoryKitGroup,
  InventoryProduct,
  InventoryUnit,
  MaterialSupplier,
  UserRole,
} from '@/types'

export interface InventoryProfileOption {
  id: string
  display_name: string | null
}

export interface PendingStockCheckInfo {
  taskId: string
  assigneeId: string | null
  assigneeName: string
}

interface Props {
  userRole: UserRole
  currentUserId: string
  initialSuppliers: MaterialSupplier[]
  initialProducts: InventoryProduct[]
  initialKitGroups: InventoryKitGroup[]
  profiles: InventoryProfileOption[]
  /** Keyed by task id — the pending stock check task → assignee info. */
  initialPendingStockChecks: Record<string, PendingStockCheckInfo>
}

function formatStockCheckDate(value: string | null): string {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatQuantity(quantity: number, unit: InventoryUnit): string {
  const q = quantity.toString()
  const label = unit === 'parts' ? 'parts' : 'gal'
  return `${q} ${label}`
}

type StockCheckLevel = 'pending' | 'never' | 'fresh' | 'stale' | 'overdue'

/**
 * Derive a stock check status level for color-coding and status dots.
 * "pending" (an open task exists) always overrides date-based staleness.
 */
function getStockCheckLevel(
  stockCheckDate: string | null,
  hasPendingTask: boolean
): StockCheckLevel {
  if (hasPendingTask) return 'pending'
  if (!stockCheckDate) return 'never'
  const d = new Date(stockCheckDate)
  if (Number.isNaN(d.getTime())) return 'never'
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays >= 60) return 'overdue'
  if (ageDays >= 30) return 'stale'
  return 'fresh'
}

function stockCheckDateClass(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'text-red-600 dark:text-red-400 font-medium'
    case 'stale':
      return 'text-amber-600 dark:text-amber-400 font-medium'
    case 'fresh':
      return 'text-green-600 dark:text-green-400'
    case 'pending':
      return 'text-amber-600 dark:text-amber-400'
    case 'never':
    default:
      return 'text-gray-400 dark:text-[#6b6b6b] italic'
  }
}

function stockCheckDotClass(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'bg-red-500'
    case 'stale':
      return 'bg-amber-500'
    case 'fresh':
      return 'bg-green-500'
    case 'pending':
      return 'bg-amber-500 animate-pulse'
    case 'never':
    default:
      return 'bg-gray-300 dark:bg-[#4a4a4a]'
  }
}

function stockCheckDotTitle(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'Overdue — last check was 60+ days ago'
    case 'stale':
      return 'Due soon — last check was 30+ days ago'
    case 'fresh':
      return 'Recently checked'
    case 'pending':
      return 'Stock check requested and pending'
    case 'never':
    default:
      return 'Never checked'
  }
}

/** Convert a timestamptz to a YYYY-MM-DD string for <input type="date">. */
function toDateInputValue(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ================================================================== */
/*  INLINE KIT COUNT EDITOR                                            */
/* ================================================================== */

function InlineKitCount({
  value,
  onSave,
  canEdit,
}: {
  value: number
  onSave: (next: number) => void | Promise<void>
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(String(value))

  function commit() {
    const parsed = parseInt(draft, 10)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== value) {
      onSave(parsed)
    } else {
      // Reset draft if invalid or unchanged.
      setDraft(String(value))
    }
    setEditing(false)
  }

  function cancel() {
    setDraft(String(value))
    setEditing(false)
  }

  if (!canEdit) {
    return (
      <span className="font-semibold text-gray-700 dark:text-[#d0d0d0]">{value}</span>
    )
  }

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        step="1"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        className="w-14 text-sm text-right font-semibold text-gray-900 dark:text-white bg-white dark:bg-[#2e2e2e] border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value))
        setEditing(true)
      }}
      className="font-semibold text-gray-700 dark:text-[#d0d0d0] hover:text-amber-600 dark:hover:text-amber-400 underline decoration-dotted decoration-gray-300 dark:decoration-[#4a4a4a] underline-offset-2 transition-colors"
      title="Click to edit"
    >
      {value}
    </button>
  )
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function InventoryPageClient({
  userRole,
  currentUserId,
  initialSuppliers,
  initialProducts,
  initialKitGroups,
  profiles,
  initialPendingStockChecks,
}: Props) {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>(initialSuppliers)
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts)
  const [kitGroups, setKitGroups] = useState<InventoryKitGroup[]>(initialKitGroups)

  // Pending stock check lookup keyed by task id. When a new request is made,
  // we insert the new task info here keyed by the newly created task id.
  const [pendingStockChecks, setPendingStockChecks] = useState<
    Record<string, PendingStockCheckInfo>
  >(initialPendingStockChecks)

  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set())

  // Supplier modal state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null)

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
  const [productModalSupplierId, setProductModalSupplierId] = useState<string | null>(null)

  // Kit group modal state
  const [kitGroupModalOpen, setKitGroupModalOpen] = useState(false)
  const [editingKitGroup, setEditingKitGroup] = useState<InventoryKitGroup | null>(null)
  const [kitGroupModalSupplierId, setKitGroupModalSupplierId] = useState<string | null>(null)

  // Stock check request modal state
  const [stockCheckProduct, setStockCheckProduct] = useState<InventoryProduct | null>(null)

  // Hidden date input used to open a native date picker for manual override.
  // We reuse a single input and re-target it per product to avoid one input
  // per row.
  const manualDateInputRef = useRef<HTMLInputElement>(null)
  const [manualDateProductId, setManualDateProductId] = useState<string | null>(null)

  // Delete confirm state
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<MaterialSupplier | null>(null)
  const [deleteProductTarget, setDeleteProductTarget] = useState<InventoryProduct | null>(null)
  const [deleteKitGroupTarget, setDeleteKitGroupTarget] = useState<InventoryKitGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage =
    userRole === 'admin' || userRole === 'office_manager' || userRole === 'salesman'
  const canDelete = userRole === 'admin' || userRole === 'office_manager'

  // Group products by supplier id for quick render.
  const productsBySupplier = useMemo(() => {
    const map = new Map<string, InventoryProduct[]>()
    for (const p of products) {
      const arr = map.get(p.supplier_id) ?? []
      arr.push(p)
      map.set(p.supplier_id, arr)
    }
    return map
  }, [products])

  // Group kit groups by supplier id.
  const kitGroupsBySupplier = useMemo(() => {
    const map = new Map<string, InventoryKitGroup[]>()
    const sorted = [...kitGroups].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.name.localeCompare(b.name)
    })
    for (const g of sorted) {
      const arr = map.get(g.supplier_id) ?? []
      arr.push(g)
      map.set(g.supplier_id, arr)
    }
    return map
  }, [kitGroups])

  function toggleSupplierCollapsed(id: string) {
    setCollapsedSuppliers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ================================================================ */
  /*  SUPPLIER CRUD                                                    */
  /* ================================================================ */

  function openAddSupplier() {
    setEditingSupplier(null)
    setSupplierModalOpen(true)
  }

  function openEditSupplier(supplier: MaterialSupplier) {
    setEditingSupplier(supplier)
    setSupplierModalOpen(true)
  }

  async function saveSupplier(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return

    if (editingSupplier) {
      const previous = editingSupplier
      setSuppliers((prev) =>
        prev.map((s) => (s.id === previous.id ? { ...s, name: trimmed } : s))
      )
      const { error } = await supabase
        .from('material_suppliers')
        .update({ name: trimmed })
        .eq('id', previous.id)
      if (error) {
        setSuppliers((prev) =>
          prev.map((s) => (s.id === previous.id ? previous : s))
        )
      }
    } else {
      const { data, error } = await supabase
        .from('material_suppliers')
        .insert({ name: trimmed })
        .select()
        .single()
      if (!error && data) {
        setSuppliers((prev) =>
          [...prev, data as MaterialSupplier].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        )
      }
    }

    setSupplierModalOpen(false)
    setEditingSupplier(null)
  }

  async function confirmDeleteSupplier() {
    if (!deleteSupplierTarget) return
    const target = deleteSupplierTarget
    setDeleting(true)
    const { error } = await supabase
      .from('material_suppliers')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setSuppliers((prev) => prev.filter((s) => s.id !== target.id))
      setProducts((prev) => prev.filter((p) => p.supplier_id !== target.id))
      setKitGroups((prev) => prev.filter((g) => g.supplier_id !== target.id))
    }
    setDeleting(false)
    setDeleteSupplierTarget(null)
  }

  /* ================================================================ */
  /*  PRODUCT CRUD                                                     */
  /* ================================================================ */

  function openAddProduct(supplierId: string) {
    setEditingProduct(null)
    setProductModalSupplierId(supplierId)
    setProductModalOpen(true)
  }

  function openEditProduct(product: InventoryProduct) {
    setEditingProduct(product)
    setProductModalSupplierId(product.supplier_id)
    setProductModalOpen(true)
  }

  async function saveProduct(data: ProductFormData) {
    const trimmedName = data.name.trim()
    if (!trimmedName || !productModalSupplierId) return

    if (editingProduct) {
      const previous = editingProduct
      setProducts((prev) =>
        prev.map((p) =>
          p.id === previous.id
            ? {
                ...p,
                name: trimmedName,
                quantity: data.quantity,
                unit: data.unit,
                kit_group_id: data.kit_group_id,
              }
            : p
        )
      )
      const { error } = await supabase
        .from('inventory_products')
        .update({
          name: trimmedName,
          quantity: data.quantity,
          unit: data.unit,
          kit_group_id: data.kit_group_id,
        })
        .eq('id', previous.id)
      if (error) {
        setProducts((prev) => prev.map((p) => (p.id === previous.id ? previous : p)))
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('inventory_products')
        .insert({
          supplier_id: productModalSupplierId,
          name: trimmedName,
          quantity: data.quantity,
          unit: data.unit,
          kit_group_id: data.kit_group_id,
        })
        .select()
        .single()
      if (!error && inserted) {
        setProducts((prev) => [...prev, inserted as InventoryProduct])
      }
    }

    setProductModalOpen(false)
    setEditingProduct(null)
    setProductModalSupplierId(null)
  }

  async function confirmDeleteProduct() {
    if (!deleteProductTarget) return
    const target = deleteProductTarget
    setDeleting(true)
    const { error } = await supabase
      .from('inventory_products')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== target.id))
    }
    setDeleting(false)
    setDeleteProductTarget(null)
  }

  /* ================================================================ */
  /*  KIT GROUP CRUD                                                   */
  /* ================================================================ */

  function openAddKitGroup(supplierId: string) {
    setEditingKitGroup(null)
    setKitGroupModalSupplierId(supplierId)
    setKitGroupModalOpen(true)
  }

  function openEditKitGroup(kitGroup: InventoryKitGroup) {
    setEditingKitGroup(kitGroup)
    setKitGroupModalSupplierId(kitGroup.supplier_id)
    setKitGroupModalOpen(true)
  }

  async function saveKitGroup(data: KitGroupFormData) {
    if (!kitGroupModalSupplierId) return

    if (editingKitGroup) {
      const previous = editingKitGroup
      setKitGroups((prev) =>
        prev.map((g) =>
          g.id === previous.id
            ? {
                ...g,
                name: data.name,
                full_kits: data.full_kits,
                full_kit_size: data.full_kit_size,
                partial_kits: data.partial_kits,
                partial_kit_size: data.partial_kit_size,
              }
            : g
        )
      )
      const { error } = await supabase
        .from('inventory_kit_groups')
        .update({
          name: data.name,
          full_kits: data.full_kits,
          full_kit_size: data.full_kit_size,
          partial_kits: data.partial_kits,
          partial_kit_size: data.partial_kit_size,
        })
        .eq('id', previous.id)
      if (error) {
        setKitGroups((prev) => prev.map((g) => (g.id === previous.id ? previous : g)))
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('inventory_kit_groups')
        .insert({
          supplier_id: kitGroupModalSupplierId,
          name: data.name,
          full_kits: data.full_kits,
          full_kit_size: data.full_kit_size,
          partial_kits: data.partial_kits,
          partial_kit_size: data.partial_kit_size,
        })
        .select()
        .single()
      if (!error && inserted) {
        setKitGroups((prev) => [...prev, inserted as InventoryKitGroup])
      }
    }

    setKitGroupModalOpen(false)
    setEditingKitGroup(null)
    setKitGroupModalSupplierId(null)
  }

  async function updateKitGroupCount(
    group: InventoryKitGroup,
    field: 'full_kits' | 'partial_kits',
    next: number
  ) {
    const previous = group
    setKitGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, [field]: next } : g))
    )
    const { error } = await supabase
      .from('inventory_kit_groups')
      .update({ [field]: next })
      .eq('id', group.id)
    if (error) {
      setKitGroups((prev) => prev.map((g) => (g.id === group.id ? previous : g)))
    }
  }

  async function confirmDeleteKitGroup() {
    if (!deleteKitGroupTarget) return
    const target = deleteKitGroupTarget
    setDeleting(true)
    const { error } = await supabase
      .from('inventory_kit_groups')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setKitGroups((prev) => prev.filter((g) => g.id !== target.id))
      // ON DELETE SET NULL on the FK unlinks products in the DB — mirror it
      // locally so the UI shows them as standalone immediately.
      setProducts((prev) =>
        prev.map((p) =>
          p.kit_group_id === target.id ? { ...p, kit_group_id: null } : p
        )
      )
    }
    setDeleting(false)
    setDeleteKitGroupTarget(null)
  }

  /* ================================================================ */
  /*  STOCK CHECK REQUEST                                              */
  /* ================================================================ */

  /**
   * Create an office_task assigned to the selected user and link it back to
   * the product via inventory_products.stock_check_task_id. When the assignee
   * marks the task complete from My Work / Office Tasks, the shared
   * toggleOfficeTaskCompletion utility auto-updates stock_check_date and
   * clears the link (see src/lib/officeTaskCompletion.ts).
   */
  async function submitStockCheckRequest(assignedToId: string) {
    if (!stockCheckProduct) return
    const product = stockCheckProduct
    const supplier = suppliers.find((s) => s.id === product.supplier_id)
    const supplierName = supplier?.name ?? ''
    const title = supplierName
      ? `Stock Check: ${product.name} (${supplierName})`
      : `Stock Check: ${product.name}`

    // Insert the office task first so we have an id to link back.
    const { data: inserted, error: taskErr } = await supabase
      .from('office_tasks')
      .insert({
        title,
        description: `Stock check request for ${product.name}. Please count current inventory and mark this task complete — the Stock Check Date on the product will update automatically.`,
        assigned_to: assignedToId,
        priority: 'Normal',
        created_by: currentUserId,
      })
      .select('id')
      .single()
    if (taskErr || !inserted) {
      throw taskErr ?? new Error('Failed to create stock check task.')
    }
    const newTaskId = (inserted as { id: string }).id

    // Link the product to the new task.
    const { error: linkErr } = await supabase
      .from('inventory_products')
      .update({ stock_check_task_id: newTaskId })
      .eq('id', product.id)
    if (linkErr) {
      // Best-effort cleanup so we don't leave an orphaned task lying around.
      await supabase.from('office_tasks').delete().eq('id', newTaskId)
      throw linkErr
    }

    // Update local state optimistically so the row flips to "Pending" immediately.
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, stock_check_task_id: newTaskId } : p
      )
    )
    const assignee = profiles.find((p) => p.id === assignedToId)
    setPendingStockChecks((prev) => ({
      ...prev,
      [newTaskId]: {
        taskId: newTaskId,
        assigneeId: assignedToId,
        assigneeName: assignee?.display_name ?? 'Unknown',
      },
    }))

    setStockCheckProduct(null)
  }

  /* ================================================================ */
  /*  MANUAL STOCK CHECK DATE OVERRIDE                                 */
  /* ================================================================ */

  function openManualDatePicker(product: InventoryProduct) {
    if (!canManage) return
    setManualDateProductId(product.id)
    // Defer so the hidden input is in the DOM and targeting the new id.
    requestAnimationFrame(() => {
      const input = manualDateInputRef.current
      if (!input) return
      input.value = toDateInputValue(product.stock_check_date)
      // Use showPicker() when available so the native date UI appears right
      // at the click location. Fall back to focus()+click() on browsers
      // without showPicker support.
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        ;(input as HTMLInputElement & { showPicker: () => void }).showPicker()
      } else {
        input.focus()
        input.click()
      }
    })
  }

  async function handleManualDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const productId = manualDateProductId
    const newValue = e.target.value
    setManualDateProductId(null)
    if (!productId || !newValue) return

    const previous = products.find((p) => p.id === productId)
    if (!previous) return

    // Store at local noon so the rendered date matches what the user picked
    // regardless of timezone offset.
    const isoDate = new Date(`${newValue}T12:00:00`).toISOString()

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock_check_date: isoDate } : p))
    )
    const { error } = await supabase
      .from('inventory_products')
      .update({ stock_check_date: isoDate })
      .eq('id', productId)
    if (error) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, stock_check_date: previous.stock_check_date } : p
        )
      )
    }
  }

  /* ================================================================ */
  /*  RENDER HELPERS                                                   */
  /* ================================================================ */

  function renderProductRow(product: InventoryProduct, nested = false) {
    const pendingInfo = product.stock_check_task_id
      ? pendingStockChecks[product.stock_check_task_id]
      : undefined
    const hasPending = !!product.stock_check_task_id
    const level = getStockCheckLevel(product.stock_check_date, hasPending)
    const dateText = formatStockCheckDate(product.stock_check_date)
    const dateClass = stockCheckDateClass(level)

    return (
      <div
        key={product.id}
        className={`sm:grid sm:grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors ${
          nested ? 'sm:pl-10' : ''
        }`}
      >
        {/* Product name + status dot */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${stockCheckDotClass(level)}`}
            title={stockCheckDotTitle(level)}
            aria-label={stockCheckDotTitle(level)}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {product.name}
          </span>
        </div>
        {/* Quantity */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
            Qty:
          </span>
          {formatQuantity(product.quantity, product.unit as InventoryUnit)}
        </div>
        {/* Stock check request */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Stock check request:
          </span>
          {hasPending ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
              title={`Pending — assigned to ${pendingInfo?.assigneeName ?? 'Unknown'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pendingInfo?.assigneeName && (
                <span className="hidden md:inline text-amber-600 dark:text-amber-400 font-normal">
                  · {pendingInfo.assigneeName}
                </span>
              )}
            </span>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setStockCheckProduct(product)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors"
              title="Request a stock check"
            >
              <ClipboardListIcon className="w-3 h-3" />
              Request Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Stock check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Last checked:
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={() => openManualDatePicker(product)}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors ${dateClass}`}
              title="Click to set the date manually"
            >
              <CalendarIcon className="w-3 h-3 opacity-60" />
              {dateText}
            </button>
          ) : (
            <span className={dateClass}>{dateText}</span>
          )}
        </div>
        {/* Actions */}
        <div className="mt-2 sm:mt-0 flex sm:justify-end items-center gap-1">
          {canManage && (
            <button
              onClick={() => openEditProduct(product)}
              className="p-1.5 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors"
              title="Edit product"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteProductTarget(product)}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors"
              title="Delete product"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderKitGroupBlock(
    group: InventoryKitGroup,
    groupProducts: InventoryProduct[]
  ) {
    const sortedGroupProducts = [...groupProducts].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.name.localeCompare(b.name)
    })

    return (
      <div
        key={group.id}
        className="border-l-2 border-amber-200 dark:border-[#3a3a3a] ml-3 sm:ml-4 my-2"
      >
        {/* Kit group label row — muted, not a header */}
        <div className="flex items-center gap-2 pl-3 sm:pl-4 pr-4 py-2 group">
          <span className="text-xs font-medium text-gray-500 dark:text-[#a0a0a0] italic flex-1 truncate">
            {group.name}
          </span>
          {canManage && (
            <button
              onClick={() => openEditKitGroup(group)}
              className="p-1 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Edit kit group"
            >
              <PencilIcon className="w-3 h-3" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteKitGroupTarget(group)}
              className="p-1 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Delete kit group"
            >
              <Trash2Icon className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Products in the group */}
        {sortedGroupProducts.length === 0 ? (
          <div className="pl-3 sm:pl-4 pr-4 pb-2 text-xs text-gray-400 dark:text-[#6b6b6b] italic">
            No products in this group yet
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
            {sortedGroupProducts.map((p) => renderProductRow(p, true))}
          </div>
        )}

        {/* Kit sub-items — indented, muted, with a └ prefix */}
        <div className="pl-3 sm:pl-4 pr-4 pb-2 pt-1 space-y-0.5">
          <div className="flex items-center gap-2 pl-6 sm:pl-10 py-1 text-sm text-gray-400 dark:text-[#6b6b6b]">
            <span className="select-none text-gray-300 dark:text-[#4a4a4a] font-mono">└</span>
            <span className="flex-1">Full Kits</span>
            <InlineKitCount
              value={group.full_kits}
              canEdit={canManage}
              onSave={(next) => updateKitGroupCount(group, 'full_kits', next)}
            />
            <span className="text-xs text-gray-400 dark:text-[#6b6b6b] min-w-[60px] text-right">
              {group.full_kit_size || '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 pl-6 sm:pl-10 py-1 text-sm text-gray-400 dark:text-[#6b6b6b]">
            <span className="select-none text-gray-300 dark:text-[#4a4a4a] font-mono">└</span>
            <span className="flex-1">Partial Kits</span>
            <InlineKitCount
              value={group.partial_kits}
              canEdit={canManage}
              onSave={(next) => updateKitGroupCount(group, 'partial_kits', next)}
            />
            <span className="text-xs text-gray-400 dark:text-[#6b6b6b] min-w-[60px] text-right">
              {group.partial_kit_size || '—'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="w-full min-h-full bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/office"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#a0a0a0] dark:hover:text-white transition-colors mr-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Office</span>
          </Link>
          <PackageIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
            Inventory Management
          </h1>
        </div>
        {canManage && (
          <button
            onClick={openAddSupplier}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition flex-shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Supplier</span>
            <span className="sm:hidden">Supplier</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {suppliers.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2e2e2e] mb-4">
              <PackageIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-[#a0a0a0] font-medium">
              No suppliers yet
            </p>
            <p className="text-gray-400 dark:text-[#6b6b6b] text-sm mt-1">
              {canManage
                ? 'Click "+ Add Supplier" to get started.'
                : 'No suppliers have been added yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {suppliers.map((supplier) => {
              const supplierProducts = productsBySupplier.get(supplier.id) ?? []
              const supplierKitGroups = kitGroupsBySupplier.get(supplier.id) ?? []
              const collapsed = collapsedSuppliers.has(supplier.id)

              // Split products into standalone vs. grouped.
              const standaloneProducts = supplierProducts
                .filter((p) => !p.kit_group_id)
                .sort((a, b) => {
                  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
                  return a.name.localeCompare(b.name)
                })
              const productsByGroup = new Map<string, InventoryProduct[]>()
              for (const p of supplierProducts) {
                if (!p.kit_group_id) continue
                const arr = productsByGroup.get(p.kit_group_id) ?? []
                arr.push(p)
                productsByGroup.set(p.kit_group_id, arr)
              }

              const hasAnyContent =
                standaloneProducts.length > 0 || supplierKitGroups.length > 0

              return (
                <section key={supplier.id}>
                  {/* Supplier header with HR underneath */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => toggleSupplierCollapsed(supplier.id)}
                      className="p-1 -ml-1 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white transition-colors flex-shrink-0"
                      aria-label={collapsed ? 'Expand supplier' : 'Collapse supplier'}
                    >
                      {collapsed ? (
                        <ChevronRightIcon className="w-4 h-4" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                    </button>
                    <h2
                      className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white flex-1 truncate cursor-pointer"
                      onClick={() => toggleSupplierCollapsed(supplier.id)}
                    >
                      {supplier.name}
                    </h2>
                    <span className="text-[11px] text-gray-500 dark:text-[#a0a0a0] bg-gray-100 dark:bg-[#2e2e2e] px-2 py-0.5 rounded-full font-medium">
                      {supplierProducts.length}{' '}
                      {supplierProducts.length === 1 ? 'product' : 'products'}
                    </span>
                    {canManage && (
                      <button
                        onClick={() => openEditSupplier(supplier)}
                        className="p-1.5 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors"
                        title="Edit supplier"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteSupplierTarget(supplier)}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors"
                        title="Delete supplier"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-[#2a2a2a] mb-3" />

                  {!collapsed && (
                    <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden">
                      {/* Desktop/tablet table header */}
                      <div className="hidden sm:grid grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-[#2e2e2e] border-b border-gray-200 dark:border-[#3a3a3a] text-[11px] font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide">
                        <div>Product Name</div>
                        <div className="text-right">Gallons / Parts</div>
                        <div className="text-center">Stock Check Request</div>
                        <div className="text-center">Stock Check Date</div>
                        <div className="text-right">Actions</div>
                      </div>

                      {!hasAnyContent ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-[#6b6b6b]">
                          No products or kit groups yet
                        </div>
                      ) : (
                        <>
                          {/* Standalone products first */}
                          {standaloneProducts.length > 0 && (
                            <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                              {standaloneProducts.map((p) => renderProductRow(p))}
                            </div>
                          )}

                          {/* Kit groups with their products + sub-items */}
                          {supplierKitGroups.length > 0 && (
                            <div
                              className={`${
                                standaloneProducts.length > 0
                                  ? 'border-t border-gray-100 dark:border-[#3a3a3a]'
                                  : ''
                              } py-1`}
                            >
                              {supplierKitGroups.map((g) =>
                                renderKitGroupBlock(g, productsByGroup.get(g.id) ?? [])
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {canManage && (
                        <div className="border-t border-gray-100 dark:border-[#3a3a3a] px-4 py-2.5 bg-gray-50/50 dark:bg-[#2a2a2a] flex items-center gap-4 flex-wrap">
                          <button
                            onClick={() => openAddProduct(supplier.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add Product
                          </button>
                          <button
                            onClick={() => openAddKitGroup(supplier.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add Kit Group
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* Supplier modal */}
      {supplierModalOpen && (
        <SupplierModal
          supplier={editingSupplier}
          onClose={() => {
            setSupplierModalOpen(false)
            setEditingSupplier(null)
          }}
          onSave={saveSupplier}
        />
      )}

      {/* Product modal */}
      {productModalOpen && productModalSupplierId && (
        <ProductModal
          product={editingProduct}
          supplierName={
            suppliers.find((s) => s.id === productModalSupplierId)?.name ?? ''
          }
          kitGroups={kitGroupsBySupplier.get(productModalSupplierId) ?? []}
          onClose={() => {
            setProductModalOpen(false)
            setEditingProduct(null)
            setProductModalSupplierId(null)
          }}
          onSave={saveProduct}
        />
      )}

      {/* Kit group modal */}
      {kitGroupModalOpen && kitGroupModalSupplierId && (
        <KitGroupModal
          kitGroup={editingKitGroup}
          supplierName={
            suppliers.find((s) => s.id === kitGroupModalSupplierId)?.name ?? ''
          }
          onClose={() => {
            setKitGroupModalOpen(false)
            setEditingKitGroup(null)
            setKitGroupModalSupplierId(null)
          }}
          onSave={saveKitGroup}
        />
      )}

      {/* Delete supplier confirm */}
      {deleteSupplierTarget && (
        <ConfirmDialog
          title="Delete Supplier"
          message={`Delete "${deleteSupplierTarget.name}"? All products and kit groups under this supplier will also be deleted. This cannot be undone.`}
          confirmLabel="Delete Supplier"
          onConfirm={confirmDeleteSupplier}
          onCancel={() => setDeleteSupplierTarget(null)}
          loading={deleting}
        />
      )}

      {/* Delete product confirm */}
      {deleteProductTarget && (
        <ConfirmDialog
          title="Delete Product"
          message={`Delete "${deleteProductTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Product"
          onConfirm={confirmDeleteProduct}
          onCancel={() => setDeleteProductTarget(null)}
          loading={deleting}
        />
      )}

      {/* Delete kit group confirm */}
      {deleteKitGroupTarget && (
        <ConfirmDialog
          title="Delete Kit Group"
          message={`Delete kit group "${deleteKitGroupTarget.name}"? Products in this group will be unlinked (not deleted) and shown as standalone products.`}
          confirmLabel="Delete Kit Group"
          onConfirm={confirmDeleteKitGroup}
          onCancel={() => setDeleteKitGroupTarget(null)}
          loading={deleting}
        />
      )}

      {/* Stock check request modal */}
      {stockCheckProduct && (
        <StockCheckRequestModal
          productName={stockCheckProduct.name}
          supplierName={
            suppliers.find((s) => s.id === stockCheckProduct.supplier_id)?.name ?? ''
          }
          profiles={profiles}
          onClose={() => setStockCheckProduct(null)}
          onSubmit={submitStockCheckRequest}
        />
      )}

      {/* Hidden date input used by the manual stock check date override. One
          input is reused across all product rows — openManualDatePicker
          re-targets it per product before opening the native picker. */}
      <input
        ref={manualDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleManualDateChange}
      />
    </div>
  )
}
