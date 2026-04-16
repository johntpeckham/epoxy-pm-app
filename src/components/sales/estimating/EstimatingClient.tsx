'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  PlusIcon,
  SearchIcon,
  CalculatorIcon,
  ChevronLeftIcon,
  UsersIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/estimates/types'
import type { EstimatingProject } from './types'
import {
  PROJECT_STATUS_STYLES,
  PROJECT_SOURCE_LABELS,
} from './types'
import NewProjectModal from './NewProjectModal'
import ProjectDashboard from './ProjectDashboard'

interface EstimatingClientProps {
  initialCustomers: Customer[]
  userId: string
}

export default function EstimatingClient({
  initialCustomers,
  userId,
}: EstimatingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [projects, setProjects] = useState<EstimatingProject[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  // Initialize from URL on mount
  useEffect(() => {
    const customerParam = searchParams.get('customer')
    const projectParam = searchParams.get('project')
    if (customerParam) {
      setSelectedCustomerId(customerParam)
      if (projectParam) setSelectedProjectId(projectParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update URL when selection changes
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedCustomerId) params.set('customer', selectedCustomerId)
    if (selectedProjectId) params.set('project', selectedProjectId)
    const qs = params.toString()
    const url = qs ? `/sales/estimating?${qs}` : '/sales/estimating'
    router.replace(url, { scroll: false })
  }, [selectedCustomerId, selectedProjectId, router])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  )

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  // Fetch projects when customer is selected
  const fetchProjects = useCallback(
    async (customerId: string) => {
      setLoadingProjects(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('estimating_projects')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      setProjects((data as EstimatingProject[]) ?? [])
      setLoadingProjects(false)
    },
    []
  )

  useEffect(() => {
    if (selectedCustomerId) {
      fetchProjects(selectedCustomerId)
    } else {
      setProjects([])
    }
  }, [selectedCustomerId, fetchProjects])

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => {
      const hay = [
        c.name,
        c.company ?? '',
        c.email ?? '',
        c.phone ?? '',
        c.address ?? '',
        c.city ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [customers, search])

  function handleSelectCustomer(id: string) {
    setSelectedCustomerId(id)
    setSelectedProjectId(null)
  }

  function handleSelectProject(id: string) {
    setSelectedProjectId(id)
  }

  function handleBackToCustomers() {
    setSelectedCustomerId(null)
    setSelectedProjectId(null)
  }

  async function refreshCustomers() {
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (data) setCustomers(data as Customer[])
  }

  function handleProjectCreated(project: EstimatingProject) {
    setProjects((prev) => [project, ...prev])
    setSelectedCustomerId(project.customer_id)
    setSelectedProjectId(project.id)
    setShowNewModal(false)
    // The modal may have been opened from state 1 with no selected customer;
    // ensure customers list stays in sync in case the modal created a customer.
    refreshCustomers()
  }

  function handleProjectPatch(patch: Partial<EstimatingProject>) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId ? { ...p, ...patch } : p
      )
    )
  }

  const inState3 = !!(selectedCustomer && selectedProject)
  const inState2 = !!(selectedCustomer && !selectedProject)

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">
      {/* Left column */}
      <div
        className={`flex-shrink-0 w-screen max-w-full lg:w-80 xl:w-96 min-w-0 bg-white border-r border-gray-200 flex-col overflow-hidden ${
          inState3 ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {inState3 && selectedCustomer ? (
          <ProjectSidebar
            customer={selectedCustomer}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onBack={handleBackToCustomers}
            onSelectProject={handleSelectProject}
            onNewProject={() => setShowNewModal(true)}
          />
        ) : (
          <CustomerSidebar
            customers={filteredCustomers}
            selectedCustomerId={selectedCustomerId}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelectCustomer}
            onNewProject={() => setShowNewModal(true)}
          />
        )}
      </div>

      {/* Right column */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 ${
          !inState3 && inState2 ? 'hidden lg:flex' : 'flex'
        } ${!selectedCustomer && !inState3 ? 'hidden lg:flex' : ''} flex-col`}
      >
        {inState3 && selectedProject && selectedCustomer ? (
          <ProjectDashboard
            key={selectedProject.id}
            project={selectedProject}
            customer={selectedCustomer}
            userId={userId}
            onPatch={handleProjectPatch}
          />
        ) : inState2 && selectedCustomer ? (
          <CustomerProjectsPanel
            customer={selectedCustomer}
            projects={projects}
            loading={loadingProjects}
            onSelectProject={handleSelectProject}
            onNewProject={() => setShowNewModal(true)}
          />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <CalculatorIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Select a customer to view their projects.
              </p>
            </div>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewProjectModal
          userId={userId}
          customers={customers}
          prefillCustomerId={selectedCustomerId}
          onClose={() => setShowNewModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  )
}

// ── State 1 sidebar: customer list ───────────────────────────────────────
interface CustomerSidebarProps {
  customers: Customer[]
  selectedCustomerId: string | null
  search: string
  onSearch: (value: string) => void
  onSelect: (id: string) => void
  onNewProject: () => void
}

function CustomerSidebar({
  customers,
  selectedCustomerId,
  search,
  onSearch,
  onSelect,
  onNewProject,
}: CustomerSidebarProps) {
  return (
    <>
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Estimating</h1>
          <button
            onClick={onNewProject}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New project
          </button>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {customers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <UsersIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {search
                ? 'No matching customers'
                : 'No customers yet.'}
            </p>
          </div>
        ) : (
          customers.map((c) => (
            <CustomerListItem
              key={c.id}
              customer={c}
              isSelected={selectedCustomerId === c.id}
              onSelect={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </>
  )
}

function CustomerListItem({
  customer,
  isSelected,
  onSelect,
}: {
  customer: Customer
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left relative rounded-lg border p-3 transition ${
        isSelected
          ? 'border-gray-300 bg-gray-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-500" />
      )}
      <p className="text-sm font-semibold text-gray-900 truncate">{customer.name}</p>
      {customer.company && (
        <p className="text-xs text-gray-600 truncate mt-0.5">{customer.company}</p>
      )}
      <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-gray-500">
        {customer.email && (
          <span className="inline-flex items-center gap-1 truncate">
            <MailIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="truncate">{customer.email}</span>
          </span>
        )}
        {customer.phone && (
          <span className="inline-flex items-center gap-1 truncate">
            <PhoneIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="truncate">{customer.phone}</span>
          </span>
        )}
        {(customer.address || customer.city) && (
          <span className="inline-flex items-center gap-1 truncate">
            <MapPinIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="truncate">
              {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
            </span>
          </span>
        )}
      </div>
    </button>
  )
}

// ── State 2 right panel: projects for selected customer ──────────────────
interface CustomerProjectsPanelProps {
  customer: Customer
  projects: EstimatingProject[]
  loading: boolean
  onSelectProject: (id: string) => void
  onNewProject: () => void
}

function CustomerProjectsPanel({
  customer,
  projects,
  loading,
  onSelectProject,
  onNewProject,
}: CustomerProjectsPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="px-4 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-gray-900 truncate">
            {customer.name}
          </h2>
          {customer.company && (
            <p className="text-xs text-gray-500 truncate">{customer.company}</p>
          )}
        </div>
        <button
          onClick={onNewProject}
          className="flex-shrink-0 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          New project
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="text-center py-14">
            <CalculatorIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              No projects yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectListRow
                key={p.id}
                project={p}
                onClick={() => onSelectProject(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectListRow({
  project,
  onClick,
}: {
  project: EstimatingProject
  onClick: () => void
}) {
  const statusStyle = PROJECT_STATUS_STYLES[project.status]
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {project.name}
          </p>
          {project.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {project.description}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          {project.source && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
              {PROJECT_SOURCE_LABELS[project.source]}
            </span>
          )}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle.className}`}
          >
            {statusStyle.label}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── State 3 sidebar: project list for selected customer ──────────────────
interface ProjectSidebarProps {
  customer: Customer
  projects: EstimatingProject[]
  selectedProjectId: string | null
  onBack: () => void
  onSelectProject: (id: string) => void
  onNewProject: () => void
}

function ProjectSidebar({
  customer,
  projects,
  selectedProjectId,
  onBack,
  onSelectProject,
  onNewProject,
}: ProjectSidebarProps) {
  return (
    <>
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
          Back to customers
        </button>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-gray-900 truncate">
              {customer.name}
            </h1>
            {customer.company && (
              <p className="text-xs text-gray-500 truncate">{customer.company}</p>
            )}
          </div>
          <button
            onClick={onNewProject}
            className="flex-shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
            aria-label="New project"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {projects.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No projects yet.
          </p>
        ) : (
          projects.map((p) => (
            <ProjectSidebarItem
              key={p.id}
              project={p}
              isSelected={selectedProjectId === p.id}
              onSelect={() => onSelectProject(p.id)}
            />
          ))
        )}
      </div>
    </>
  )
}

function ProjectSidebarItem({
  project,
  isSelected,
  onSelect,
}: {
  project: EstimatingProject
  isSelected: boolean
  onSelect: () => void
}) {
  const statusStyle = PROJECT_STATUS_STYLES[project.status]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left relative rounded-lg border p-3 transition ${
        isSelected
          ? 'border-gray-300 bg-gray-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-500" />
      )}
      <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {new Date(project.created_at).toLocaleDateString()}
        </span>
      </div>
    </button>
  )
}
