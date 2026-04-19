'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  MailIcon,
  SparklesIcon,
  SendIcon,
  SkipForwardIcon,
  UserIcon,
  BuildingIcon,
  PhoneIcon,
  StickyNoteIcon,
  InboxIcon,
  UploadIcon,
} from 'lucide-react'

export default function EmailerClient() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const contactsLoaded = false

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/sales" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <MailIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            Emailer
          </h1>
        </div>
      </div>

      {/* Main content */}
      {!contactsLoaded ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-5">
              <InboxIcon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Load a contact queue to start emailing
            </h2>
            <p className="text-sm text-gray-400 mt-2">
              Select contacts from your CRM to begin an email outreach session.
            </p>
            <button
              disabled
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg disabled:opacity-40 transition-colors"
            >
              <UploadIcon className="w-4 h-4" />
              Load Contacts
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-4">
            {/* Progress bar */}
            <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] px-5 py-3 flex items-center gap-4">
              <span className="text-xs text-gray-500 tabular-nums">
                0 of 0 contacts
              </span>
              <div className="flex-1 h-[3px] bg-gray-100 dark:bg-[#333] rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-500 ease-out"
                  style={{ width: '0%' }}
                />
              </div>
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-full disabled:opacity-40 transition-colors"
              >
                <UploadIcon className="w-3 h-3" />
                Load Contacts
              </button>
            </div>

            {/* Two-panel layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              {/* Left panel — Contact context (below on mobile) */}
              <div className="space-y-4 order-2 lg:order-1">
                {/* Contact card */}
                <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">
                    Contact
                  </p>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#333] flex items-center justify-center mb-3">
                      <UserIcon className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-400 italic">
                      No contact loaded
                    </p>
                  </div>
                  <div className="mt-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <BuildingIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="italic">No company</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <MailIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="italic">No email</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <PhoneIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="italic">No phone</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <StickyNoteIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="italic">No notes</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right panel — Compose Email (on top on mobile) */}
              <div className="space-y-4 order-1 lg:order-2">
                <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">
                    Compose Email
                  </p>

                  {/* Subject */}
                  <div className="mb-3">
                    <label className="block text-[11px] text-gray-400 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject line..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>

                  {/* Body */}
                  <div className="mb-4">
                    <label className="block text-[11px] text-gray-400 mb-1">
                      Body
                    </label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={10}
                      placeholder="Compose your email..."
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                    />
                  </div>

                  {/* Helper text */}
                  <p className="text-xs text-gray-400 mb-3">
                    Select a prompt and generate an AI draft, or compose manually
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      disabled
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      <SparklesIcon className="w-3.5 h-3.5" />
                      AI Compose
                    </button>
                    <button
                      disabled
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      <SendIcon className="w-3.5 h-3.5" />
                      Send
                    </button>
                    <button
                      disabled
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#333] rounded-lg disabled:opacity-40 transition-colors"
                    >
                      <SkipForwardIcon className="w-3.5 h-3.5" />
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
