'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  ClockIcon,
  DollarSignIcon,
  ReceiptIcon,
  WalletIcon,
  ClipboardListIcon,
  TruckIcon,
  BanknoteIcon,
} from 'lucide-react'

interface ReportType {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  enabled: boolean
  href?: string
}

const REPORT_TYPES: ReportType[] = [
  {
    id: 'timesheets',
    name: 'Timesheet Reports',
    description: 'Hours by employee, job, and date range',
    icon: ClockIcon,
    enabled: true,
    href: '/reports/timesheets',
  },
  {
    id: 'sales',
    name: 'Sales Reports',
    description: 'Pipeline, proposals, revenue',
    icon: DollarSignIcon,
    enabled: false,
  },
  {
    id: 'job-expenses',
    name: 'Job Expense Reports',
    description: 'Expenses by job and category',
    icon: ReceiptIcon,
    enabled: false,
  },
  {
    id: 'employee-expenses',
    name: 'Employee Expense Reports',
    description: 'Reimbursable expenses by employee',
    icon: WalletIcon,
    enabled: false,
  },
  {
    id: 'daily-reports',
    name: 'Daily Report Summaries',
    description: 'Aggregated daily report data',
    icon: ClipboardListIcon,
    enabled: false,
  },
  {
    id: 'material-orders',
    name: 'Material Order Reports',
    description: 'Spending by vendor and job',
    icon: TruckIcon,
    enabled: false,
  },
  {
    id: 'billing',
    name: 'Billing Reports',
    description: 'Invoiced vs paid, aging',
    icon: BanknoteIcon,
    enabled: false,
  },
]

export default function ReportsClient() {
  const router = useRouter()

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/profile')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-600 dark:text-[#a0a0a0]" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#e5e5e5]">Reports</h1>
      </div>

      {/* Report type grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon
          if (report.enabled) {
            return (
              <button
                key={report.id}
                onClick={() => router.push(report.href!)}
                className="text-left bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-md px-4 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2e2e2e] hover:border-gray-300 dark:hover:border-[#3a3a3a] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
                  <span className="text-[13px] font-medium text-gray-900 dark:text-[#e5e5e5]">
                    {report.name}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] mt-1.5 ml-[26px]">
                  {report.description}
                </p>
              </button>
            )
          }
          return (
            <div
              key={report.id}
              className="text-left bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-md px-4 py-4 opacity-50 cursor-default"
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-4.5 h-4.5 text-gray-400 dark:text-[#6b6b6b] flex-shrink-0" />
                <span className="text-[13px] font-medium text-gray-900 dark:text-[#e5e5e5]">
                  {report.name}
                </span>
                <span className="ml-auto text-[10px] font-medium text-gray-400 dark:text-[#6b6b6b] bg-gray-100 dark:bg-[#333] px-1.5 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-[#6b6b6b] mt-1.5 ml-[26px]">
                {report.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
