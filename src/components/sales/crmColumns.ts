export interface BuiltInColumn {
  id: string
  label: string
  type: 'built-in'
  sortField: string | null
  defaultVisible: boolean
  alwaysVisible?: boolean
  width: string
}

export interface CustomColumn {
  id: string
  label: string
  type: 'custom'
  columnType: 'text' | 'number' | 'date' | 'select'
  selectOptions: string[] | null
  sortField: null
  defaultVisible: boolean
  width: string
  dbId: string
}

export type CrmColumn = BuiltInColumn | CustomColumn

export const BUILT_IN_COLUMNS: BuiltInColumn[] = [
  { id: 'company', label: 'Company', type: 'built-in', sortField: 'name', defaultVisible: true, alwaysVisible: true, width: '17%' },
  { id: 'industry', label: 'Industry', type: 'built-in', sortField: 'industry', defaultVisible: true, width: '8%' },
  { id: 'zone', label: 'Zone', type: 'built-in', sortField: 'zone', defaultVisible: true, width: '7%' },
  { id: 'location', label: 'Location', type: 'built-in', sortField: 'location', defaultVisible: true, width: '9%' },
  { id: 'status', label: 'Status', type: 'built-in', sortField: 'status', defaultVisible: true, width: '8%' },
  { id: 'priority', label: 'Priority', type: 'built-in', sortField: 'priority', defaultVisible: true, width: '7%' },
  { id: 'contacts', label: 'Contacts', type: 'built-in', sortField: 'contact_count', defaultVisible: false, width: '9%' },
  { id: 'last_activity', label: 'Last activity', type: 'built-in', sortField: 'last_activity', defaultVisible: true, width: '9%' },
  { id: 'assigned', label: 'Assigned', type: 'built-in', sortField: 'assigned_name', defaultVisible: true, width: '8%' },
  { id: 'last_note', label: 'Last note', type: 'built-in', sortField: 'last_note', defaultVisible: false, width: '12%' },
  { id: 'number_of_locations', label: 'Locations', type: 'built-in', sortField: 'number_of_locations', defaultVisible: false, width: '7%' },
  { id: 'revenue_range', label: 'Revenue Range', type: 'built-in', sortField: 'revenue_range', defaultVisible: false, width: '9%' },
  { id: 'employee_range', label: 'Employees', type: 'built-in', sortField: 'employee_range', defaultVisible: false, width: '8%' },
]

export const DEFAULT_VISIBLE_IDS = BUILT_IN_COLUMNS
  .filter((c) => c.defaultVisible)
  .map((c) => c.id)

export function getVisibleColumns(
  allColumns: CrmColumn[],
  visibleIds: string[]
): CrmColumn[] {
  return allColumns.filter((c) => visibleIds.includes(c.id))
}
