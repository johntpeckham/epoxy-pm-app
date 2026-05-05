export const dynamic = 'force-dynamic'

// This route mounts the SAME canonical TakeoffClient used by the
// Estimating route (/estimating/takeoff/[id]). Do NOT copy or fork
// TakeoffClient — both routes import from the same file.

import { RulerIcon } from 'lucide-react'
import Link from 'next/link'
import { requirePermission } from '@/lib/requirePermission'
import TakeoffClient, {
  type MeasurementRow,
  type TakeoffSectionRow,
} from '@/components/sales/estimating/TakeoffClient'
import type {
  EstimatingProject,
  EstimatingProjectPdf,
} from '@/components/sales/estimating/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ToolsTakeoffDetailPage({ params }: PageProps) {
  const { supabase } = await requirePermission('estimating', 'view')
  const { id } = await params

  const { data: project } = await supabase
    .from('estimating_projects')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RulerIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Takeoff not found</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            This takeoff doesn&apos;t exist or has been deleted.
          </p>
          <Link
            href="/tools/takeoff"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition"
          >
            Back to Takeoff
          </Link>
        </div>
      </div>
    )
  }

  const { data: pdfRows } = await supabase
    .from('estimating_project_measurement_pdfs')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  const pdfs = (pdfRows ?? []) as EstimatingProjectPdf[]

  const { data: measurementRows } = pdfs.length
    ? await supabase
        .from('estimating_project_measurements')
        .select('*')
        .in(
          'pdf_id',
          pdfs.map((p) => p.id)
        )
    : { data: [] as MeasurementRow[] }

  const { data: sectionRows } = await supabase
    .from('estimating_project_measurement_sections')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <TakeoffClient
      project={project as EstimatingProject}
      pdfs={pdfs}
      measurements={(measurementRows ?? []) as MeasurementRow[]}
      sections={(sectionRows ?? []) as TakeoffSectionRow[]}
    />
  )
}
