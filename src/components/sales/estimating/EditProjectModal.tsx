'use client'

import { useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/proposals/types'
import type { EstimatingProject } from './types'
import ProjectAddressFields, {
  EMPTY_ADDRESS,
  addressEquals,
  isAddressBlank,
  type AddressValues,
} from './ProjectAddressFields'

interface EditProjectModalProps {
  project: EstimatingProject
  customer: Customer
  onClose: () => void
  onUpdated: (patch: Partial<EstimatingProject>) => void
}

export default function EditProjectModal({
  project,
  customer,
  onClose,
  onUpdated,
}: EditProjectModalProps) {
  const customerAddress: AddressValues = useMemo(
    () => ({
      street: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      zip: customer.zip ?? '',
    }),
    [customer]
  )

  const initialProjectAddress: AddressValues = useMemo(
    () => ({
      street: project.project_address_street ?? '',
      city: project.project_address_city ?? '',
      state: project.project_address_state ?? '',
      zip: project.project_address_zip ?? '',
    }),
    [project]
  )

  const [projectNumber, setProjectNumber] = useState(project.project_number ?? '')
  const [name, setName] = useState(project.name ?? '')
  const [description, setDescription] = useState(project.description ?? '')
  const [projectAddress, setProjectAddress] = useState<AddressValues>(initialProjectAddress)
  // Pre-check the box if the existing project address exactly matches the
  // customer address (and isn't just both-blank).
  const [sameAsCustomer, setSameAsCustomer] = useState(
    !isAddressBlank(initialProjectAddress) && addressEquals(initialProjectAddress, customerAddress)
  )
  const [stashedProjectAddress, setStashedProjectAddress] = useState<AddressValues>(
    sameAsCustomer ? EMPTY_ADDRESS : initialProjectAddress
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep project fields synced to customer fields while the box is on, so
  // any later change to the customer (rare here, since this modal doesn't
  // change customer) still flows through correctly.
  useEffect(() => {
    if (sameAsCustomer) setProjectAddress(customerAddress)
  }, [sameAsCustomer, customerAddress])

  function handleSameAsCustomerChange(checked: boolean) {
    if (checked) {
      setStashedProjectAddress(projectAddress)
      setProjectAddress(customerAddress)
    } else {
      setProjectAddress(stashedProjectAddress)
    }
    setSameAsCustomer(checked)
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Project name cannot be empty.')
      return
    }
    if (!projectNumber.trim()) {
      setError('Project number cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    const patch = {
      project_number: projectNumber.trim(),
      name: name.trim(),
      description: description.trim() || null,
      project_address_street: projectAddress.street.trim() || null,
      project_address_city: projectAddress.city.trim() || null,
      project_address_state: projectAddress.state.trim() || null,
      project_address_zip: projectAddress.zip.trim() || null,
    }
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('estimating_projects')
      .update(patch)
      .eq('id', project.id)
    if (updateErr) {
      setSaving(false)
      const msg = updateErr.message ?? 'unknown error'
      if (updateErr.code === '23505' || msg.toLowerCase().includes('duplicate')) {
        setError(
          `Project number ${patch.project_number} is already in use. Please pick a different number.`
        )
      } else {
        setError(`Failed to save project: ${msg}`)
      }
      return
    }
    setSaving(false)
    onUpdated(patch)
    onClose()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">Edit project</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Project number
              </label>
              <input
                type="text"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Project name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              />
            </div>

            <ProjectAddressFields
              customerAddress={customerAddress}
              projectAddress={projectAddress}
              sameAsCustomer={sameAsCustomer}
              onProjectAddressChange={setProjectAddress}
              onSameAsCustomerChange={handleSameAsCustomerChange}
            />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional project notes…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
