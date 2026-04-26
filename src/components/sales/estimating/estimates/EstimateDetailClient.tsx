'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'
import type { Estimate } from '../types'
import SummaryTab from './tabs/SummaryTab'
import AreasTab from './tabs/AreasTab'
import MaterialsTab from './tabs/MaterialsTab'
import LaborTab from './tabs/LaborTab'
import PrepToolsTab from './tabs/PrepToolsTab'
import SundriesTab from './tabs/SundriesTab'
import TravelTab from './tabs/TravelTab'
import ConfirmedMeasurementsCard from './ConfirmedMeasurementsCard'
import MeasurementReferences from './tabs/MeasurementReferences'
import AddModuleButton from './AddModuleButton'
import CpiCalculatorCard from './CpiCalculatorCard'

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'areas', label: 'Areas & measurements' },
  { key: 'materials', label: 'Materials' },
  { key: 'labor', label: 'Labor' },
  { key: 'prep', label: 'Prep & tools' },
  { key: 'sundries', label: 'Sundries' },
  { key: 'travel', label: 'Travel' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface EstimateDetailClientProps {
  estimate: Estimate
  projectName: string
  projectId: string
  customerId: string
  customerName: string
}

export default function EstimateDetailClient({
  estimate,
  projectName,
  projectId,
  customerId,
  customerName,
}: EstimateDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [sidebarModules, setSidebarModules] = useState<string[]>(
    () => (estimate as unknown as Record<string, unknown>).sidebar_modules as string[] ?? []
  )

  function handleAddModule(moduleId: string) {
    setSidebarModules((prev) => [...prev, moduleId])
  }

  function handleRemoveModule(moduleId: string) {
    setSidebarModules((prev) => prev.filter((m) => m !== moduleId))
  }

  function handleBack() {
    router.push(
      `/sales/estimating?customer=${customerId}&project=${projectId}`
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex-none bg-white dark:bg-[#242424] border-b border-gray-200 dark:border-[#2a2a2a] px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleBack} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">
              {customerName} &middot; {projectName}
            </p>
            <h1 className="text-base font-bold text-gray-900 dark:text-white mt-0.5 truncate">
              {estimate.name}
            </h1>
            {estimate.template_id && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                From template
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-none bg-white border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max px-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

      {/* Tab content — two-column layout */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Mobile-only sidebar */}
          <div className="lg:hidden space-y-3">
            <ConfirmedMeasurementsCard />
            {activeTab === 'areas' && <MeasurementReferences />}
            {sidebarModules.includes('cpi_calculator') && (
              <CpiCalculatorCard onRemove={() => handleRemoveModule('cpi_calculator')} />
            )}
            <AddModuleButton activeModules={sidebarModules} onAddModule={handleAddModule} />
          </div>

          {/* Left column: tab content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'summary' && <SummaryTab />}
            {activeTab === 'areas' && <AreasTab />}
            {activeTab === 'materials' && <MaterialsTab />}
            {activeTab === 'labor' && <LaborTab />}
            {activeTab === 'prep' && <PrepToolsTab />}
            {activeTab === 'sundries' && <SundriesTab />}
            {activeTab === 'travel' && <TravelTab />}
          </div>

          {/* Right column: sticky sidebar (desktop only) */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-4 space-y-3">
              <ConfirmedMeasurementsCard />
              {activeTab === 'areas' && <MeasurementReferences />}
              {sidebarModules.includes('cpi_calculator') && (
                <CpiCalculatorCard onRemove={() => handleRemoveModule('cpi_calculator')} />
              )}
              <AddModuleButton activeModules={sidebarModules} onAddModule={handleAddModule} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
