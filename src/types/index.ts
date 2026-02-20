export type ProjectStatus = 'Active' | 'Complete'

export interface Project {
  id: string
  name: string
  client_name: string
  address: string
  status: ProjectStatus
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
  date: string
  crew_members: string
  surface_prep_notes: string
  epoxy_product_used: string
  coats_applied: string
  weather_conditions: string
  additional_notes: string
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
