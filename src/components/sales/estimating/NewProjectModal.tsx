'use client'

import { useState, useEffect, useMemo } from 'react'
import { AlertTriangleIcon, Loader2Icon, PencilIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  assignNextProjectNumber,
  peekNextProjectNumber,
} from '@/lib/nextProjectNumber'
import { usePermissions } from '@/lib/usePermissions'
import CreationFormModal, {
  type CreationFormData,
  type CustomerOption,
  type AssigneeOption,
} from '@/components/shared/CreationFormModal'
import type { Customer } from '@/components/proposals/types'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import type { EstimatingProject } from './types'
import ProjectAddressFields, {
  EMPTY_ADDRESS,
  type AddressValues,
} from './ProjectAddressFields'
import NewCustomerSubModal from './NewCustomerSubModal'

interface NewProjectModalProps {
  userId: string
  customers: Customer[]
  prefillCustomerId?: string | null
  onClose: () => void
  onCreated: (project: EstimatingProject) => void
  onCustomerCreated?: (customer: Customer) => void
}

// Bounded retry on auto-assigned project numbers. If another concurrent
// insert grabbed the same number we just reserved, peek and try the next
// one. Five attempts handles realistic bursts; beyond that, something else
// is wrong and the user should see an error.
const MAX_PROJECT_NUMBER_RETRIES = 5

function customerToOption(c: Customer): CustomerOption {
  return {
    id: c.id,
    name: c.name,
    subtitle: c.company,
    email: c.email,
    phone: c.phone,
    // Only the street column flows into the shared modal's single-line
    // Customer Address preview. The wrapper reads the full structured
    // city/state/zip directly off the Customer record for the
    // "Same as customer address" copy.
    address: c.address || null,
  }
}

