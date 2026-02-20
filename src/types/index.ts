export type ProjectStatus = 'Active' | 'Complete'

export interface Project {
  id: string
  name: string
  client_name: string
  address: string
  status: ProjectStatus
  estimate_number?: string
  created_at: string
}

export type PostType = 'text' | 'photo' | 'daily_report'

export interface TextContent {
  message: string
}

export interface PhotoContent {
  photos: string[] // storage paths
  caption?: string
}

export interface DailyReportContent {
  // Header (auto-filled from project, editable)
  project_name: string
  date: string
  address: string
  // Crew
  reported_by: string
  project_foreman: string
  weather: string
  // Progress (paragraph fields)
  progress: string
  delays: string
  safety: string
  materials_used: string
  employees: string
  // Photos embedded in the report
  photos: string[] // storage paths
}

export type PostContent = TextContent | PhotoContent | DailyReportContent

export interface FeedPost {
  id: string
  project_id: string
  user_id: string
  post_type: PostType
  content: PostContent
  is_pinned: boolean
  created_at: string
  author_email?: string
  author_name?: string
}
