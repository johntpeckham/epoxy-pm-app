'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UsersIcon, MailIcon, Loader2Icon, CheckIcon, PencilIcon, XIcon, CameraIcon, Trash2Icon, LockIcon, UserPlusIcon } from 'lucide-react'
import type { UserRole } from '@/types'

interface UserRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  email?: string
  email_confirmed_at?: string | null
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'crew', label: 'Crew' },
]

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  salesman: 'bg-blue-100 text-blue-700',
  foreman: 'bg-amber-100 text-amber-700',
  crew: 'bg-gray-100 text-gray-600',
}

export default function UserManagement({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add user state
  const [addEmail, setAddEmail] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState<UserRole>('crew')
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit modal state
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('crew')
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // Change password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/list-users')
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to fetch users')
        setLoading(false)
        return
      }

      setUsers(result.users as UserRow[])
    } catch {
      setError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  function openEditModal(user: UserRow) {
    setEditingUser(user)
    setEditDisplayName(user.display_name ?? '')
    setEditRole(user.role)
    setEditAvatarUrl(user.avatar_url)
    setEditError(null)
    setShowDeleteConfirm(false)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSuccess(false)
    setPasswordError(null)
  }

  function closeEditModal() {
    setEditingUser(null)
    setEditError(null)
    setShowDeleteConfirm(false)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordSuccess(false)
    setPasswordError(null)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editingUser) return

    setAvatarUploading(true)
    setEditError(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `${editingUser.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setEditAvatarUrl(data.publicUrl)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveEdit() {
    if (!editingUser) return
    setEditSaving(true)
    setEditError(null)

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: editingUser.id,
          display_name: editDisplayName.trim() || null,
          role: editRole,
          avatar_url: editAvatarUrl,
          updated_at: new Date().toISOString(),
        })

      if (updateError) throw updateError

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, display_name: editDisplayName.trim() || null, role: editRole, avatar_url: editAvatarUrl }
            : u
        )
      )
      closeEditModal()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!editingUser) return
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setPasswordSaving(true)

    try {
      const res = await fetch('/api/update-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: editingUser.id, new_password: newPassword }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to update password')

      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleDeleteUser() {
    if (!editingUser) return
    setDeleting(true)
    setEditError(null)

    try {
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: editingUser.id }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to delete user')

      setUsers((prev) => prev.filter((u) => u.id !== editingUser.id))
      closeEditModal()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddUser() {
    if (!addEmail.trim() || !addDisplayName.trim() || !addPassword) return
    setAdding(true)
    setAddError(null)
    setAddSuccess(false)

    if (addPassword.length < 8) {
      setAddError('Password must be at least 8 characters')
      setAdding(false)
      return
    }

    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim(),
          password: addPassword,
          display_name: addDisplayName.trim(),
          role: addRole,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to create user')

      // Add the new user to the list
      if (result.user) {
        setUsers((prev) => [...prev, result.user as UserRow])
      }

      setAddEmail('')
      setAddDisplayName('')
      setAddPassword('')
      setAddRole('crew')
      setAddSuccess(true)
      setTimeout(() => setAddSuccess(false), 3000)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <UsersIcon className="w-5 h-5 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">User Management</h2>
      </div>
      <p className="text-xs text-gray-400 mb-5">Manage user roles and add new team members.</p>

      {/* Add New User Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <div className="flex items-center gap-1.5 mb-3">
          <UserPlusIcon className="w-3.5 h-3.5 text-gray-500" />
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Add New User
          </h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="Email"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
              />
            </div>
            <input
              type="text"
              value={addDisplayName}
              onChange={(e) => setAddDisplayName(e.target.value)}
              placeholder="Display Name"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              placeholder="Password (min 8 chars)"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddUser}
            disabled={adding || !addEmail.trim() || !addDisplayName.trim() || !addPassword}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            {addSuccess ? (
              <>
                <CheckIcon className="w-4 h-4" />
                User Created
              </>
            ) : adding ? (
              'Creating...'
            ) : (
              'Add User'
            )}
          </button>
        </div>
        {addError && <p className="text-xs text-red-500 mt-2">{addError}</p>}
        {addSuccess && <p className="text-xs text-green-600 mt-2">User created successfully!</p>}
      </div>

      {/* User List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-500">
                      {(user.display_name || user.email || '?')[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.display_name || user.email || 'Unnamed User'}
                    {user.id === currentUserId && (
                      <span className="text-xs text-gray-400 ml-1.5">(you)</span>
                    )}
                  </p>
                  {user.email && user.display_name && (
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE_COLORS[user.role]}`}>
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </span>
                {user.id !== currentUserId && (
                  <button
                    onClick={() => openEditModal(user)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No users found.</p>
          )}
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={closeEditModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Edit User</h3>
              <button
                onClick={closeEditModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto space-y-5">
              {/* Avatar */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                      {editAvatarUrl ? (
                        <img
                          src={editAvatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold text-gray-500">
                          {(editingUser.display_name || editingUser.email || '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                    >
                      <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </div>
                  <div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="text-sm font-medium text-amber-600 hover:text-amber-700 transition"
                    >
                      {avatarUploading ? 'Uploading...' : 'Upload photo'}
                    </button>
                    <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, or GIF</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label htmlFor="edit-display-name" className="block text-xs font-medium text-gray-500 mb-1">
                  Display Name
                </label>
                <input
                  id="edit-display-name"
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                />
              </div>

              {/* Role */}
              <div>
                <label htmlFor="edit-role" className="block text-xs font-medium text-gray-500 mb-1">
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition bg-white"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <p className="text-sm text-gray-900 px-4 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  {editingUser.email || 'No email'}
                </p>
              </div>

              {editError && <p className="text-xs text-red-500">{editError}</p>}

              {/* Change Password — only for admins */}
              {users.find((u) => u.id === currentUserId)?.role === 'admin' && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 mb-3">
                    <LockIcon className="w-3.5 h-3.5 text-gray-400" />
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Change Password</h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="new-password" className="block text-xs font-medium text-gray-500 mb-1">
                        New Password
                      </label>
                      <input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-500 mb-1">
                        Confirm Password
                      </label>
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                      />
                    </div>
                    <button
                      onClick={handleChangePassword}
                      disabled={passwordSaving || !newPassword || !confirmPassword}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                    >
                      {passwordSuccess ? (
                        <>
                          <CheckIcon className="w-3.5 h-3.5" />
                          Password Updated
                        </>
                      ) : passwordSaving ? (
                        'Updating...'
                      ) : (
                        'Update Password'
                      )}
                    </button>
                    {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                    {passwordSuccess && <p className="text-xs text-green-600">Password updated successfully!</p>}
                  </div>
                </div>
              )}

              {/* Delete User */}
              <div className="pt-3 border-t border-gray-100">
                {showDeleteConfirm ? (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs text-red-700 mb-3">
                      Are you sure you want to delete this user? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteUser}
                        disabled={deleting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                      >
                        {deleting ? 'Deleting...' : 'Yes, Delete User'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deleting}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition"
                  >
                    <Trash2Icon className="w-3.5 h-3.5" />
                    Delete User
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
