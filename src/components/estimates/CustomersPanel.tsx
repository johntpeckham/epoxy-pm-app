'use client'

import { useState } from 'react'
import { PlusIcon, SearchIcon, SettingsIcon, UserIcon } from 'lucide-react'
import type { Customer, Estimate } from './types'
import NewCustomerModal from './NewCustomerModal'

interface CustomersPanelProps {
  customers: Customer[]
  selectedCustomerId: string | null
  estimates: Estimate[]
  userId: string
  onSelectCustomer: (id: string) => void
  onCustomerAdded: () => void
  onOpenSettings: () => void
}

export default function CustomersPanel({
  customers,
  selectedCustomerId,
  userId,
  onSelectCustomer,
  onCustomerAdded,
  onOpenSettings,
}: CustomersPanelProps) {
  const [search, setSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <>
      <div className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">Customers</h2>
              <button
                onClick={onOpenSettings}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Estimate Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowNewCustomer(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New
            </button>
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <UserIcon className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">
                {customers.length === 0
                  ? 'No customers yet. Add one to get started.'
                  : 'No matching customers.'}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => onSelectCustomer(customer.id)}
                  className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                    selectedCustomerId === customer.id
                      ? 'border-l-amber-500 bg-amber-50'
                      : 'border-l-transparent hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
                  {customer.company && (
                    <p className="text-xs text-gray-500 truncate">{customer.company}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showNewCustomer && (
        <NewCustomerModal
          userId={userId}
          onClose={() => setShowNewCustomer(false)}
          onSaved={() => {
            setShowNewCustomer(false)
            onCustomerAdded()
          }}
        />
      )}
    </>
  )
}
