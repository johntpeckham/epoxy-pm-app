export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import JobsPageClient from '@/components/jobs/JobsPageClient'
import { Project } from '@/types'

export default async function JobsPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return <JobsPageClient initialProjects={(projects as Project[]) ?? []} />
}
