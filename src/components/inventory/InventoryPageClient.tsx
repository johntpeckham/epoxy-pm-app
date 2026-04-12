'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SupplierModal from './SupplierModal'
import ProductModal from './ProductModal'
import type {
  InventoryProduct,
  InventoryUnit,
  MaterialSupplier,
  UserRole,
} from '@/types'

interface Props {
  userRole: UserRole
  initialSuppliers: MaterialSupplier[]
  initialProducts: InventoryProduct[]
}

function formatStockCheckDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatQuantity(quantity: number, unit: InventoryUnit): string {
  // Trim trailing zeros on decimal quantities so "5" renders as "5" instead of
  // "5.00"; keep meaningful decimals for fractional inputs like 2.5.
  const q = Number.isInteger(quantity) ? quantity.toString() : quantity.toString()
  const label = unit === 'parts' ? 'parts' : 'gal'
  return `${q} ${label}`
}

export default function InventoryPageClient({
  userRole,
  initialSuppliers,
  initialProducts,
}: Props) {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>(initialSuppliers)
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts)

  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set())

  // Supplier modal state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null)

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
  const [productModalSupplierId, setProductModalSupplierId] = useState<string | null>(null)

  // Delete confirm state
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<MaterialSupplier | null>(null)
  const [deleteProductTarget, setDeleteProductTarget] = useState<InventoryProduct | null>(null)
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
        // Roll back on failure.
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

  async function saveProduct(data: {
    name: string
    quantity: number
    unit: InventoryUnit
  }) {
    const trimmedName = data.name.trim()
    if (!trimmedName || !productModalSupplierId) return

    if (editingProduct) {
      const previous = editingProduct
      setProducts((prev) =>
        prev.map((p) =>
          p.id === previous.id
            ? { ...p, name: trimmedName, quantity: data.quantity, unit: data.unit }
            : p
        )
      )
      const { error } = await supabase
        .from('inventory_products')
        .update({
          name: trimmedName,
          quantity: data.quantity,
          unit: data.unit,
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
              const collapsed = collapsedSuppliers.has(supplier.id)
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
                    <>
                      {/* Product table */}
                      <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden">
                        {/* Desktop/tablet table header */}
                        <div className="hidden sm:grid grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-[#2e2e2e] border-b border-gray-200 dark:border-[#3a3a3a] text-[11px] font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide">
                          <div>Product Name</div>
                          <div className="text-right">Gallons / Parts</div>
                          <div className="text-center">Stock Check Request</div>
                          <div className="text-center">Stock Check Date</div>
                          <div className="text-right">Actions</div>
                        </div>

                        {supplierProducts.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-[#6b6b6b]">
                            No products yet
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                            {supplierProducts.map((product) => (
                              <div
                                key={product.id}
                                className="sm:grid sm:grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
                              >
                                {/* Product name */}
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {product.name}
                                </div>
                                {/* Quantity */}
                                <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
                                  <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
                                    Qty:
                                  </span>
                                  {formatQuantity(product.quantity, product.unit as InventoryUnit)}
                                </div>
                                {/* Stock check request placeholder */}
                                <div className="mt-1 sm:mt-0 text-xs sm:text-center">
                                  <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
                                    Stock check request:
                                  </span>
                                  <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-gray-400 dark:text-[#6b6b6b] bg-gray-100 dark:bg-[#2e2e2e] cursor-not-allowed"
                                    title="Coming soon"
                                  >
                                    —
                                  </button>
                                </div>
                                {/* Stock check date */}
                                <div className="mt-1 sm:mt-0 text-xs sm:text-sm text-gray-500 dark:text-[#a0a0a0] sm:text-center">
                                  <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
                                    Last checked:
                                  </span>
                                  {formatStockCheckDate(product.stock_check_date)}
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
                            ))}
                          </div>
                        )}

                        {canManage && (
                          <div className="border-t border-gray-100 dark:border-[#3a3a3a] px-4 py-2.5 bg-gray-50/50 dark:bg-[#2a2a2a]">
                            <button
                              onClick={() => openAddProduct(supplier.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                              Add Product
                            </button>
                          </div>
                        )}
                      </div>
                    </>
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
          onClose={() => {
            setProductModalOpen(false)
            setEditingProduct(null)
            setProductModalSupplierId(null)
          }}
          onSave={saveProduct}
        />
      )}

      {/* Delete supplier confirm */}
      {deleteSupplierTarget && (
        <ConfirmDialog
          title="Delete Supplier"
          message={`Delete "${deleteSupplierTarget.name}"? All products under this supplier will also be deleted. This cannot be undone.`}
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
    </div>
  )
}
