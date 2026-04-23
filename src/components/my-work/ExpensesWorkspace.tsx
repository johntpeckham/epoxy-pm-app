'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  LoaderIcon,
  WalletIcon,
} from 'lucide-react'
import { UserRole } from '@/types'
import SalesmanExpenseCard from '@/components/salesman-expenses/SalesmanExpenseCard'
import type { SalesmanExpenseRow } from '@/components/salesman-expenses/SalesmanExpenseCard'
import NewSalesmanExpenseModal from '@/components/salesman-expenses/NewSalesmanExpenseModal'
import EditSalesmanExpenseModal from '@/components/salesman-expenses/EditSalesmanExpenseModal'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import { usePermissions } from '@/lib/usePermissions'

interface ExpensesWorkspaceProps {
  userId: string
  userRole: UserRole
  initialExpenses: SalesmanExpenseRow[]
  showCreateModal?: boolean
  onCloseCreateModal?: () => void
  onCountChange?: (unpaidCount: number, unpaidTotal: number) => void
}

export default function ExpensesWorkspace({
  userId,
  userRole,
  initialExpenses,
  showCreateModal = false,
  onCloseCreateModal,
  onCountChange,
}: ExpensesWorkspaceProps) {
  const [expenses, setExpenses] = useState<SalesmanExpenseRow[]>(initialExpenses)
  const [editingExpense, setEditingExpense] = useState<SalesmanExpenseRow | null>(null)
  const [showPaid, setShowPaid] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // "See everyone's expenses" was admin+OM; office view is the cleanest
  // mapping in the default template.
  const { canView } = usePermissions()
  const isAdminOrOM = canView('office')

  const fetchExpenses = useCallback(async () => {
    const supabase = createClient()
    let query = supabase
      .from('salesman_expenses')
      .select('*')
      .order('date', { ascending: false })

    if (!isAdminOrOM) {
      query = query.eq('user_id', userId)
    }

    const { data } = await query

    if (data) {
      if (isAdminOrOM) {
        const userIds = [...new Set(data.map((e: SalesmanExpenseRow) => e.user_id))]
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)

        const nameMap = new Map(
          (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? 'Unknown'])
        )

        setExpenses(
          data.map((e: SalesmanExpenseRow) => ({
            ...e,
            user_display_name: nameMap.get(e.user_id) ?? 'Unknown',
          }))
        )
      } else {
        setExpenses(data as SalesmanExpenseRow[])
      }
    }
  }, [userId, isAdminOrOM])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  /* ---- Derived data ---- */
  const unpaidExpenses = useMemo(
    () => expenses.filter((e) => e.status === 'Unpaid'),
    [expenses]
  )
  const paidExpenses = useMemo(
    () => expenses.filter((e) => e.status === 'Paid'),
    [expenses]
  )
  const unpaidTotal = useMemo(
    () => unpaidExpenses.reduce((sum, e) => sum + e.amount, 0),
    [unpaidExpenses]
  )
  const paidTotal = useMemo(
    () => paidExpenses.reduce((sum, e) => sum + e.amount, 0),
    [paidExpenses]
  )

  /* ---- Notify parent of count changes ---- */
  useEffect(() => {
    const myUnpaid = isAdminOrOM
      ? expenses.filter((e) => e.status === 'Unpaid')
      : expenses.filter((e) => e.status === 'Unpaid' && e.user_id === userId)
    const total = myUnpaid.reduce((sum, e) => sum + e.amount, 0)
    onCountChange?.(myUnpaid.length, total)
  }, [expenses, userId, isAdminOrOM, onCountChange])

  function formatCurrency(val: number) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function handleCreated() {
    onCloseCreateModal?.()
    fetchExpenses()
  }

  function handleUpdated() {
    setEditingExpense(null)
    fetchExpenses()
  }

  async function handleDownload() {
    setDownloading(true)
    setPdfError(null)
    setShowPreview(true)
    setPdfPreview(null)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()

      const title = isAdminOrOM ? 'All Employee Expenses' : 'My Expenses'
      doc.setFontSize(18)
      doc.text(title, 14, 20)

      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US')}`, 14, 28)

      let y = 40

      const sections = [
        { label: 'Unpaid', items: unpaidExpenses, total: unpaidTotal },
        { label: 'Paid', items: paidExpenses, total: paidTotal },
      ]

      for (const section of sections) {
        if (section.items.length === 0) continue

        doc.setFontSize(14)
        doc.text(`${section.label} (${section.items.length}) — Total: ${formatCurrency(section.total)}`, 14, y)
        y += 8

        doc.setFontSize(9)
        doc.setTextColor(100)
        doc.text('Date', 14, y)
        doc.text('Description', 44, y)
        if (isAdminOrOM) doc.text('Employee', 110, y)
        doc.text('Amount', 170, y, { align: 'right' })
        y += 5
        doc.setDrawColor(200)
        doc.line(14, y, 196, y)
        y += 4

        doc.setTextColor(0)
        for (const expense of section.items) {
          if (y > 270) {
            doc.addPage()
            y = 20
          }

          const dateStr = new Date(expense.date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })

          doc.text(dateStr, 14, y)
          doc.text((expense.description || '—').substring(0, 40), 44, y)
          if (isAdminOrOM) doc.text((expense.user_display_name || '—').substring(0, 25), 110, y)
          doc.text(formatCurrency(expense.amount), 170, y, { align: 'right' })
          y += 6
        }

        y += 8
      }

      setPdfPreview({ blob: doc.output('blob'), filename: 'expenses.pdf', title: isAdminOrOM ? 'Employee Expenses' : 'Personal Expenses' })
    } catch (err) {
      console.error('PDF download failed:', err)
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setDownloading(false)
    }
  }

  /* ================================================================ */
  /*  ADMIN / OM — GROUPED BY USER VIEW                                */
  /* ================================================================ */

  if (isAdminOrOM) {
    return (
      <div className="p-4 space-y-4">
        {/* Download button */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              {unpaidExpenses.length} unpaid &middot; {formatCurrency(unpaidTotal)} total
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || expenses.length === 0}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {downloading ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
            Download
          </button>
        </div>

        {expenses.length === 0 ? (
          <EmptyState />
        ) : (
          <GroupedByUserView
            expenses={expenses}
            isAdminOrOM={isAdminOrOM}
            onEdit={(e) => setEditingExpense(e)}
            onRefresh={fetchExpenses}
          />
        )}

        {showCreateModal && (
          <NewSalesmanExpenseModal
            userId={userId}
            onClose={() => onCloseCreateModal?.()}
            onCreated={handleCreated}
          />
        )}

        {editingExpense && (
          <EditSalesmanExpenseModal
            expense={editingExpense}
            onClose={() => setEditingExpense(null)}
            onUpdated={handleUpdated}
          />
        )}

        {showPreview && (
          <ReportPreviewModal
            pdfData={pdfPreview}
            loading={downloading}
            error={pdfError}
            title="Employee Expenses"
            onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
          />
        )}
      </div>
    )
  }

  /* ================================================================ */
  /*  NON-ADMIN — PERSONAL VIEW                                        */
  /* ================================================================ */

  return (
    <div className="p-4 space-y-4">
      {/* Download button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {unpaidExpenses.length} unpaid &middot; {formatCurrency(unpaidTotal)} total
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || expenses.length === 0}
          className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {downloading ? (
            <LoaderIcon className="w-4 h-4 animate-spin" />
          ) : (
            <DownloadIcon className="w-4 h-4" />
          )}
          Download
        </button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Unpaid section — expanded */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Unpaid ({unpaidExpenses.length})
              </p>
              <span className="text-sm font-semibold text-amber-600 tabular-nums">
                Total: {formatCurrency(unpaidTotal)}
              </span>
            </div>
            {unpaidExpenses.length === 0 ? (
              <div className="text-center py-8 bg-white border border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No unpaid expenses</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unpaidExpenses.map((expense) => (
                  <SalesmanExpenseCard
                    key={expense.id}
                    expense={expense}
                    showUserName={false}
                    onEdit={(e) => setEditingExpense(e)}
                    onRefresh={fetchExpenses}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Paid section — collapsed */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setShowPaid(!showPaid)}
              className="flex items-center gap-2 w-full text-left mb-3"
            >
              <ChevronRightIcon
                className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showPaid ? 'rotate-90' : ''}`}
              />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Paid ({paidExpenses.length})
              </span>
              <span className="text-xs text-gray-400 ml-auto tabular-nums">
                Total: {formatCurrency(paidTotal)}
              </span>
            </button>
            {showPaid && (
              paidExpenses.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-200 rounded-xl">
                  <p className="text-sm text-gray-400">No paid expenses</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paidExpenses.map((expense) => (
                    <SalesmanExpenseCard
                      key={expense.id}
                      expense={expense}
                      showUserName={false}
                      onEdit={(e) => setEditingExpense(e)}
                      onRefresh={fetchExpenses}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <NewSalesmanExpenseModal
          userId={userId}
          onClose={() => onCloseCreateModal?.()}
          onCreated={handleCreated}
        />
      )}

      {editingExpense && (
        <EditSalesmanExpenseModal
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onUpdated={handleUpdated}
        />
      )}

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          loading={downloading}
          error={pdfError}
          title="Personal Expenses"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </div>
  )
}

/* ================================================================== */
/*  EMPTY STATE                                                        */
/* ================================================================== */

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <WalletIcon className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">No expenses yet</p>
      <p className="text-gray-400 text-sm mt-1">
        Click &quot;+ New&quot; to add your first expense.
      </p>
    </div>
  )
}

/* ================================================================== */
/*  GROUPED BY USER VIEW (Admin / Office Manager)                      */
/* ================================================================== */

function GroupedByUserView({
  expenses,
  isAdminOrOM,
  onEdit,
  onRefresh,
}: {
  expenses: SalesmanExpenseRow[]
  isAdminOrOM: boolean
  onEdit: (e: SalesmanExpenseRow) => void
  onRefresh: () => void
}) {
  // Group expenses by user
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; expenses: SalesmanExpenseRow[] }>()
    for (const e of expenses) {
      const key = e.user_id
      if (!map.has(key)) {
        map.set(key, { name: e.user_display_name ?? 'Unknown', expenses: [] })
      }
      map.get(key)!.expenses.push(e)
    }
    // Sort groups by name
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [expenses])

  return (
    <div className="space-y-4">
      {grouped.map(([userId, group]) => (
        <UserExpenseSection
          key={userId}
          userName={group.name}
          expenses={group.expenses}
          isAdminOrOM={isAdminOrOM}
          onEdit={onEdit}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}

/* ================================================================== */
/*  USER EXPENSE SECTION (within grouped view)                         */
/* ================================================================== */

function UserExpenseSection({
  userName,
  expenses,
  isAdminOrOM,
  onEdit,
  onRefresh,
}: {
  userName: string
  expenses: SalesmanExpenseRow[]
  isAdminOrOM: boolean
  onEdit: (e: SalesmanExpenseRow) => void
  onRefresh: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showPaid, setShowPaid] = useState(false)

  const unpaid = expenses.filter((e) => e.status === 'Unpaid')
  const paid = expenses.filter((e) => e.status === 'Paid')
  const unpaidTotal = unpaid.reduce((sum, e) => sum + e.amount, 0)
  const paidTotal = paid.reduce((sum, e) => sum + e.amount, 0)

  function formatCurrency(val: number) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* User header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        {collapsed ? (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-sm font-semibold text-gray-900">{userName}</span>
        <span className="text-xs text-gray-400 ml-auto">
          {unpaid.length} unpaid &middot; {formatCurrency(unpaidTotal)}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {/* Unpaid */}
          {unpaid.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Unpaid ({unpaid.length})
                </p>
                <span className="text-xs font-semibold text-amber-600 tabular-nums">
                  {formatCurrency(unpaidTotal)}
                </span>
              </div>
              <div className="space-y-2">
                {unpaid.map((expense) => (
                  <SalesmanExpenseCard
                    key={expense.id}
                    expense={expense}
                    showUserName={false}
                    onEdit={onEdit}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-3">No unpaid expenses</p>
          )}

          {/* Paid (collapsed) */}
          {paid.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowPaid(!showPaid)}
                className="flex items-center gap-2 w-full text-left mb-2"
              >
                <ChevronRightIcon
                  className={`w-3 h-3 text-amber-500 transition-transform duration-200 ${showPaid ? 'rotate-90' : ''}`}
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Paid ({paid.length})
                </span>
                <span className="text-xs text-gray-400 ml-auto tabular-nums">
                  {formatCurrency(paidTotal)}
                </span>
              </button>
              {showPaid && (
                <div className="space-y-2">
                  {paid.map((expense) => (
                    <SalesmanExpenseCard
                      key={expense.id}
                      expense={expense}
                      showUserName={false}
                      onEdit={onEdit}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
