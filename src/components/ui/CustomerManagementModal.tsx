'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  UsersIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  UserIcon,
  Loader2Icon,
} from 'lucide-react'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { moveToTrash } from '@/lib/trashBin'
import type { Customer } from '@/components/estimates/types'

interface CustomerManagementModalProps {
  open: boolean
  userId: string
  onClose: () => void
  onCustomersChanged: () => void
}

export default function CustomerManagementModal({
  open,
  userId,
  onClose,
  onCustomersChanged,
}: CustomerManagementModalProps) {
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add/Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formName, setFormName] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formCity, setFormCity] = useState('')
  const [formState, setFormState] = useState('')
  const [formZip, setFormZip] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (data) setCustomers(data)
    setLoading(false)
  }, [userId, supabase])

  useEffect(() => {
    if (open) fetchCustomers()
  }, [open, fetchCustomers])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  function openAddModal() {
    setEditingCustomer(null)
    setFormName('')
    setFormCompany('')
    setFormEmail('')
    setFormPhone('')
    setFormAddress('')
    setFormCity('')
    setFormState('')
    setFormZip('')
    setFormError(null)
    setEditModalOpen(true)
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer)
    setFormName(customer.name)
    setFormCompany(customer.company ?? '')
    setFormEmail(customer.email ?? '')
    setFormPhone(customer.phone ?? '')
    setFormAddress(customer.address ?? '')
    setFormCity(customer.city ?? '')
    setFormState(customer.state ?? '')
    setFormZip(customer.zip ?? '')
    setFormError(null)
    setEditModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      setFormError('Name is required.')
      return
    }
    setSaving(true)
    setFormError(null)

    const payload = {
      name: formName.trim(),
      company: formCompany.trim() || null,
      email: formEmail.trim() || null,
      phone: formPhone.trim() || null,
      address: formAddress.trim() || null,
      city: formCity.trim() || null,
      state: formState.trim() || null,
      zip: formZip.trim() || null,
      user_id: userId,
    }

    if (editingCustomer) {
      const { error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)
      if (error) {
        setFormError(error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('customers').insert(payload)
      if (error) {
        setFormError(error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditModalOpen(false)
    await fetchCustomers()
    onCustomersChanged()
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { data: snapshot } = await supabase.from('customers').select('*').eq('id', confirmDelete.id).single()
    if (snapshot) {
      await moveToTrash(supabase, 'customer', confirmDelete.id, confirmDelete.name, userId, snapshot as Record<string, unknown>)
    }
    setDeleting(false)
    setConfirmDelete(null)
    await fetchCustomers()
    onCustomersChanged()
  }

  if (!open) return null

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:w-[700px] md:max-w-[90vw] h-full md:h-[80vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-6 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <div className="flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Customer Management</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition"
              >
                <PlusIcon className="w-4 h-4" />
                Add Customer
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Customer list */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2Icon className="w-6 h-6 text-gray-300 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UserIcon className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">
                  {customers.length === 0
                    ? 'No customers yet. Add one to get started.'
                    : 'No matching customers.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map((customer) => (
                  <div
                    key={customer.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:border-gray-300 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
                      {customer.company && (
                        <p className="text-xs text-gray-500 truncate">{customer.company}</p>
                      )}
                      {customer.email && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{customer.email}</p>
                      )}
                      {customer.phone && (
                        <p className="text-xs text-gray-400 truncate">{customer.phone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(customer)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                        title="Edit customer"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(customer)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete customer"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {editModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={() => setEditModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCustomer ? 'Edit Customer' : 'New Customer'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {formError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <input
                  type="text"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="Contact name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <input
                    type="text"
                    value={formState}
                    onChange={(e) => setFormState(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                  <input
                    type="text"
                    value={formZip}
                    onChange={(e) => setFormZip(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 pb-6 border-t border-gray-200">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Customer"
          message={`Are you sure you want to delete "${confirmDelete.name}"? It will be moved to the trash bin and can be restored within 30 days.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </Portal>
  )
}
