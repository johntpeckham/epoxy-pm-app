'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageIcon, PlusIcon, PencilIcon, Trash2Icon, XIcon, EyeIcon, EyeOffIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { Project, Profile } from '@/types'
import { moveToTrash } from '@/lib/trashBin'
import WorkspaceShell from '../WorkspaceShell'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface MaterialOrdersWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

interface LineItem {
  id: string
  order_id: string
  manufacturer: string | null
  product: string
  quantity: number
  created_at: string
}

interface MaterialOrder {
  id: string
  project_id: string
  name: string
  status: string
  assigned_to: string | null
  notes: string | null
  is_published: boolean
  created_by: string
  created_at: string
  updated_at: string
  line_items: LineItem[]
}

const STATUS_OPTIONS = ['Pending', 'Ordered', 'Delivered', 'Backordered'] as const
const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  Pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  Ordered: { bg: 'bg-blue-100', text: 'text-blue-800' },
  Delivered: { bg: 'bg-green-100', text: 'text-green-800' },
  Backordered: { bg: 'bg-red-100', text: 'text-red-800' },
}

const STATUS_SORT: Record<string, number> = { Pending: 0, Ordered: 1, Backordered: 2, Delivered: 3 }

export default function MaterialOrdersWorkspace({ project, userId, onBack }: MaterialOrdersWorkspaceProps) {
  const [orders, setOrders] = useState<MaterialOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingOrder, setEditingOrder] = useState<MaterialOrder | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<MaterialOrder | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(null), 5000)
  }

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('material_orders')
      .select('*, material_order_line_items(*)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[MaterialOrders] Fetch failed:', error)
      showError('Failed to load material orders: ' + error.message)
    }
    const raw = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      line_items: (row.material_order_line_items as LineItem[]) ?? [],
    })) as MaterialOrder[]
    const sorted = raw.sort((a, b) => {
      const sa = STATUS_SORT[a.status] ?? 9
      const sb = STATUS_SORT[b.status] ?? 9
      if (sa !== sb) return sa - sb
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    setOrders(sorted)
    setLoading(false)
  }, [project.id])

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchOrders()
    fetchProfiles()
  }, [fetchOrders, fetchProfiles])

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const getAssigneeName = (id: string | null) => {
    if (!id) return 'Unassigned'
    return profileMap.get(id)?.display_name ?? 'Unknown'
  }

  const togglePublished = async (order: MaterialOrder) => {
    const newVal = !order.is_published
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, is_published: newVal } : o))
    const supabase = createClient()
    const { error } = await supabase
      .from('material_orders')
      .update({ is_published: newVal, updated_at: new Date().toISOString() })
      .eq('id', order.id)
    if (error) {
      showError('Failed to update publish status: ' + error.message)
      setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, is_published: !newVal } : o))
    }
  }

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const handleDelete = async () => {
    if (!deletingOrder) return
    setIsDeleting(true)
    const supabase = createClient()

    const { data: snapshot } = await supabase
      .from('material_orders')
      .select('*')
      .eq('id', deletingOrder.id)
      .single()

    const { error } = await moveToTrash(
      supabase,
      'material_order',
      deletingOrder.id,
      deletingOrder.name,
      userId,
      (snapshot as Record<string, unknown>) ?? { id: deletingOrder.id, name: deletingOrder.name },
      project.name,
    )
    if (error) {
      showError('Failed to delete order: ' + error)
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== deletingOrder.id))
    }
    setIsDeleting(false)
    setDeletingOrder(null)
  }

  function lineItemSummary(order: MaterialOrder) {
    const items = order.line_items
    if (items.length === 0) return order.name || 'No items'
    const names = items.slice(0, 3).map((li) => li.product)
    const suffix = items.length > 3 ? ` +${items.length - 3} more` : ''
    return names.join(', ') + suffix
  }

  return (
    <WorkspaceShell
      title="Material Orders"
      icon={<PackageIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New Order
        </button>
      }
    >
      <div className="p-4">
        {errorMessage && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600 p-0.5">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <PackageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No material orders yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Create the first order
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-1">{orders.length} order{orders.length === 1 ? '' : 's'}</p>
            {orders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] ?? { bg: 'bg-gray-100', text: 'text-gray-800' }
              const isExpanded = expandedOrders.has(order.id)
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border border-gray-200 hover:shadow-sm hover:border-gray-300 transition-all ${
                    !order.is_published ? 'opacity-60' : ''
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleExpanded(order.id)}
                        className="mt-0.5 p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        {isExpanded
                          ? <ChevronDownIcon className="w-4 h-4" />
                          : <ChevronRightIcon className="w-4 h-4" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                            {order.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {order.line_items.length} item{order.line_items.length !== 1 ? 's' : ''}
                          </span>
                          {!order.is_published && (
                            <span className="text-xs text-gray-400 italic">Hidden from feed</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5 truncate">{lineItemSummary(order)}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>Assigned: {getAssigneeName(order.assigned_to)}</span>
                          <span>{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => togglePublished(order)}
                          className={`p-1.5 rounded transition ${order.is_published ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                          title={order.is_published ? 'Published — visible in Job Feed' : 'Hidden — not visible in Job Feed'}
                        >
                          {order.is_published ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditingOrder(order)}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingOrder(order)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded line items */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-3 py-2">
                      {order.notes && (
                        <p className="text-xs text-gray-500 mb-2 italic">{order.notes}</p>
                      )}
                      {order.line_items.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No line items</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase tracking-wide">
                              <th className="text-left py-1 font-semibold">Manufacturer</th>
                              <th className="text-left py-1 font-semibold">Product</th>
                              <th className="text-right py-1 font-semibold pr-1">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700">
                            {order.line_items.map((li) => (
                              <tr key={li.id} className="border-t border-gray-50">
                                <td className="py-1.5 text-gray-500">{li.manufacturer || '—'}</td>
                                <td className="py-1.5">{li.product}</td>
                                <td className="py-1.5 text-right pr-1 tabular-nums">{li.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <MaterialOrderModal
          project={project}
          userId={userId}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchOrders() }}
        />
      )}

      {editingOrder && (
        <MaterialOrderModal
          project={project}
          userId={userId}
          profiles={profiles}
          existing={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={() => { setEditingOrder(null); fetchOrders() }}
        />
      )}

      {deletingOrder && (
        <ConfirmDialog
          title="Delete Material Order"
          message={`Are you sure you want to delete this order with ${deletingOrder.line_items.length} item${deletingOrder.line_items.length !== 1 ? 's' : ''}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingOrder(null)}
          loading={isDeleting}
        />
      )}
    </WorkspaceShell>
  )
}

/* ── Line item form row type ─────────────────────────────────────── */

interface LineItemRow {
  key: string // client-side key for React
  manufacturer: string
  product: string
  quantity: string
}

function emptyRow(): LineItemRow {
  return { key: crypto.randomUUID(), manufacturer: '', product: '', quantity: '1' }
}

/* ── Material Order Modal (Create / Edit) ──────────────────────────── */

function MaterialOrderModal({
  project,
  userId,
  profiles,
  existing,
  onClose,
  onSaved,
}: {
  project: Project
  userId: string
  profiles: Profile[]
  existing?: MaterialOrder
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState(existing?.status ?? 'Pending')
  const [assignedTo, setAssignedTo] = useState(existing?.assigned_to ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [createTask, setCreateTask] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => {
    if (existing && existing.line_items.length > 0) {
      return existing.line_items.map((li) => ({
        key: li.id,
        manufacturer: li.manufacturer ?? '',
        product: li.product,
        quantity: String(li.quantity),
      }))
    }
    return [emptyRow()]
  })

  const isEdit = !!existing

  function updateLineItem(key: string, field: keyof LineItemRow, value: string) {
    setLineItems((prev) => prev.map((li) => li.key === key ? { ...li, [field]: value } : li))
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyRow()])
  }

  function removeLineItem(key: string) {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((li) => li.key !== key))
  }

  const handleSubmit = async () => {
    // Validate: at least one line item with a product
    const validItems = lineItems.filter((li) => li.product.trim())
    if (validItems.length === 0) {
      setError('At least one line item with a product name is required')
      return
    }
    for (const li of validItems) {
      const qty = parseFloat(li.quantity)
      if (isNaN(qty) || qty <= 0) {
        setError(`Invalid quantity for "${li.product}"`)
        return
      }
    }

    setSaving(true)
    setError('')
    const supabase = createClient()

    // Build a summary name from line items for the order's name field
    const summaryName = validItems.slice(0, 3).map((li) => li.product.trim()).join(', ')
      + (validItems.length > 3 ? ` +${validItems.length - 3} more` : '')

    if (isEdit) {
      // Update order fields
      const { error: updateErr } = await supabase
        .from('material_orders')
        .update({
          name: summaryName,
          status,
          assigned_to: assignedTo || null,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (updateErr) { setError('Failed to update order: ' + updateErr.message); setSaving(false); return }

      // Replace line items: delete old, insert new
      await supabase.from('material_order_line_items').delete().eq('order_id', existing.id)
      const { error: liErr } = await supabase.from('material_order_line_items').insert(
        validItems.map((li) => ({
          order_id: existing.id,
          manufacturer: li.manufacturer.trim() || null,
          product: li.product.trim(),
          quantity: parseFloat(li.quantity),
        }))
      )
      if (liErr) { setError('Failed to update line items: ' + liErr.message); setSaving(false); return }
    } else {
      // Create order
      const { data: newOrder, error: insertErr } = await supabase
        .from('material_orders')
        .insert({
          project_id: project.id,
          name: summaryName,
          status,
          assigned_to: assignedTo || null,
          notes: notes.trim() || null,
          created_by: userId,
        })
        .select('id')
        .single()
      if (insertErr || !newOrder) { setError('Failed to create order: ' + (insertErr?.message ?? 'Unknown error')); setSaving(false); return }

      // Insert line items
      const { error: liErr } = await supabase.from('material_order_line_items').insert(
        validItems.map((li) => ({
          order_id: newOrder.id,
          manufacturer: li.manufacturer.trim() || null,
          product: li.product.trim(),
          quantity: parseFloat(li.quantity),
        }))
      )
      if (liErr) { setError('Failed to create line items: ' + liErr.message); setSaving(false); return }

      // Optionally create a linked task
      if (createTask) {
        await supabase.from('tasks').insert({
          project_id: project.id,
          created_by: userId,
          assigned_to: assignedTo || null,
          title: `Order: ${summaryName}`,
          description: notes.trim() || null,
          status: 'new_task',
        })
      }
    }

    onSaved()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white w-full sm:max-w-[900px] sm:w-[90%] sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Order' : 'New Material Order'}</h3>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            {/* ── Line items ──────────────────────────────── */}
            <div>
              <div className="space-y-2">
                {lineItems.map((li, idx) => (
                  <div key={li.key} className="flex flex-col sm:flex-row sm:items-end gap-2 bg-gray-50 rounded-lg p-2.5">
                    <div className="w-full sm:w-[140px]">
                      {idx === 0 && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Manufacturer</label>}
                      <input
                        value={li.manufacturer}
                        onChange={(e) => updateLineItem(li.key, 'manufacturer', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                        placeholder="Manufacturer"
                      />
                    </div>
                    <div className="flex-1">
                      {idx === 0 && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Product</label>}
                      <input
                        value={li.product}
                        onChange={(e) => updateLineItem(li.key, 'product', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                        placeholder="Product *"
                      />
                    </div>
                    <div className="w-full sm:w-[80px]">
                      {idx === 0 && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qty</label>}
                      <input
                        value={li.quantity}
                        onChange={(e) => updateLineItem(li.key, 'quantity', e.target.value)}
                        inputMode="decimal"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-right tabular-nums"
                        placeholder="Qty"
                      />
                    </div>
                    <button
                      onClick={() => removeLineItem(li.key)}
                      disabled={lineItems.length <= 1}
                      className="self-center p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                      title={lineItems.length <= 1 ? 'Cannot remove last item' : `Remove item ${idx + 1}`}
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="mt-2 flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {/* ── Order details ──────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      status === s
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assign To</label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name || 'Unknown'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="Optional notes..." />
            </div>

            {!isEdit && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createTask}
                  onChange={(e) => setCreateTask(e.target.checked)}
                  className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Create a task for this order</span>
              </label>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Order'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
