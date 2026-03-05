'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MonitorIcon } from 'lucide-react'
import type { Customer, Estimate, EstimateSettings } from './types'
import CustomersPanel from './CustomersPanel'
import EstimatesWorkspace from './EstimatesWorkspace'
import SetupPrompt from './SetupPrompt'
import SettingsModal from './SettingsModal'

interface EstimatesLayoutClientProps {
  initialCustomers: Customer[]
  initialSettings: EstimateSettings | null
  userId: string
}

export default function EstimatesLayoutClient({
  initialCustomers,
  initialSettings,
  userId,
}: EstimatesLayoutClientProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null)
  const [settings, setSettings] = useState<EstimateSettings | null>(initialSettings)
  const [showSetup, setShowSetup] = useState(!initialSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null

  async function handleSetupComplete(startNumber: number) {
    const supabase = createClient()
    const { data } = await supabase
      .from('estimate_settings')
      .upsert({
        user_id: userId,
        next_estimate_number: startNumber,
        company_name: 'Peckham Inc. DBA Peckham Coatings',
        company_address: '1865 Herndon Ave K106, Clovis, CA 93611',
        company_city_state_zip: 'Clovis, CA 93611',
        company_website: 'www.PeckhamCoatings.com',
        company_phone: '',
      }, { onConflict: 'user_id' })
      .select()
      .single()
    if (data) {
      setSettings(data)
      setShowSetup(false)
    }
  }

  async function handleSettingsSave(updated: EstimateSettings) {
    setSettings(updated)
    setShowSettings(false)
  }

  async function refreshCustomers() {
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (data) setCustomers(data)
  }

  async function selectCustomer(customerId: string) {
    setSelectedCustomerId(customerId)
    setSelectedEstimateId(null)
    const supabase = createClient()
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', customerId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setEstimates(data)
  }

  async function refreshEstimates() {
    if (!selectedCustomerId) return
    const supabase = createClient()
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', selectedCustomerId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setEstimates(data)
  }

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MonitorIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Desktop Only Feature</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Estimates is designed for desktop use. Please open this page on a desktop or laptop for the best experience.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {showSetup && <SetupPrompt onComplete={handleSetupComplete} />}
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          userId={userId}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
        />
      )}
      <div className="flex h-full overflow-hidden w-full max-w-full">
        <CustomersPanel
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          estimates={estimates}
          userId={userId}
          onSelectCustomer={selectCustomer}
          onCustomerAdded={refreshCustomers}
          onOpenSettings={() => setShowSettings(true)}
        />
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
          <EstimatesWorkspace
            customer={selectedCustomer}
            estimates={estimates}
            selectedEstimateId={selectedEstimateId}
            settings={settings}
            userId={userId}
            onSelectEstimate={setSelectedEstimateId}
            onEstimateCreated={refreshEstimates}
            onEstimateUpdated={refreshEstimates}
            onBack={() => setSelectedEstimateId(null)}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
      </div>
    </>
  )
}
