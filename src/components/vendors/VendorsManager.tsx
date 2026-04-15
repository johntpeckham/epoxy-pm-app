'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  Loader2Icon,
  SearchIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  StarIcon,
  PhoneIcon,
  MailIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Vendor, VendorContact } from '@/types/vendor'

type VendorFormState = {
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  notes: string
}

function emptyVendorForm(): VendorFormState {
  return {
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  }
}

interface Props {
  userId: string
}

export default function VendorsManager({ userId }: Props) {
  const supabase = createClient()

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add vendor modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState<VendorFormState>(emptyVendorForm())
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Delete vendor
  const [confirmDeleteVendor, setConfirmDeleteVendor] = useState<Vendor | null>(null)
  const [deletingVendor, setDeletingVendor] = useState(false)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    const { data: vendorRows } = await supabase
      .from('vendors')
      .select('*')
      .order('name', { ascending: true })
    const list = (vendorRows ?? []) as Vendor[]
    setVendors(list)

    if (list.length > 0) {
      const { data: contactRows } = await supabase
        .from('vendor_contacts')
        .select('vendor_id')
      const counts: Record<string, number> = {}
      for (const row of contactRows ?? []) {
        const vid = (row as { vendor_id: string }).vendor_id
        counts[vid] = (counts[vid] ?? 0) + 1
      }
      setContactCounts(counts)
    } else {
      setContactCounts({})
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  function openAddModal() {
    setAddForm(emptyVendorForm())
    setAddError(null)
    setAddModalOpen(true)
  }

  async function handleAddVendor() {
    const name = addForm.name.trim()
    if (!name) {
      setAddError('Name is required.')
      return
    }
    setAddSaving(true)
    setAddError(null)
    const payload = {
      name,
      email: addForm.email.trim() || null,
      phone: addForm.phone.trim() || null,
      address: addForm.address.trim() || null,
      city: addForm.city.trim() || null,
      state: addForm.state.trim() || null,
      zip: addForm.zip.trim() || null,
      notes: addForm.notes.trim() || null,
      created_by: userId,
    }
    const { data, error } = await supabase
      .from('vendors')
      .insert(payload)
      .select()
      .single()
    setAddSaving(false)
    if (error) {
      setAddError(error.message)
      return
    }
    setAddModalOpen(false)
    await fetchVendors()
    if (data) setExpandedId((data as Vendor).id)
  }

  async function handleDeleteVendor() {
    if (!confirmDeleteVendor) return
    setDeletingVendor(true)
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', confirmDeleteVendor.id)
    setDeletingVendor(false)
    if (error) {
      alert(error.message)
      return
    }
    if (expandedId === confirmDeleteVendor.id) setExpandedId(null)
    setConfirmDeleteVendor(null)
    await fetchVendors()
  }

  async function handleUpdateVendor(vendorId: string, patch: Partial<Vendor>) {
    const { error } = await supabase
      .from('vendors')
      .update(patch)
      .eq('id', vendorId)
    if (error) {
      alert(error.message)
      return false
    }
    setVendors((prev) =>
      prev.map((v) => (v.id === vendorId ? { ...v, ...patch } : v))
    )
    return true
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter((v) => {
      return (
        v.name.toLowerCase().includes(q) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.phone && v.phone.toLowerCase().includes(q))
      )
    })
  }, [vendors, search])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search + Add */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 bg-white text-gray-900 placeholder-gray-400"
          />
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm flex-shrink-0"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Add vendor</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Vendor list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2Icon className="w-6 h-6 text-gray-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2Icon className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">
              {vendors.length === 0
                ? 'No vendors yet. Add one to get started.'
                : 'No matching vendors.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((vendor) => {
              const isExpanded = expandedId === vendor.id
              const count = contactCounts[vendor.id] ?? 0
              const cityState = [vendor.city, vendor.state].filter(Boolean).join(', ')
              return (
                <div
                  key={vendor.id}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : vendor.id)}
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition"
                  >
                    <div className="mt-0.5 flex-shrink-0 text-gray-400">
                      {isExpanded ? (
                        <ChevronDownIcon className="w-4 h-4" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{vendor.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {vendor.email && (
                          <a
                            href={`mailto:${vendor.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:text-amber-600 truncate max-w-full"
                          >
                            <MailIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{vendor.email}</span>
                          </a>
                        )}
                        {vendor.phone && (
                          <a
                            href={`tel:${vendor.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:text-amber-600"
                          >
                            <PhoneIcon className="w-3 h-3 flex-shrink-0" />
                            {vendor.phone}
                          </a>
                        )}
                        {cityState && <span className="truncate">{cityState}</span>}
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                      {count} {count === 1 ? 'contact' : 'contacts'}
                    </span>
                  </button>
                  {isExpanded && (
                    <VendorDetail
                      vendor={vendor}
                      onUpdate={(patch) => handleUpdateVendor(vendor.id, patch)}
                      onDelete={() => setConfirmDeleteVendor(vendor)}
                      onContactsChanged={() =>
                        setContactCounts((prev) => ({ ...prev }))
                      }
                      onContactCountChange={(delta) =>
                        setContactCounts((prev) => ({
                          ...prev,
                          [vendor.id]: Math.max(0, (prev[vendor.id] ?? 0) + delta),
                        }))
                      }
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addModalOpen && (
        <VendorFormModal
          title="New Vendor"
          form={addForm}
          setForm={setAddForm}
          saving={addSaving}
          error={addError}
          onClose={() => setAddModalOpen(false)}
          onSave={handleAddVendor}
        />
      )}

      {confirmDeleteVendor && (
        <ConfirmDialog
          title="Delete Vendor"
          message={`Delete "${confirmDeleteVendor.name}"? This will also delete all contacts for this vendor. This cannot be undone.`}
          confirmLabel={deletingVendor ? 'Deleting...' : 'Delete'}
          onConfirm={handleDeleteVendor}
          onCancel={() => setConfirmDeleteVendor(null)}
        />
      )}
    </div>
  )
}

/* ================================================================== */
/*  VENDOR DETAIL (expanded row)                                       */
/* ================================================================== */

function VendorDetail({
  vendor,
  onUpdate,
  onDelete,
  onContactsChanged,
  onContactCountChange,
}: {
  vendor: Vendor
  onUpdate: (patch: Partial<Vendor>) => Promise<boolean>
  onDelete: () => void
  onContactsChanged: () => void
  onContactCountChange: (delta: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<VendorFormState>({
    name: vendor.name,
    email: vendor.email ?? '',
    phone: vendor.phone ?? '',
    address: vendor.address ?? '',
    city: vendor.city ?? '',
    state: vendor.state ?? '',
    zip: vendor.zip ?? '',
    notes: vendor.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setForm({
      name: vendor.name,
      email: vendor.email ?? '',
      phone: vendor.phone ?? '',
      address: vendor.address ?? '',
      city: vendor.city ?? '',
      state: vendor.state ?? '',
      zip: vendor.zip ?? '',
      notes: vendor.notes ?? '',
    })
    setError(null)
    setEditing(true)
  }

  async function saveEdit() {
    const name = form.name.trim()
    if (!name) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    const ok = await onUpdate({
      name,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-4">
      {/* Vendor info */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Vendor Info
          </h4>
          {!editing ? (
            <div className="flex items-center gap-1">
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded-md hover:bg-amber-50 transition"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded-md hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          ) : null}
        </div>

        {editing ? (
          <div className="space-y-3 bg-white border border-gray-200 rounded-lg p-3">
            {error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendor name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!form.name.trim() || saving}
                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <DetailField label="Email" value={vendor.email} as="email" />
              <DetailField label="Phone" value={vendor.phone} as="phone" />
              <DetailField label="Address" value={vendor.address} />
              <DetailField
                label="City / State / Zip"
                value={[vendor.city, vendor.state, vendor.zip].filter(Boolean).join(', ') || null}
              />
            </div>
            {vendor.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{vendor.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contacts — wired in the next step */}
      <VendorContactsPanel
        vendorId={vendor.id}
        onContactsChanged={onContactsChanged}
        onContactCountChange={onContactCountChange}
      />
    </div>
  )
}

function DetailField({
  label,
  value,
  as,
}: {
  label: string
  value: string | null
  as?: 'email' | 'phone'
}) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      {value ? (
        as === 'email' ? (
          <a href={`mailto:${value}`} className="text-sm text-amber-600 hover:text-amber-700 break-all">
            {value}
          </a>
        ) : as === 'phone' ? (
          <a href={`tel:${value}`} className="text-sm text-amber-600 hover:text-amber-700">
            {value}
          </a>
        ) : (
          <p className="text-sm text-gray-900">{value}</p>
        )
      ) : (
        <p className="text-sm text-gray-300 italic">Not set</p>
      )}
    </div>
  )
}

/* ================================================================== */
/*  VENDOR CONTACTS (placeholder; wired in next step)                  */
/* ================================================================== */

type ContactFormState = {
  first_name: string
  last_name: string
  job_title: string
  email: string
  phone: string
  is_primary: boolean
}

function emptyContactForm(): ContactFormState {
  return {
    first_name: '',
    last_name: '',
    job_title: '',
    email: '',
    phone: '',
    is_primary: false,
  }
}

function VendorContactsPanel({
  vendorId,
  onContactsChanged,
  onContactCountChange,
}: {
  vendorId: string
  onContactsChanged: () => void
  onContactCountChange: (delta: number) => void
}) {
  const supabase = createClient()
  const [contacts, setContacts] = useState<VendorContact[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null)
  const [form, setForm] = useState<ContactFormState>(emptyContactForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<VendorContact | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('vendor_contacts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('is_primary', { ascending: false })
      .order('last_name', { ascending: true })
    setContacts((data ?? []) as VendorContact[])
    setLoading(false)
  }, [supabase, vendorId])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  function openAdd() {
    setEditingContact(null)
    setForm(emptyContactForm())
    setError(null)
    setModalOpen(true)
  }

  function openEdit(contact: VendorContact) {
    setEditingContact(contact)
    setForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      job_title: contact.job_title ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      is_primary: !!contact.is_primary,
    })
    setError(null)
    setModalOpen(true)
  }

  async function save() {
    const first = form.first_name.trim()
    const last = form.last_name.trim()
    if (!first || !last) {
      setError('First and last name are required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      vendor_id: vendorId,
      first_name: first,
      last_name: last,
      job_title: form.job_title.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      is_primary: form.is_primary,
    }

    // If marking as primary, unset any other primary first to keep a single
    // primary contact per vendor.
    if (form.is_primary) {
      await supabase
        .from('vendor_contacts')
        .update({ is_primary: false })
        .eq('vendor_id', vendorId)
        .neq('id', editingContact?.id ?? '00000000-0000-0000-0000-000000000000')
    }

    if (editingContact) {
      const { error: updateErr } = await supabase
        .from('vendor_contacts')
        .update(payload)
        .eq('id', editingContact.id)
      if (updateErr) {
        setSaving(false)
        setError(updateErr.message)
        return
      }
    } else {
      const { error: insertErr } = await supabase
        .from('vendor_contacts')
        .insert(payload)
      if (insertErr) {
        setSaving(false)
        setError(insertErr.message)
        return
      }
      onContactCountChange(1)
    }

    setSaving(false)
    setModalOpen(false)
    await fetchContacts()
    onContactsChanged()
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error: deleteErr } = await supabase
      .from('vendor_contacts')
      .delete()
      .eq('id', confirmDelete.id)
    setDeleting(false)
    if (deleteErr) {
      alert(deleteErr.message)
      return
    }
    onContactCountChange(-1)
    setConfirmDelete(null)
    await fetchContacts()
    onContactsChanged()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Contacts {contacts.length > 0 && `(${contacts.length})`}
        </h4>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded-md hover:bg-amber-50 transition"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add contact
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2Icon className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-400">No contacts yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  {c.is_primary && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                      <StarIcon className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                      Primary
                    </span>
                  )}
                </div>
                {c.job_title && (
                  <p className="text-xs text-gray-500 truncate">{c.job_title}</p>
                )}
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 hover:text-amber-600 truncate max-w-full"
                    >
                      <MailIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 hover:text-amber-600"
                    >
                      <PhoneIcon className="w-3 h-3 flex-shrink-0" />
                      {c.phone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(c)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                  title="Edit contact"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(c)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                  title="Delete contact"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <ContactFormModal
          title={editingContact ? 'Edit Contact' : 'New Contact'}
          form={form}
          setForm={setForm}
          saving={saving}
          error={error}
          onClose={() => setModalOpen(false)}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Contact"
          message={`Delete "${confirmDelete.first_name} ${confirmDelete.last_name}"? This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

/* ================================================================== */
/*  CONTACT FORM MODAL                                                 */
/* ================================================================== */

function ContactFormModal({
  title,
  form,
  setForm,
  saving,
  error,
  onClose,
  onSave,
}: {
  title: string
  form: ContactFormState
  setForm: (updater: (prev: ContactFormState) => ContactFormState) => void
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: () => void
}) {
  function update<K extends keyof ContactFormState>(
    key: K,
    value: ContactFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job title</label>
            <input
              type="text"
              value={form.job_title}
              onChange={(e) => update('job_title', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => update('is_primary', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
            Primary contact
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!form.first_name.trim() || !form.last_name.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  VENDOR FORM MODAL                                                  */
/* ================================================================== */

function VendorFormModal({
  title,
  form,
  setForm,
  saving,
  error,
  onClose,
  onSave,
}: {
  title: string
  form: VendorFormState
  setForm: (updater: (prev: VendorFormState) => VendorFormState) => void
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: () => void
}) {
  function update<K extends keyof VendorFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              placeholder="Company name"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => update('state', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => update('zip', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-y"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!form.name.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
