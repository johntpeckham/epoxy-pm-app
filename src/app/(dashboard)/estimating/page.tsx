export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileTextIcon, RulerIcon, CompassIcon } from 'lucide-react'

export default async function EstimatingPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const { count: estimateCountRaw } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const estimateCount = estimateCountRaw ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <h1 className="text-[22px] font-medium text-gray-900 leading-tight">Estimating</h1>
      <p className="text-sm text-gray-500 mb-4">
        Estimates, measurements, and project takeoffs.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <OverviewCard
          href="/estimates"
          icon={<FileTextIcon className="w-5 h-5" />}
          title="Estimates"
          subtitle={`${estimateCount} ${estimateCount === 1 ? 'estimate' : 'estimates'}`}
        />
        <OverviewCard
          href="/job-takeoff"
          icon={<RulerIcon className="w-5 h-5" />}
          title="Measurements"
          subtitle="Project takeoff and measurements"
        />
        <OverviewCard
          href="/estimating/project-takeoff"
          icon={<CompassIcon className="w-5 h-5" />}
          title="Project Takeoff"
          subtitle="Coming soon"
        />
      </div>
    </div>
  )
}

function OverviewCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50 cursor-pointer block"
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mt-2">{subtitle}</p>
    </Link>
  )
}
