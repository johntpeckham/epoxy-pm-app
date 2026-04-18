'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  WalletIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderIcon,
  DollarSignIcon,
} from 'lucide-react'
import { UserRole } from '@/types'
import SalesmanExpenseCard from './SalesmanExpenseCard'
import type { SalesmanExpenseRow } from './SalesmanExpenseCard'
import NewSalesmanExpenseModal from './NewSalesmanExpenseModal'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import EditSalesmanExpenseModal from './EditSalesmanExpenseModal'

interface SalesmanExpensesPageClientProps {
  initialExpenses: SalesmanExpenseRow[]
  userId: string
  userRole: UserRole
}

export default function SalesmanExpensesPageClient({
  initialExpenses,
  userId,
  userRole,
}: SalesmanExpensesPageClientProps) {
  const [expenses, setExpenses] = useState<SalesmanExpenseRow[]>(initialExpenses)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<SalesmanExpenseRow | null>(null)
  const [showPaid, setShowPaid] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const isAdminOrOM = userRole === 'admin' || userRole === 'office_manager'

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
        // Fetch profile display names for all user_ids
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

  // Re-fetch on mount to get fresh data (server data may be stale)
  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

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

  function formatCurrency(val: number) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function handleCreated() {
    setShowNewModal(false)
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

      const title = isAdminOrOM ? 'All Salesman Expenses' : 'My Salesman Expenses'
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
        if (isAdminOrOM) doc.text('Salesman', 110, y)
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

      setPdfPreview({ blob: doc.output('blob'), filename: 'salesman-expenses.pdf', title: 'Salesman Expenses' })
    } catch (err) {
      console.error('PDF download failed:', err)
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2">
          <DollarSignIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Salesman Expenses</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading || expenses.length === 0}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {downloading ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
            Download
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New Expense
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {expenses.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <WalletIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No expenses yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Click &quot;+ New Expense&quot; to add your first one.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Unpaid section — expanded by default */}
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
                    showUserName={isAdminOrOM}
                    onEdit={(e) => setEditingExpense(e)}
                    onRefresh={fetchExpenses}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Paid section — collapsed by default */}
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
                      showUserName={isAdminOrOM}
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
      </div>

      {showNewModal && (
        <NewSalesmanExpenseModal
          userId={userId}
          onClose={() => setShowNewModal(false)}
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
          title="Salesman Expenses"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </div>
  )
}
