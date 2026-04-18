'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  PlusIcon,
  SearchIcon,
  PhoneIcon,
  MailIcon,
  ContactIcon,
} from 'lucide-react'
import type { Customer } from '@/components/estimates/types'
import AddContactModal from './AddContactModal'

interface Props {
  userId: string
  initialContacts: Customer[]
}

const PAGE_SIZE = 50

export default function ContactsPageClient({ userId, initialContacts }: Props) {
  const [contacts, setContacts] = useState<Customer[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
      )
    })
  }, [contacts, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageStart = clampedPage * PAGE_SIZE
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  function handleAdded(created: Customer) {
    setContacts((prev) =>
      [...prev, created].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    )
    setShowAddModal(false)
    setPage(0)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white dark:bg-[#242424] px-4 sm:px-6 pt-4 pb-0">
        {/* Back link */}
        <Link
          href="/office"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Office
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2">
          <ContactIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Add contact
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">

        {/* Search */}
        <div className="relative mb-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search by name, email, or phone"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 bg-white text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ContactIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">
                {search
                  ? 'No contacts match your search'
                  : 'No contacts yet. Add your first contact to get started.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pageItems.map((c) => {
                const fullAddress = [c.address, c.city, c.state, c.zip]
                  .filter(Boolean)
                  .join(', ')
                return (
                  <li key={c.id} className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    {c.company && (
                      <p className="text-xs text-gray-500 mt-0.5">{c.company}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-800"
                        >
                          <PhoneIcon className="w-4 h-4" />
                          {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-800 break-all"
                        >
                          <MailIcon className="w-4 h-4" />
                          {c.email}
                        </a>
                      )}
                    </div>
                    {fullAddress && (
                      <p className="text-xs text-gray-400 mt-1">{fullAddress}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <p>
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddContactModal
          userId={userId}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  )
}
