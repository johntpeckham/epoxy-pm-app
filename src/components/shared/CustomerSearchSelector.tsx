'use client'

import { useState, useEffect, useRef } from 'react'
import { SearchIcon, ChevronDownIcon, CheckIcon } from 'lucide-react'
import type { Customer } from '../proposals/types'

interface CustomerSearchSelectorProps {
  customers: Customer[]
  selectedCustomerId: string | null
  onSelect: (customer: Customer) => void
  label?: string
}

export default function CustomerSearchSelector({
  customers,
  selectedCustomerId,
  onSelect,
  label = 'Customer',
}: CustomerSearchSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = customers.find((c) => c.id === selectedCustomerId) ?? null

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? (
            <>
              {selected.name}
              {selected.company && <span className="text-gray-400 ml-1">({selected.company})</span>}
            </>
          ) : (
            'Select a customer...'
          )}
        </span>
        <ChevronDownIcon className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-2">No customers found</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c)
                    setOpen(false)
                    setSearch('')
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="text-gray-900">{c.name}</span>
                    {c.company && <span className="text-gray-400 text-xs ml-1.5">{c.company}</span>}
                  </div>
                  {c.id === selectedCustomerId && <CheckIcon className="w-4 h-4 text-amber-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
