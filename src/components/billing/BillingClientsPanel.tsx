'use client'

import { useState, useEffect, useRef } from 'react'
import { PlusIcon, SearchIcon, Settings2Icon, UserIcon, LayoutDashboardIcon, FileTextIcon, ClipboardListIcon } from 'lucide-react'
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
  const [noCustomerHint, setNoCustomerHint] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const hasCustomerSelected = selectedView !== 'dashboard'

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

  useEffect(() => {
    if (noCustomerHint) {
      const t = setTimeout(() => setNoCustomerHint(false), 2500)
      return () => clearTimeout(t)
    }
  }, [noCustomerHint])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  function handleNewInvoice() {
    setShowNewDropdown(false)
    if (!hasCustomerSelected) {
      setNoCustomerHint(true)
      return
    }
    onNewInvoice?.()
  }

  function handleNewChangeOrder() {
    setShowNewDropdown(false)
    if (!hasCustomerSelected) {
      setNoCustomerHint(true)
      return
    }
    onNewChangeOrder?.()
  }

  return (
    <>
      <div className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900">Billing</h2>
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
                <PlusIcon className="w-3.5 h-3.5" />
                New
              </button>
              {showNewDropdown && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  <button
                    onClick={handleNewInvoice}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors flex items-center gap-2"
                  >
                    <FileTextIcon className="w-3.5 h-3.5" />
                    New Invoice
                  </button>
                  <button
                    onClick={handleNewChangeOrder}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors flex items-center gap-2"
                  >
                    <ClipboardListIcon className="w-3.5 h-3.5" />
                    New Change Order
                  </button>
                </div>
              )}
            </div>
          </div>
          {noCustomerHint && (
            <p className="text-xs text-amber-600 mb-2">Please select a customer first</p>
          )}
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

        {/* Dashboard pinned entry + Customer list */}
        <div className="flex-1 overflow-y-auto">
          <div className="py-1">
            {/* Dashboard - pinned at top */}
            <button
              onClick={() => onSelectView('dashboard')}
              className={`w-full text-left px-4 py-3 transition-colors border-l-2 flex items-center gap-3 ${
                selectedView === 'dashboard'
                  ? 'border-l-amber-500 bg-amber-50'
                  : 'border-l-transparent hover:bg-gray-50'
              }`}
            >
              <LayoutDashboardIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <p className="text-sm font-medium text-gray-900">Dashboard</p>
            </button>

            {/* Divider */}
            <div className="mx-4 border-t border-gray-100" />

            {/* Customer list */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <UserIcon className="w-10 h-10 text-gray-300 mb-2" />
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
                  className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                    selectedView === customer.id
                      ? 'border-l-amber-500 bg-amber-50'
                      : 'border-l-transparent hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
                  {customer.company && (
                    <p className="text-xs text-gray-500 truncate">{customer.company}</p>
                  )}
                </button>
              ))
            )}
          </div>
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
