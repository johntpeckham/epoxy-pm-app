import type { Customer, LineItem, ChangeOrder } from '../estimates/types'

export type { Customer, LineItem, ChangeOrder }

export interface Invoice {
  id: string
  invoice_number: string
  company_id: string
  estimate_id: string | null
  project_name: string | null
  line_items: LineItem[]
  subtotal: number
  tax: number | null
  total: number
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue'
  due_date: string | null
  issued_date: string
  notes: string | null
  terms: string | null
  created_at: string
  updated_at: string
  user_id: string
}

export type TimeFilter = 'all' | '365' | '30'
