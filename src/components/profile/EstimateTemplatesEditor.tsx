'use client'

import { useState } from 'react'
import { XIcon, PlusIcon, ChevronRightIcon, ChevronLeftIcon, TableIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface Template {
  id: string
  name: string
  description: string
  areaTypes: number
}

const PLACEHOLDER_TEMPLATES: Template[] = [
  { id: '1', name: 'Floor Estimate', description: 'Standard floor coating estimate with floor and cove areas', areaTypes: 2 },
  { id: '2', name: 'Roof Estimate', description: 'Roof coating project estimate template', areaTypes: 1 },
  { id: '3', name: 'Blank', description: 'Empty template — start from scratch', areaTypes: 0 },
]

const TEMPLATE_TABS = [
  { key: 'areas', label: 'Areas' },
  { key: 'materials', label: 'Materials' },
  { key: 'labor', label: 'Labor' },
  { key: 'prep', label: 'Prep & Tools' },
  { key: 'sundries', label: 'Sundries' },
  { key: 'travel', label: 'Travel' },
] as const

type TemplateTabKey = (typeof TEMPLATE_TABS)[number]['key']

interface EstimateTemplatesEditorProps {
  onClose: () => void
}

export default function EstimateTemplatesEditor({ onClose }: EstimateTemplatesEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [activeTab, setActiveTab] = useState<TemplateTabKey>('areas')
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')

  function handleSelectTemplate(t: Template) {
    setSelectedTemplate(t)
    setTemplateName(t.name)
    setTemplateDesc(t.description)
    setActiveTab('areas')
  }

  function handleBack() {
    setSelectedTemplate(null)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              {selectedTemplate && (
                <button
                  onClick={handleBack}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition mr-1"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
              )}
              <TableIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedTemplate ? selectedTemplate.name : 'Estimate Templates'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedTemplate ? (
              <TemplateEditor
                templateName={templateName}
                templateDesc={templateDesc}
                onNameChange={setTemplateName}
                onDescChange={setTemplateDesc}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            ) : (
              <TemplateList
                templates={PLACEHOLDER_TEMPLATES}
                onSelect={handleSelectTemplate}
              />
            )}
          </div>

          <div
            className="flex-none flex justify-end gap-2 p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            {selectedTemplate && (
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
              >
                Save template
              </button>
            )}
            <button
              type="button"
              onClick={selectedTemplate ? handleBack : onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              {selectedTemplate ? 'Back' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function TemplateList({
  templates,
  onSelect,
}: {
  templates: Template[]
  onSelect: (t: Template) => void
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Manage estimate templates that can be used when creating new estimates.
        </p>
      </div>

      <button className="w-full inline-flex items-center justify-center gap-1 px-3 py-2.5 text-sm font-medium text-amber-600 border-2 border-dashed border-amber-300 rounded-lg hover:bg-amber-50 transition">
        <PlusIcon className="w-4 h-4" />
        New template
      </button>

      <div className="space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {t.areaTypes} default area type{t.areaTypes !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-gray-300 group-hover:text-amber-400 flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function TemplateEditor({
  templateName,
  templateDesc,
  onNameChange,
  onDescChange,
  activeTab,
  onTabChange,
}: {
  templateName: string
  templateDesc: string
  onNameChange: (v: string) => void
  onDescChange: (v: string) => void
  activeTab: TemplateTabKey
  onTabChange: (t: TemplateTabKey) => void
}) {
  return (
    <div>
      <div className="p-4 space-y-3 border-b border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template name
          </label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <input
            type="text"
            value={templateDesc}
            onChange={(e) => onDescChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max px-4">
          {TEMPLATE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — empty state */}
      <div className="p-6 text-center">
        <p className="text-sm text-gray-400 mb-3">
          No default {activeTab === 'prep' ? 'prep & tools' : activeTab} items yet.
        </p>
        <button className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition">
          <PlusIcon className="w-4 h-4" />
          Add default item
        </button>
      </div>
    </div>
  )
}
