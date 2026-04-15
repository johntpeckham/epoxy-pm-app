export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RulerIcon } from 'lucide-react'

export default async function ProjectTakeoffPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <h1 className="text-[22px] font-medium text-gray-900 leading-tight">Project Takeoff</h1>

      <div className="mt-4 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500">
              <RulerIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Measurements</h3>
          </div>
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
