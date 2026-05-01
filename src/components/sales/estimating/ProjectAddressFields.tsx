'use client'

/**
 * Shared address-fields layout for the New Project and Edit Project modals.
 *
 * Two stacked sections:
 *   - Customer Address (read-only, auto-populated from the linked customer)
 *   - Project Address  (editable, with a "Same as customer address" checkbox
 *                       that auto-fills + locks the four fields when checked)
 *
 * The parent owns the project address state; this component just renders +
 * coordinates the checkbox toggle. When the box is checked we copy the
 * customer values into the project fields and disable editing; on uncheck
 * we restore whatever the user previously typed (the parent stashes that
 * via `restoreOnUncheck`).
 */

export interface AddressValues {
  street: string
  city: string
  state: string
  zip: string
}

export const EMPTY_ADDRESS: AddressValues = { street: '', city: '', state: '', zip: '' }

export function addressEquals(a: AddressValues, b: AddressValues): boolean {
  return (
    (a.street || '').trim() === (b.street || '').trim() &&
    (a.city || '').trim() === (b.city || '').trim() &&
    (a.state || '').trim() === (b.state || '').trim() &&
    (a.zip || '').trim() === (b.zip || '').trim()
  )
}

export function isAddressBlank(a: AddressValues): boolean {
  return !a.street?.trim() && !a.city?.trim() && !a.state?.trim() && !a.zip?.trim()
}

/** Composes the structured project address into a single display line.
 *  Empty fields are dropped gracefully — no orphan commas. */
export function formatAddressLine(a: AddressValues): string {
  const parts: string[] = []
  if (a.street?.trim()) parts.push(a.street.trim())
  const cityState = [a.city?.trim(), a.state?.trim()].filter(Boolean).join(', ')
  if (cityState) parts.push(cityState)
  if (a.zip?.trim()) {
    if (parts.length > 0) parts[parts.length - 1] = `${parts[parts.length - 1]} ${a.zip.trim()}`.trim()
    else parts.push(a.zip.trim())
  }
  return parts.join(', ')
}

interface ProjectAddressFieldsProps {
  customerAddress: AddressValues
  projectAddress: AddressValues
  sameAsCustomer: boolean
  onProjectAddressChange: (next: AddressValues) => void
  onSameAsCustomerChange: (checked: boolean) => void
}

export default function ProjectAddressFields({
  customerAddress,
  projectAddress,
  sameAsCustomer,
  onProjectAddressChange,
  onSameAsCustomerChange,
}: ProjectAddressFieldsProps) {
  const lockedInput =
    'w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-600 cursor-not-allowed'
  const editableInput =
    'w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'

  const projectInputClass = sameAsCustomer ? lockedInput : editableInput

  function patchProject(patch: Partial<AddressValues>) {
    onProjectAddressChange({ ...projectAddress, ...patch })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Customer Address
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input
            readOnly
            value={customerAddress.street}
            placeholder="Street"
            className={`${lockedInput} sm:col-span-6`}
          />
          <input
            readOnly
            value={customerAddress.city}
            placeholder="City"
            className={`${lockedInput} sm:col-span-3`}
          />
          <input
            readOnly
            value={customerAddress.state}
            placeholder="State"
            className={`${lockedInput} sm:col-span-1`}
          />
          <input
            readOnly
            value={customerAddress.zip}
            placeholder="Zip"
            className={`${lockedInput} sm:col-span-2`}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-medium text-gray-500">
            Project Address
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={sameAsCustomer}
              onChange={(e) => onSameAsCustomerChange(e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-500"
            />
            Same as customer address
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input
            readOnly={sameAsCustomer}
            value={projectAddress.street}
            onChange={(e) => patchProject({ street: e.target.value })}
            placeholder="Street"
            className={`${projectInputClass} sm:col-span-6`}
          />
          <input
            readOnly={sameAsCustomer}
            value={projectAddress.city}
            onChange={(e) => patchProject({ city: e.target.value })}
            placeholder="City"
            className={`${projectInputClass} sm:col-span-3`}
          />
          <input
            readOnly={sameAsCustomer}
            value={projectAddress.state}
            onChange={(e) => patchProject({ state: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="State"
            maxLength={2}
            className={`${projectInputClass} sm:col-span-1`}
          />
          <input
            readOnly={sameAsCustomer}
            value={projectAddress.zip}
            onChange={(e) => patchProject({ zip: e.target.value })}
            placeholder="Zip"
            className={`${projectInputClass} sm:col-span-2`}
          />
        </div>
      </div>
    </div>
  )
}
