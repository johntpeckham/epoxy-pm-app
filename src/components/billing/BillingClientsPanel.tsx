'use client'

import { useState, useEffect, useRef } from 'react'
import { PlusIcon, SearchIcon, Settings2Icon, UserIcon, LayoutDashboardIcon, FileTextIcon, ClipboardListIcon, DollarSignIcon } from 'lucide-react'
import type { Customer } from './types'
import CustomerManagementModal from '@/components/ui/CustomerManagementModal'

interface BillingClientsPanelProps {
  customers: Customer[]
  selectedView: string
  userId: string
  onSelectView: (view: 'dashboard' | string) => void
  onCustomerAdded: () => void
  onNewInvoice?: () => void
  onNewChangeOrder?: () => void
}

export default function BillingClientsPanel({
  customers,
  selectedView,
  userId,
  onSelectView,
  onCustomerAdded,
  onNewInvoice,
  onNewChangeOrder,
}: BillingClientsPanelProps) {
  const [search, setSearch] = useState('')
  const [showCustomerManagement, setShowCustomerManagement] = useState(false)
  const [showNewDropdown, setShowNewDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNewDropdown(false)
      }
    }
    if (showNewDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showNewDropdown])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  function handleNewInvoice() {
    setShowNewDropdown(false)
    onNewInvoice?.()
  }

  function handleNewChangeOrder() {
    setShowNewDropdown(false)
    onNewChangeOrder?.()
  }

  return (
    <>
      <div className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSignIcon className="w-5 h-5 text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
              <button
                onClick={() => setShowCustomerManagement(true)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Manage Customers"
              >
                <Settings2Icon className="w-4 h-4" />
              </button>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowNewDropdown(!showNewDropdown)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                New
              </button>
              {showNewDropdown && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  <button
                    onClick={handleNewInvoice}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors flex items-center gap-2"
                  >
                    <FileTextIcon className="w-4 h-4" />
                    New Invoice
                  </button>
                  <button
                    onClick={handleNewChangeOrder}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors flex items-center gap-2"
                  >
                    <ClipboardListIcon className="w-4 h-4" />
                    New Change Order
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
            />
          </div>
        </div>

        {/* Dashboard pinned entry + Customer list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* Dashboard - pinned at top */}
          <button
            onClick={() => onSelectView('dashboard')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition border mb-1 ${
              selectedView === 'dashboard'
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-600'
            }`}
          >
            <LayoutDashboardIcon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-semibold">Dashboard</span>
          </button>

          {/* Customer list */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <UserIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {customers.length === 0
                  ? 'No customers yet. Add one to get started.'
                  : 'No matching customers.'}
              </p>
            </div>
          ) : (
            filtered.map((customer) => (
              <button
                key={customer.id}
                onClick={() => onSelectView(customer.id)}
                className={`w-full text-left relative rounded-lg border p-3 transition ${
                  selectedView === customer.id
                    ? 'border-gray-300 bg-gray-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {selectedView === customer.id && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-500" />
                )}
                <p className="text-sm font-semibold text-gray-900 truncate">{customer.name}</p>
              </button>
            ))
          )}
        </div>
      </div>

      <CustomerManagementModal
        open={showCustomerManagement}
        userId={userId}
        onClose={() => setShowCustomerManagement(false)}
        onCustomersChanged={onCustomerAdded}
      />
    </>
  )
}
