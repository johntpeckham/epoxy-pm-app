'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  FileTextIcon,
  SlidersHorizontalIcon,
  LayersIcon,
  ClipboardCheckIcon,
  BookOpenIcon,
} from 'lucide-react'
import FormManagementClient from '@/components/form-management/FormManagementClient'
import MaterialSystemsClient from '@/components/material-systems/MaterialSystemsClient'
import JobReportChecklistManagement from './JobReportChecklistManagement'
import FieldGuideManagement from './FieldGuideManagement'

type Tab = 'form-editor' | 'material-system' | 'checklist' | 'field-guides'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'form-editor', label: 'Report Form', icon: <SlidersHorizontalIcon className="w-4 h-4" /> },
  { key: 'material-system', label: 'Material System', icon: <LayersIcon className="w-4 h-4" /> },
  { key: 'checklist', label: 'Checklist Management', icon: <ClipboardCheckIcon className="w-4 h-4" /> },
  { key: 'field-guides', label: 'Field Guides', icon: <BookOpenIcon className="w-4 h-4" /> },
]

interface JobReportManagementClientProps {
  userId: string
}

export default function JobReportManagementClient({ userId }: JobReportManagementClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('form-editor')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Settings
          </Link>
          <div className="flex items-center gap-3">
            <FileTextIcon className="w-5 h-5 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Job Report Management</h1>
              <p className="text-sm text-gray-500">Manage the report form, material systems, and checklists for job reports.</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'form-editor' && (
          <FormManagementClient filterFormKey="project_report" embedded />
        )}
        {activeTab === 'material-system' && (
          <MaterialSystemsClient embedded />
        )}
        {activeTab === 'checklist' && (
          <JobReportChecklistManagement userId={userId} />
        )}
        {activeTab === 'field-guides' && (
          <FieldGuideManagement userId={userId} />
        )}
      </div>
    </div>
  )
}
