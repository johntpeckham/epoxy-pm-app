'use client'

import { useState } from 'react'
import { PlusIcon, SearchIcon, UserIcon } from 'lucide-react'
import type { Customer } from '../estimates/types'

interface CustomerListPanelProps {
  customers: Customer[]
  selectedCustomerId: string | null
  onSelectCustomer: (id: string) => void
  onNewProject: () => void
}

export default function CustomerListPanel({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onNewProject,
}: CustomerListPanelProps) {
  const [search, setSearch] = useState('')

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Customers</h2>
          <button
            onClick={onNewProject}
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

      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <UserIcon className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">
                {customers.length === 0
                  ? 'No customers yet. Add one in Estimates to get started.'
                  : 'No matching customers.'}
              </p>
            </div>
          ) : (
            filtered.map((customer) => {
              const subtitle =
                customer.company || customer.email || customer.phone || customer.address || null
              return (
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
                  {subtitle && (
                    <p className="text-xs text-gray-500 truncate">{subtitle}</p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
