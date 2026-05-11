'use client'

import { useEffect, useState } from 'react'
import { PencilIcon, ChevronLeftIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/components/proposals/types'
import type { EstimatingProject } from './types'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import { usePermissions } from '@/lib/usePermissions'
import UnifiedInfoCard, {
  type UnifiedInfoFields,
} from '@/components/shared/UnifiedInfoCard'
import MeasurementsCard from '@/components/shared/MeasurementsCard'
import PhotosCard from '@/components/shared/PhotosCard'
import ProjectEstimatesCard from './ProjectEstimatesCard'
import ProjectProposalsCard from './ProjectProposalsCard'
import ProjectRemindersCard from './ProjectRemindersCard'
import ProjectNumberOverrideModal from './ProjectNumberOverrideModal'
import ProjectEditInfoModal from './ProjectEditInfoModal'
import { formatAddressLine } from './ProjectAddressFields'

interface ProjectDashboardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
  onPatch: (patch: Partial<EstimatingProject>) => void
  onBack: () => void
}

export default function ProjectDashboard({
  project,
  customer,
  userId,
  onPatch,
  onBack,
}: ProjectDashboardProps) {
  const { canEdit } = usePermissions()
  // Project number override was previously admin-only. Now surfaces for any
  // user with edit access to estimating (admin retains it via shortcut).
  const canOverrideProjectNumber = canEdit('estimating')
  const canEditProject = canEdit('estimating')
  const [showOverride, setShowOverride] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  // The Info card and the edit modal both need the full companies list +
  // lead_categories. Fetched here once and passed down, matching the
  // Lead/Appointment/Job Walk detail-page pattern. ProjectDashboard's
  // external interface from EstimatingClient is unchanged — these are
  // purely internal additions.
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<LeadCategory[]>([])
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.all([
      supabase
        .from('companies')
        .select('*')
        .eq('archived', false)
        .order('name', { ascending: true }),
      supabase
        .from('lead_categories')
        .select('*')
        .order('name', { ascending: true }),
    ]).then(([custRes, catRes]) => {
      if (cancelled) return
      if (custRes.error) {
        console.error('[ProjectDashboard] Load customers failed:', {
          code: custRes.error.code,
          message: custRes.error.message,
          hint: custRes.error.hint,
          details: custRes.error.details,
        })
      } else {
        setCustomers((custRes.data ?? []) as Customer[])
      }
      if (catRes.error) {
        console.error('[ProjectDashboard] Load lead_categories failed:', {
          code: catRes.error.code,
          message: catRes.error.message,
          hint: catRes.error.hint,
          details: catRes.error.details,
        })
      } else {
        setCategories((catRes.data ?? []) as LeadCategory[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Compose the project's structured address into a single display line.
  // Falls back to the customer's single-line address only if the project
  // has no structured fields (legacy projects pre-migration backfill).
  const projectAddressLine = formatAddressLine({
    street: project.project_address_street ?? '',
    city: project.project_address_city ?? '',
    state: project.project_address_state ?? '',
    zip: project.project_address_zip ?? '',
  })

  // The same line, but used for the Info card's read-only Customer Address
  // row. Reads directly off the linked customer's structured columns.
  const customerAddressLine = formatAddressLine({
    street: customer.address ?? '',
    city: customer.city ?? '',
    state: customer.state ?? '',
    zip: customer.zip ?? '',
  })

  // UnifiedInfoCard expects a flat UnifiedInfoFields shape. Project's
  // columns don't line up 1:1 (e.g. estimating_projects.email maps to
  // customer_email; customer name is read from the joined company; the
  // structured project address fields concatenate into project_address
  // for display). Translate here so the card stays oblivious to Project
  // specifics.
  const infoData: UnifiedInfoFields = {
    project_name: project.name,
    company_id: project.company_id,
    customer_name: customer?.name ?? null,
    customer_email: project.email,
    customer_phone: project.phone,
    address: customerAddressLine || null,
    project_address: projectAddressLine || null,
    date: null,
    assigned_to: null,
    lead_source: project.lead_source,
    lead_category_id: project.lead_category_id,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="px-4 py-4 border-b border-gray-200 bg-white relative">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition mb-2"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back to customers
          </button>
          {canEditProject && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              title="Edit project"
              aria-label="Edit project"
              className="text-gray-400 hover:text-amber-600 hover:bg-amber-50 p-1.5 rounded-md transition flex-shrink-0"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {project.project_number && (
          <div className="mb-1">
            {canOverrideProjectNumber ? (
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                title="Edit project number"
                className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5 transition"
              >
                Project #{project.project_number}
                <PencilIcon className="w-3 h-3" />
              </button>
            ) : (
              <span className="inline-flex items-center text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                Project #{project.project_number}
              </span>
            )}
          </div>
        )}
        <h2 className="text-base font-bold text-gray-900 truncate">
          {project.name || 'Untitled project'}
        </h2>
        <p className="text-xs text-gray-500 truncate">
          {customer.name}
          {customer.company ? ` · ${customer.company}` : ''}
          {projectAddressLine ? ` · ${projectAddressLine}` : ''}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <UnifiedInfoCard
          key={`info-${project.id}`}
          parentType="project"
          parentId={project.id}
          data={infoData}
          customers={customers}
          assignees={[]}
          categories={categories}
          isAdmin={false}
          onPatch={() => {
            // Card is read-only for Project — all edits flow through
            // ProjectEditInfoModal (opened via onEditClick), which calls
            // ProjectDashboard's onPatch directly. This noop satisfies
            // the required prop without introducing a second save path.
          }}
          onCategoriesChanged={(next) => setCategories(next as LeadCategory[])}
          onEditClick={() => setShowEdit(true)}
        />

        <MeasurementsCard
          key={`measurements-${project.id}`}
          parentType="project"
          parentId={project.id}
          userId={userId}
          dualSourceMode={true}
          measurements={project.measurements}
          // The card debounces and writes estimating_projects.measurements
          // itself via its internal handleTextChange. This callback just
          // propagates the new value up to EstimatingClient (via onPatch)
          // so the in-memory project list stays in sync — otherwise this
          // dashboard would keep stale local data after a remount.
          onMeasurementsPatch={(value) => onPatch({ measurements: value })}
        />

        <ProjectEstimatesCard
          key={`estimates-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
        />

        <ProjectProposalsCard
          key={`proposals-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
        />

        <ProjectRemindersCard
          key={`reminders-${project.id}`}
          projectId={project.id}
          projectName={project.name}
          userId={userId}
          customerId={customer.id}
        />

        <PhotosCard
          key={`photos-${project.id}`}
          parentType="project"
          parentId={project.id}
          userId={userId}
        />
      </div>

      {showOverride && (
        <ProjectNumberOverrideModal
          project={project}
          onClose={() => setShowOverride(false)}
          onUpdated={(patch) => {
            onPatch(patch)
            setShowOverride(false)
          }}
        />
      )}

      {showEdit && (
        <ProjectEditInfoModal
          project={project}
          customer={customer}
          customers={customers}
          categories={categories}
          userId={userId}
          onClose={() => setShowEdit(false)}
          onUpdated={(patch) => onPatch(patch)}
          onCategoriesChanged={(next) => setCategories(next as LeadCategory[])}
        />
      )}
    </div>
  )
}