export default function NewProjectModal({
  userId,
  customers,
  prefillCustomerId,
  onClose,
  onCreated,
  onCustomerCreated,
}: NewProjectModalProps) {
  const { canCreate } = usePermissions()
  const canCreateCustomer = canCreate('crm')

  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers)

  // The wrapper owns the selected-customer id so it can:
  //   (a) seed CreationFormModal with prefillCustomerId on mount
  //   (b) programmatically re-select when NewCustomerSubModal creates a row
  //   (c) read the customer's structured address columns when the user
  //       toggles "Same as customer address"
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    prefillCustomerId ?? null
  )
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  // Project Number state — owned here, fed into <ProjectNumberField/> via
  // the slotAfterCustomer slot. Mirrors the previous modal's peek-then-
  // assign pattern: peek on mount to show what the user is about to get;
  // assign on submit (or use the typed override) to actually reserve it.
  const [autoProjectNumber, setAutoProjectNumber] = useState<string | null>(null)
  const [projectNumber, setProjectNumber] = useState('')
  const [editingNumber, setEditingNumber] = useState(false)
  const [loadingNumber, setLoadingNumber] = useState(true)

  // Structured Project Address state — owned here, fed into
  // ProjectAddressFields via the extraSections slot.
  const [projectAddress, setProjectAddress] =
    useState<AddressValues>(EMPTY_ADDRESS)
  const [sameAsCustomer, setSameAsCustomer] = useState(false)

  // Categories + assignees are normally loaded by the parent list page (see
  // AddLeadModal, NewAppointmentModal). EstimatingClient doesn't load them,
  // and this refactor must be a drop-in replacement — so the wrapper
  // fetches them itself on mount.
  const [categories, setCategories] = useState<LeadCategory[]>([])
  const [assignees, setAssignees] = useState<AssigneeOption[]>([])

  // Sync if the parent updates the customers prop after mount.
  useEffect(() => {
    setLocalCustomers(customers)
  }, [customers])

  // Initial project-number peek.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    peekNextProjectNumber(supabase, userId)
      .then((n) => {
        if (cancelled) return
        setAutoProjectNumber(n)
        setProjectNumber(n)
        setLoadingNumber(false)
      })
      .catch((err) => {
        console.error('[NewProjectModal] Peek project number failed:', err)
        if (cancelled) return
        setAutoProjectNumber('1000')
        setProjectNumber('1000')
        setLoadingNumber(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Fetch lead_categories + assignable profiles for the unified dropdowns.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.all([
      supabase
        .from('lead_categories')
        .select('*')
        .order('name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['admin', 'office_manager', 'salesman'])
        .order('display_name', { ascending: true }),
    ]).then(([catRes, profRes]) => {
      if (cancelled) return
      if (catRes.error) {
        console.error('[NewProjectModal] Load lead_categories failed:', {
          code: catRes.error.code,
          message: catRes.error.message,
          hint: catRes.error.hint,
          details: catRes.error.details,
        })
      } else {
        setCategories((catRes.data ?? []) as LeadCategory[])
      }
      if (profRes.error) {
        console.error('[NewProjectModal] Load assignees failed:', {
          code: profRes.error.code,
          message: profRes.error.message,
          hint: profRes.error.hint,
          details: profRes.error.details,
        })
      } else {
        const rows = (profRes.data ?? []) as {
          id: string
          display_name: string | null
        }[]
        setAssignees(
          rows.map((r) => ({ id: r.id, display_name: r.display_name }))
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const customerOptions = useMemo(
    () => localCustomers.map(customerToOption),
    [localCustomers]
  )

  const selectedCustomer = useMemo(
    () => localCustomers.find((c) => c.id === selectedCustomerId) ?? null,
    [localCustomers, selectedCustomerId]
  )

  // Structured address pulled from the selected customer's companies row.
  // Per the simplified decision: column-to-column copy, no string parsing.
  // Null columns translate to blank fields.
  const customerStructuredAddress: AddressValues = useMemo(
    () => ({
      street: selectedCustomer?.address ?? '',
      city: selectedCustomer?.city ?? '',
      state: selectedCustomer?.state ?? '',
      zip: selectedCustomer?.zip ?? '',
    }),
    [selectedCustomer]
  )

  // While the checkbox is ON, keep project address synced to the customer.
  // Covers the case where the user toggles ON, then changes customer — the
  // project fields should track the new customer's address.
  useEffect(() => {
    if (sameAsCustomer) {
      setProjectAddress(customerStructuredAddress)
    }
  }, [sameAsCustomer, customerStructuredAddress])

  const isOverridden =
    autoProjectNumber !== null && projectNumber.trim() !== autoProjectNumber

  function cancelEditNumber() {
    if (autoProjectNumber !== null) setProjectNumber(autoProjectNumber)
    setEditingNumber(false)
  }

  function handleSameAsCustomerChange(checked: boolean) {
    if (checked) {
      setProjectAddress(customerStructuredAddress)
    }
    // On uncheck, leave fields where they are — the user can edit freely.
    setSameAsCustomer(checked)
  }

  function handleNewCustomerCreated(customer: Customer) {
    // Add to localCustomers (idempotent), then select it. The shared modal's
    // prefillCustomerId effect picks up the new id and re-runs
    // handleSelectCustomer, which fills in email/phone/single-line address.
    setLocalCustomers((prev) => {
      if (prev.some((c) => c.id === customer.id)) return prev
      return [customer, ...prev]
    })
    setSelectedCustomerId(customer.id)
    setShowNewCustomer(false)
    onCustomerCreated?.(customer)
  }

  async function handleSubmit(
    data: CreationFormData
  ): Promise<string | null> {
    if (!data.customerId) return 'Please select a customer.'
    if (!data.projectName.trim()) return 'Please enter a project name.'
    const typedNumber = projectNumber.trim()
    if (!typedNumber) return 'Project number cannot be empty.'

    const supabase = createClient()

    // For overridden numbers: use exactly what the user typed; do NOT touch
    // the user's sequence. If it conflicts, surface the error — the user
    // explicitly picked it, so silent retry would override their choice.
    //
    // For auto-assigned numbers: atomically reserve the next number. On the
    // rare race (concurrent insert grabbed the same number), retry up to
    // MAX_PROJECT_NUMBER_RETRIES times.
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let assignedNumber: string
      try {
        assignedNumber = isOverridden
          ? typedNumber
          : await assignNextProjectNumber(supabase, userId)
      } catch (err) {
        console.error('[NewProjectModal] Assign project number failed:', err)
        return `Failed to reserve a project number: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      }

      const { data: newProject, error: insertErr } = await supabase
        .from('estimating_projects')
        .insert({
          company_id: data.customerId,
          name: data.projectName.trim(),
          description: data.projectDetails,
          status: 'active',
          source: 'manual',
          source_ref_id: null,
          project_number: assignedNumber,
          project_address_street: projectAddress.street.trim() || null,
          project_address_city: projectAddress.city.trim() || null,
          project_address_state: projectAddress.state.trim() || null,
          project_address_zip: projectAddress.zip.trim() || null,
          email: data.customerEmail,
          phone: data.customerPhone,
          lead_source: data.leadSource,
          lead_category_id: data.leadCategoryId,
          created_by: userId,
        })
        .select('*')
        .single()

      if (!insertErr && newProject) {
        onCreated(newProject as EstimatingProject)
        return null
      }

      const isDup =
        insertErr?.code === '23505' ||
        (insertErr?.message ?? '').toLowerCase().includes('duplicate')

      if (isDup && isOverridden) {
        return `Project number ${assignedNumber} is already in use. Please pick a different number.`
      }
      if (isDup && !isOverridden) {
        attempt += 1
        if (attempt >= MAX_PROJECT_NUMBER_RETRIES) {
          return `Failed to create project: project number kept colliding after ${MAX_PROJECT_NUMBER_RETRIES} attempts. Try again in a moment.`
        }
        // Refresh the displayed auto number so the UI doesn't keep showing
        // the burned one in case the modal stays open.
        try {
          const next = await peekNextProjectNumber(supabase, userId)
          setAutoProjectNumber(next)
          if (!editingNumber) setProjectNumber(next)
        } catch {
          // Non-fatal: the next assignNextProjectNumber call will still work.
        }
        continue
      }

      console.error('[NewProjectModal] Insert estimating_projects failed:', {
        code: insertErr?.code,
        message: insertErr?.message,
        hint: insertErr?.hint,
        details: insertErr?.details,
      })
      return `Failed to create project: ${
        insertErr?.message ?? 'unknown error'
      }`
    }
  }

  return (
    <>
      <CreationFormModal
        title="New project"
        saveLabel="Create project"
        savingLabel="Creating…"
        projectDetailsPlaceholder="Optional project notes…"
        mode="standalone"
        customers={customerOptions}
        userId={userId}
        // estimating_projects has no assigned_to column, so the assignee
        // dropdown is hidden below. isAdmin is still passed for parity
        // with the other wrappers; it's a no-op while the field is hidden.
        isAdmin={true}
        assignees={assignees}
        categories={categories}
        hideProjectAddressField={true}
        // estimating_projects has no date or assigned_to columns — hide
        // those fields rather than showing dead UI.
        hideDateField={true}
        hideAssignedToField={true}
        // Customer Address is purely informational on a Project (it lives
        // on the FK'd companies row; the project never owns its own copy).
        // Show it for context, but don't let the user edit a value that
        // would silently be dropped on submit.
        customerAddressReadOnly={true}
        // Match the pre-refactor behavior: only users with CRM-create
        // permission see the "Create new customer" button.
        hideAddNewCustomerButton={!canCreateCustomer}
        onAddNewCustomerClick={
          canCreateCustomer ? () => setShowNewCustomer(true) : undefined
        }
        prefillCustomerId={selectedCustomerId}
        onCustomerChange={setSelectedCustomerId}
        slotAfterCustomer={
          <ProjectNumberField
            loading={loadingNumber}
            autoNumber={autoProjectNumber}
            value={projectNumber}
            onChange={setProjectNumber}
            editing={editingNumber}
            onEditToggle={setEditingNumber}
            onCancel={cancelEditNumber}
            isOverridden={isOverridden}
          />
        }
        extraSections={
          <ProjectAddressFields
            hideCustomerAddress
            customerAddress={customerStructuredAddress}
            projectAddress={projectAddress}
            sameAsCustomer={sameAsCustomer}
            onProjectAddressChange={setProjectAddress}
            onSameAsCustomerChange={handleSameAsCustomerChange}
          />
        }
        onSubmit={handleSubmit}
        onClose={onClose}
      />
      {showNewCustomer && (
        <NewCustomerSubModal
          userId={userId}
          onClose={() => setShowNewCustomer(false)}
          onCreated={handleNewCustomerCreated}
        />
      )}
    </>
  )
}

interface ProjectNumberFieldProps {
  loading: boolean
  autoNumber: string | null
  value: string
  onChange: (next: string) => void
  editing: boolean
  onEditToggle: (next: boolean) => void
  onCancel: () => void
  isOverridden: boolean
}

function ProjectNumberField({
  loading,
  autoNumber,
  value,
  onChange,
  editing,
  onEditToggle,
  onCancel,
  isOverridden,
}: ProjectNumberFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Project number
      </label>
      {editing ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              placeholder="e.g. 1006-P"
            />
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </div>
          {isOverridden && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This is a one-time override. Your next project will return
                to the regular sequence. To change your sequence
                permanently, ask your admin to update it in Sales
                Management.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                <span>Loading…</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 truncate">
                  #{autoNumber}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Auto-assigned
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => onEditToggle(true)}
            disabled={loading}
            title="Edit project number"
            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition disabled:opacity-50"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
