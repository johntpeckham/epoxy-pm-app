'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, PencilIcon, Trash2Icon, CheckIcon, LoaderIcon } from 'lucide-react'
import { Employee } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ManageEmployeesModalProps {
  onClose: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

export default function ManageEmployeesModal({ onClose }: ManageEmployeesModalProps) {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name', { ascending: true })
    if (error) {
      console.error('[ManageEmployees] Fetch employees failed:', error)
      console.error('[ManageEmployees] Fetch error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    }
    setEmployees((data as Employee[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const { error } = await supabase.from('employees').insert({ name: newName.trim() })
    if (error) {
      console.error('[ManageEmployees] Insert employee failed:', error)
      console.error('[ManageEmployees] Error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    } else {
      setNewName('')
      await fetchEmployees()
    }
    setAdding(false)
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    const { error } = await supabase.from('employees').update({ name: editName.trim() }).eq('id', editingId)
    if (error) {
      console.error('[ManageEmployees] Update employee failed:', error)
      console.error('[ManageEmployees] Error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    } else {
      setEditingId(null)
      setEditName('')
      await fetchEmployees()
    }
    setSavingEdit(false)
  }

  async function handleToggleActive(emp: Employee) {
    const { error } = await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id)
    if (error) {
      console.error('[ManageEmployees] Toggle active failed:', error)
      console.error('[ManageEmployees] Error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    }
    await fetchEmployees()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('employees').delete().eq('id', deleteTarget.id)
    if (error) {
      console.error('[ManageEmployees] Delete employee failed:', error)
      console.error('[ManageEmployees] Error details — code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint)
    }
    setDeleteTarget(null)
    setDeleting(false)
    await fetchEmployees()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Manage Employees</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {/* Add new employee */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Add new employee..."
              className={inputCls}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="flex-shrink-0 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
            >
              {adding ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
            </button>
          </div>

          {/* Employee list */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <LoaderIcon className="w-5 h-5 text-amber-500 animate-spin" />
            </div>
          ) : employees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No employees yet. Add one above.</p>
          ) : (
            <div className="space-y-1">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                    emp.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'
                  }`}
                >
                  {editingId === emp.id ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
                        className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md transition"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 text-sm font-medium ${emp.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                        {emp.name}
                      </span>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className={`px-2 py-1 rounded-md text-xs font-medium border transition ${
                          emp.is_active
                            ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                            : 'border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => { setEditingId(emp.id); setEditName(emp.name) }}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(emp)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Employee"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
