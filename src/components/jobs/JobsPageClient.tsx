'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PlusIcon, SearchIcon } from 'lucide-react'
import ProjectCard from './ProjectCard'
import NewProjectModal from './NewProjectModal'
import EditProjectModal from './EditProjectModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Project } from '@/types'

interface JobsPageClientProps {
  initialProjects: Project[]
}

export default function JobsPageClient({ initialProjects }: JobsPageClientProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Complete'>('All')

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchProjects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setProjects(data)
  }, [])

  async function handleDeleteProject() {
    if (!projectToDelete) return
    setIsDeleting(true)
    const supabase = createClient()

    // Delete storage photos for all photo posts in this project
    const { data: photoPosts } = await supabase
      .from('feed_posts')
      .select('content')
      .eq('project_id', projectToDelete.id)
      .eq('post_type', 'photo')

    if (photoPosts && photoPosts.length > 0) {
      const paths: string[] = photoPosts.flatMap(
        (p) => (p.content as { photos?: string[] }).photos ?? []
      )
      if (paths.length > 0) {
        await supabase.storage.from('post-photos').remove(paths)
      }
    }

    await supabase.from('projects').delete().eq('id', projectToDelete.id)

    setIsDeleting(false)
    setProjectToDelete(null)
    fetchProjects()
  }

  const filtered = projects.filter((p) => {
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  const activeCount = projects.filter((p) => p.status === 'Active').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active · {projects.length} total
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-col sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
          />
        </div>
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-lg self-start sm:self-auto">
          {(['All', 'Active', 'Complete'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                statusFilter === s
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Project List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">
            {search || statusFilter !== 'All' ? 'No matching projects' : 'No projects yet'}
          </p>
          {!search && statusFilter === 'All' && (
            <p className="text-gray-400 text-sm mt-1">
              Create your first project to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={setEditingProject}
              onDelete={setProjectToDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false)
            fetchProjects()
          }}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={() => {
            setEditingProject(null)
            fetchProjects()
          }}
        />
      )}

      {projectToDelete && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${projectToDelete.name}"? All posts and photos for this project will be permanently deleted.`}
          onConfirm={handleDeleteProject}
          onCancel={() => setProjectToDelete(null)}
          loading={isDeleting}
        />
      )}
    </div>
  )
}
