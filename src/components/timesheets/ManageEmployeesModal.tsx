'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, PencilIcon, Trash2Icon, CheckIcon, LoaderIcon } from 'lucide-react'
import { EmployeeProfile } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Portal from '@/components/ui/Portal'

interface ManageEmployeesModalProps {
  onClose: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'

export default function ManageEmployeesModal({ onClose }: ManageEmployeesModalProps) {
  const supabase = createClient()
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EmployeeProfile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .order('name', { ascending: true })
    if (error) {
      console.error('[ManageEmployees] Fetch employees failed:', error)
    }
    setEmployees((data as EmployeeProfile[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    const { error } = await supabase.from('employee_profiles').insert({ name: newName.trim() })
    if (error) {
      console.error('[ManageEmployees] Insert employee failed:', error)
    } else {
      setNewName('')
      await fetchEmployees()
    }
    setAdding(false)
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    const { error } = await supabase.from('employee_profiles').update({ name: editName.trim() }).eq('id', editingId)
    if (error) {
      console.error('[ManageEmployees] Update employee failed:', error)
    } else {
      setEditingId(null)
      setEditName('')
      await fetchEmployees()
    }
    setSavingEdit(false)
  }

  async function handleToggleActive(emp: EmployeeProfile) {
    const { error } = await supabase.from('employee_profiles').update({ is_active: !emp.is_active }).eq('id', emp.id)
    if (error) {
      console.error('[ManageEmployees] Toggle active failed:', error)
    }
    await fetchEmployees()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { data: snapshot } = await supabase.from('employee_profiles').select('*').eq('id', deleteTarget.id).single()
    if (snapshot) {
      const { data: { user } } = await supabase.auth.getUser()
      const deletedBy = user?.id ?? 'unknown'
      const { error: trashInsertError } = await supabase.from('trash_bin').insert({
        item_type: 'employee',
        item_id: deleteTarget.id,
        item_name: deleteTarget.name,
        item_data: snapshot,
        related_project: null,
        deleted_by: deletedBy,
      })
      if (trashInsertError) {
        console.error('[ManageEmployees] Trash insert failed:', trashInsertError)
      }
      const { error: deleteError } = await supabase.from('employee_profiles').delete().eq('id', deleteTarget.id)
      if (deleteError) {
        console.error('[ManageEmployees] Delete employee failed:', deleteError)
      }
    } else {
      console.error('[ManageEmployees] Snapshot employee failed')
    }
    setDeleteTarget(null)
    setDeleting(false)
    await fetchEmployees()
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Manage Employees</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
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
                        className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(emp)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
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
          message={`Are you sure you want to delete "${deleteTarget.name}"? It will be moved to the trash bin and can be restored within 30 days.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
    </Portal>
  )
}
