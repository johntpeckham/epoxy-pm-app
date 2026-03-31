'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon,
  XIcon,
  CameraIcon,
  ClipboardListIcon,
  FileTextIcon,
  PlusIcon,
  CheckSquareIcon,
  ShieldIcon,
  LoaderIcon,
  SettingsIcon,
  ReceiptIcon,
  ClockIcon,
  DollarSignIcon,
  CheckIcon,
} from 'lucide-react'
import { Project, TaskStatus, Profile, JsaTaskTemplate, JsaTaskEntry, JsaSignatureEntry, ReceiptCategory, ExpenseCategory, EmployeeProfile, TimecardEntry } from '@/types'
import { fetchWeatherForAddress } from '@/lib/fetchWeather'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import JsaTemplateManagerModal from '@/components/jsa-reports/JsaTemplateManagerModal'
import JsaSignatureSection from '@/components/jsa-reports/JsaSignatureSection'


type Mode = 'text' | 'photo' | 'daily_report' | 'task' | 'pdf' | 'jsa_report' | 'receipt' | 'expense' | 'timecard'

interface AddPostPanelProps {
  project: Project
  userId: string
  onPosted: () => void
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string; activeColor: string }[] = [
  { value: 'new_task', label: 'New Task', color: 'border-blue-300 text-blue-700 bg-blue-50', activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'in_progress', label: 'In Progress', color: 'border-yellow-300 text-yellow-700 bg-yellow-50', activeColor: 'border-yellow-500 bg-yellow-500 text-white' },
  { value: 'completed', label: 'Completed', color: 'border-green-300 text-green-700 bg-green-50', activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'unable_to_complete', label: 'Unable to Complete', color: 'border-red-300 text-red-700 bg-red-50', activeColor: 'border-red-500 bg-red-500 text-white' },
]

export default function AddPostPanel({ project, userId, onPosted }: AddPostPanelProps) {
  const [mode, setMode] = useState<Mode>('text')
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Permissions ──────────────────────────────────────────────────────────────
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)

  // ── Text post ──────────────────────────────────────────────────────────────
  const [message, setMessage] = useState('')

  // ── Photo post ─────────────────────────────────────────────────────────────
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Daily report ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const [rProjectName, setRProjectName] = useState(project.name)
  const [rDate, setRDate] = useState(today)
  const [rAddress, setRAddress] = useState(project.address)
  const [rReportedBy, setRReportedBy] = useState('')
  const [rForeman, setRForeman] = useState('')
  const [rWeather, setRWeather] = useState('')
  const [rWeatherLoading, setRWeatherLoading] = useState(false)
  const [rProgress, setRProgress] = useState('')
  const [rDelays, setRDelays] = useState('')
  const [rSafety, setRSafety] = useState('')
  const [rMaterials, setRMaterials] = useState('')
  const [rSelectedEmployees, setRSelectedEmployees] = useState<string[]>([])
  const [rShowCustomEmployeeInput, setRShowCustomEmployeeInput] = useState(false)
  const [rCustomEmployeeName, setRCustomEmployeeName] = useState('')
  const [rFiles, setRFiles] = useState<File[]>([])
  const [rPreviews, setRPreviews] = useState<string[]>([])
  const reportPhotoInputRef = useRef<HTMLInputElement>(null)

  // Employee profiles for daily report & timecard pill selectors
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([])
  const [employeeProfilesLoaded, setEmployeeProfilesLoaded] = useState(false)

  // ── Task ─────────────────────────────────────────────────────────────────
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskAssignedTo, setTaskAssignedTo] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('new_task')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPhotoFile, setTaskPhotoFile] = useState<File | null>(null)
  const [taskPhotoPreview, setTaskPhotoPreview] = useState<string | null>(null)
  const taskPhotoInputRef = useRef<HTMLInputElement>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  // ── PDF post ──────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfCaption, setPdfCaption] = useState('')
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // ── JSA Report ──────────────────────────────────────────────────────────
  const [jsaProjectName, setJsaProjectName] = useState(project.name)
  const [jsaDate, setJsaDate] = useState(today)
  const [jsaAddress, setJsaAddress] = useState(project.address)
  const [jsaWeather, setJsaWeather] = useState('')
  const [jsaWeatherLoading, setJsaWeatherLoading] = useState(false)
  const [jsaPreparedBy, setJsaPreparedBy] = useState('')
  const [jsaSiteSupervisor, setJsaSiteSupervisor] = useState('')
  const [jsaCompetentPerson, setJsaCompetentPerson] = useState('')
  const [jsaTemplates, setJsaTemplates] = useState<JsaTaskTemplate[]>([])
  const [jsaTemplatesLoaded, setJsaTemplatesLoaded] = useState(false)
  const [jsaSelectedTasks, setJsaSelectedTasks] = useState<Record<string, JsaTaskEntry>>({})
  const [jsaSignatures, setJsaSignatures] = useState<JsaSignatureEntry[]>([])
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  // ── Receipt ──────────────────────────────────────────────────────────────
  const RECEIPT_CATEGORIES: ReceiptCategory[] = ['Materials', 'Fuel', 'Tools', 'Equipment Rental', 'Subcontractor', 'Office Supplies', 'Other']
  const [rcptVendor, setRcptVendor] = useState('')
  const [rcptDate, setRcptDate] = useState(today)
  const [rcptAmount, setRcptAmount] = useState('')
  const [rcptCategory, setRcptCategory] = useState<ReceiptCategory | ''>('')
  const [rcptPhotoFile, setRcptPhotoFile] = useState<File | null>(null)
  const [rcptPhotoPreview, setRcptPhotoPreview] = useState<string | null>(null)
  const rcptPhotoInputRef = useRef<HTMLInputElement>(null)

  // ── Expense ──────────────────────────────────────────────────────────────
  const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Materials', 'Labor', 'Equipment', 'Subcontractor', 'Other']
  const [expDescription, setExpDescription] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expCategory, setExpCategory] = useState<ExpenseCategory | ''>('')
  const [expDate, setExpDate] = useState(today)
  const [expNotes, setExpNotes] = useState('')
  const [expAttachmentFile, setExpAttachmentFile] = useState<File | null>(null)
  const [expAttachmentPreview, setExpAttachmentPreview] = useState<string | null>(null)
  const expAttachmentInputRef = useRef<HTMLInputElement>(null)

  function handleExpAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExpAttachmentFile(file)
    if (file.type.startsWith('image/')) {
      setExpAttachmentPreview(URL.createObjectURL(file))
    } else {
      setExpAttachmentPreview(null)
    }
    e.target.value = ''
  }

  function removeExpAttachment() {
    setExpAttachmentFile(null)
    setExpAttachmentPreview(null)
  }

  // ── Timecard ──────────────────────────────────────────────────────────────
  const [tcProjectName, setTcProjectName] = useState(project.name)
  const [tcDate, setTcDate] = useState(today)
  const [tcAddress, setTcAddress] = useState(project.address)
  const [tcEntries, setTcEntries] = useState<TimecardEntry[]>([])
  const [tcShowCustomInput, setTcShowCustomInput] = useState(false)
  const [tcCustomName, setTcCustomName] = useState('')

  const LUNCH_OPTIONS = [0, 15, 30, 45, 60]

  function calcHours(timeIn: string, timeOut: string, lunchMinutes: number): number {
    if (!timeIn || !timeOut) return 0
    const [inH, inM] = timeIn.split(':').map(Number)
    const [outH, outM] = timeOut.split(':').map(Number)
    const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM) - lunchMinutes
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100)
  }

  function tcGrandTotal(): number {
    return Math.round(tcEntries.reduce((s, e) => s + e.total_hours, 0) * 100) / 100
  }

  function tcToggleEmployee(name: string) {
    setTcEntries((prev) => {
      const exists = prev.some((e) => e.employee_name === name)
      if (exists) return prev.filter((e) => e.employee_name !== name)
      return [...prev, { employee_name: name, time_in: '07:00', time_out: '15:30', lunch_minutes: 30, total_hours: 8 }]
    })
  }

  function tcAddCustomEmployee() {
    const name = tcCustomName.trim()
    if (!name) return
    if (!tcEntries.some((e) => e.employee_name === name)) {
      setTcEntries((prev) => [...prev, { employee_name: name, time_in: '07:00', time_out: '15:30', lunch_minutes: 30, total_hours: 8 }])
    }
    setTcCustomName('')
    setTcShowCustomInput(false)
  }

  function tcUpdateEntry(idx: number, field: keyof TimecardEntry, value: string | number) {
    setTcEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e
        const updated = { ...e, [field]: value }
        updated.total_hours = calcHours(updated.time_in, updated.time_out, updated.lunch_minutes)
        return updated
      })
    )
  }

  function tcRemoveEntry(idx: number) {
    setTcEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  function rToggleEmployee(name: string) {
    setRSelectedEmployees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  function rAddCustomEmployee() {
    const name = rCustomEmployeeName.trim()
    if (!name) return
    if (!rSelectedEmployees.includes(name)) {
      setRSelectedEmployees((prev) => [...prev, name])
    }
    setRCustomEmployeeName('')
    setRShowCustomEmployeeInput(false)
  }

  // Fetch employee profiles when daily_report or timecard mode activates
  useEffect(() => {
    if ((mode === 'timecard' || mode === 'daily_report') && !employeeProfilesLoaded) {
      const supabase = createClient()
      supabase
        .from('employee_profiles')
        .select('*')
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error('[AddPostPanel] Fetch employee_profiles failed:', error)
          }
          setEmployeeProfiles((data as EmployeeProfile[]) ?? [])
          setEmployeeProfilesLoaded(true)
        })
    }
  }, [mode, employeeProfilesLoaded])

  // Fetch JSA templates when mode activates
  useEffect(() => {
    if (mode === 'jsa_report' && !jsaTemplatesLoaded) {
      const supabase = createClient()
      supabase
        .from('jsa_task_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .then(({ data }) => {
          setJsaTemplates((data as JsaTaskTemplate[]) ?? [])
          setJsaTemplatesLoaded(true)
        })
    }
  }, [mode, jsaTemplatesLoaded])

  // Auto-fetch weather when Daily Report mode activates
  useEffect(() => {
    if (mode === 'daily_report' && !rWeather && project.address) {
      setRWeatherLoading(true)
      fetchWeatherForAddress(project.address).then((w) => {
        if (w) setRWeather(w)
        setRWeatherLoading(false)
      })
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch weather when JSA mode activates
  useEffect(() => {
    if (mode === 'jsa_report' && !jsaWeather && project.address) {
      setJsaWeatherLoading(true)
      fetchWeatherForAddress(project.address).then((w) => {
        if (w) setJsaWeather(w)
        setJsaWeatherLoading(false)
      })
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleJsaTask(template: JsaTaskTemplate) {
    setJsaSelectedTasks((prev) => {
      const next = { ...prev }
      if (next[template.id]) {
        delete next[template.id]
      } else {
        next[template.id] = {
          templateId: template.id,
          name: template.name,
          hazards: template.default_hazards ?? '',
          precautions: template.default_precautions ?? '',
          ppe: template.default_ppe ?? '',
        }
      }
      return next
    })
  }

  function updateJsaTask(templateId: string, field: keyof JsaTaskEntry, value: string) {
    setJsaSelectedTasks((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [field]: value },
    }))
  }

  // Fetch profiles when task mode is activated
  useEffect(() => {
    if (mode === 'task' && !profilesLoaded) {
      const supabase = createClient()
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, updated_at')
        .then(({ data }) => {
          setProfiles((data as Profile[]) ?? [])
          setProfilesLoaded(true)
        })
    }
  }, [mode, profilesLoaded])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  function selectMode(m: Mode) {
    setMode(m)
    setShowMenu(false)
    setError(null)
  }

  function cancelMode() {
    setMode('text')
    setError(null)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setPhotoFiles((p) => [...p, ...selected])
    setPhotoPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removePhoto(i: number) {
    setPhotoFiles((p) => p.filter((_, idx) => idx !== i))
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  function handleReportPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setRFiles((p) => [...p, ...selected])
    setRPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
  }

  function removeReportPhoto(i: number) {
    setRFiles((p) => p.filter((_, idx) => idx !== i))
    setRPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  function handleTaskPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setTaskPhotoFile(file)
    setTaskPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeTaskPhoto() {
    setTaskPhotoFile(null)
    setTaskPhotoPreview(null)
  }

  function handleRcptPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRcptPhotoFile(file)
    setRcptPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeRcptPhoto() {
    setRcptPhotoFile(null)
    setRcptPhotoPreview(null)
  }

  // ── Upload helper ──────────────────────────────────────────────────────────
  async function uploadFiles(files: File[], folder: string): Promise<string[]> {
    const supabase = createClient()
    const paths: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${project.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: err } = await supabase.storage.from('post-photos').upload(path, file)
      if (err) {
        console.error('[AddPostPanel] Upload failed:', {
          message: err.message,
          name: err.name,
          error: err,
        })
        throw err
      }
      paths.push(path)
    }
    return paths
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (mode === 'text') {
        if (!message.trim()) throw new Error('Please enter a message')
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'text',
          content: { message: message.trim() },
          is_pinned: false,
        })
        setMessage('')
      }

      if (mode === 'photo') {
        if (!photoFiles.length) throw new Error('Please select at least one photo')
        const paths = await uploadFiles(photoFiles, 'photos')
        const { error: photoInsertErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'photo',
          content: { photos: paths, caption: caption.trim() || undefined },
          is_pinned: false,
        })
        if (photoInsertErr) {
          console.error('[AddPostPanel] Photo insert failed:', photoInsertErr)
          throw photoInsertErr
        }
        setPhotoFiles([])
        setPhotoPreviews([])
        setCaption('')
        if (photoInputRef.current) photoInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'daily_report') {
        const photoPaths = rFiles.length ? await uploadFiles(rFiles, 'reports') : []
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'daily_report',
          content: {
            project_name: rProjectName.trim(),
            date: rDate,
            address: rAddress.trim(),
            reported_by: rReportedBy.trim(),
            project_foreman: rForeman.trim(),
            weather: rWeather.trim(),
            progress: rProgress.trim(),
            delays: rDelays.trim(),
            safety: rSafety.trim(),
            materials_used: rMaterials.trim(),
            employees: rSelectedEmployees.join(', '),
            photos: photoPaths,
          },
          is_pinned: false,
        })
        setRDate(new Date().toISOString().split('T')[0])
        setRReportedBy('')
        setRForeman('')
        setRWeather('')
        setRProgress('')
        setRDelays('')
        setRSafety('')
        setRMaterials('')
        setRSelectedEmployees([])
        setRFiles([])
        setRPreviews([])
        if (reportPhotoInputRef.current) reportPhotoInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'task') {
        if (!taskTitle.trim()) throw new Error('Please enter a task title')

        let photoUrl: string | null = null
        if (taskPhotoFile) {
          const paths = await uploadFiles([taskPhotoFile], 'tasks')
          photoUrl = paths[0]
        }

        const { data: taskData, error: insertErr } = await supabase.from('tasks').insert({
          project_id: project.id,
          created_by: userId,
          assigned_to: taskAssignedTo || null,
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          status: taskStatus,
          photo_url: photoUrl,
          due_date: taskDueDate || null,
        }).select().single()
        if (insertErr) throw insertErr

        // Also create a feed post so the task appears in the chat feed
        const { error: feedPostErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'task',
          content: {
            task_id: taskData.id,
            title: taskData.title,
            description: taskData.description,
            status: taskData.status,
            assigned_to: taskData.assigned_to,
            due_date: taskData.due_date,
            photo_url: taskData.photo_url,
          },
          is_pinned: false,
        })
        if (feedPostErr) {
          console.error('[AddPostPanel] feed_posts insert failed:', feedPostErr)
          throw feedPostErr
        }
        // Send notification to assigned user
        if (taskAssignedTo) {
          const creatorProfile = profiles.find((p) => p.id === userId)
          const creatorName = creatorProfile?.display_name || 'Someone'
          const { error: notifErr } = await supabase.from('notifications').insert({
            user_id: taskAssignedTo,
            type: 'task_assigned',
            title: 'New task assigned',
            message: `${creatorName} assigned you: ${taskTitle.trim()}`,
            link: '/tasks',
          })
          if (notifErr) console.error('[AddPostPanel] Notification insert failed:', notifErr)
        }

        setTaskTitle('')
        setTaskDescription('')
        setTaskAssignedTo('')
        setTaskStatus('new_task')
        setTaskDueDate('')
        setTaskPhotoFile(null)
        setTaskPhotoPreview(null)
        setMode('text')
      }

      if (mode === 'pdf') {
        if (!pdfFile) throw new Error('Please select a PDF file')
        const paths = await uploadFiles([pdfFile], 'pdfs')
        const { error: pdfInsertErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'pdf',
          content: { file_url: paths[0], filename: pdfFile.name, caption: pdfCaption.trim() || undefined },
          is_pinned: false,
        })
        if (pdfInsertErr) {
          console.error('[AddPostPanel] PDF insert failed:', pdfInsertErr)
          throw pdfInsertErr
        }
        setPdfFile(null)
        setPdfCaption('')
        if (pdfInputRef.current) pdfInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'jsa_report') {
        const tasks = Object.values(jsaSelectedTasks)
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'jsa_report',
          content: {
            projectName: jsaProjectName.trim(),
            date: jsaDate,
            address: jsaAddress.trim(),
            weather: jsaWeather.trim(),
            preparedBy: jsaPreparedBy.trim(),
            siteSupervisor: jsaSiteSupervisor.trim(),
            competentPerson: jsaCompetentPerson.trim(),
            tasks,
            signatures: jsaSignatures,
          },
          is_pinned: false,
        })
        setJsaDate(new Date().toISOString().split('T')[0])
        setJsaWeather('')
        setJsaPreparedBy('')
        setJsaSiteSupervisor('')
        setJsaCompetentPerson('')
        setJsaSelectedTasks({})
        setJsaSignatures([])
        setMode('text')
      }

      if (mode === 'receipt') {
        const amount = rcptAmount.trim() ? parseFloat(rcptAmount) : 0
        if (rcptAmount.trim() && (isNaN(amount) || amount < 0)) throw new Error('Please enter a valid amount')

        let photoPath = ''
        if (rcptPhotoFile) {
          const paths = await uploadFiles([rcptPhotoFile], 'receipts')
          photoPath = paths[0]
        }
        const { error: receiptErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'receipt',
          content: {
            receipt_photo: photoPath,
            vendor_name: rcptVendor.trim(),
            receipt_date: rcptDate,
            total_amount: amount,
            category: rcptCategory,
          },
          is_pinned: false,
        })
        if (receiptErr) {
          console.error('[AddPostPanel] Receipt insert failed:', receiptErr)
          throw receiptErr
        }
        setRcptVendor('')
        setRcptDate(new Date().toISOString().split('T')[0])
        setRcptAmount('')
        setRcptCategory('')
        setRcptPhotoFile(null)
        setRcptPhotoPreview(null)
        if (rcptPhotoInputRef.current) rcptPhotoInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'expense') {
        if (!expDescription.trim()) throw new Error('Please enter a description')
        const amount = expAmount.trim() ? parseFloat(expAmount) : 0
        if (!expAmount.trim() || isNaN(amount) || amount < 0) throw new Error('Please enter a valid amount')
        if (!expDate) throw new Error('Please select a date')

        let attachmentPath = ''
        if (expAttachmentFile) {
          const paths = await uploadFiles([expAttachmentFile], 'expenses')
          attachmentPath = paths[0]
        }
        const { error: expenseErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'expense',
          content: {
            description: expDescription.trim(),
            amount,
            category: expCategory,
            date: expDate,
            notes: expNotes.trim(),
            attachment: attachmentPath,
          },
          is_pinned: false,
        })
        if (expenseErr) {
          console.error('[AddPostPanel] Expense insert failed:', expenseErr)
          throw expenseErr
        }
        setExpDescription('')
        setExpAmount('')
        setExpCategory('')
        setExpDate(new Date().toISOString().split('T')[0])
        setExpNotes('')
        setExpAttachmentFile(null)
        setExpAttachmentPreview(null)
        if (expAttachmentInputRef.current) expAttachmentInputRef.current.value = ''
        setMode('text')
      }

      if (mode === 'timecard') {
        const validEntries = tcEntries.filter((e) => e.employee_name.trim() && e.time_in && e.time_out)

        if (validEntries.length === 0) throw new Error('Please add at least one employee with time entries')

        const grandTotal = validEntries.reduce((s, e) => s + e.total_hours, 0)

        const { error: timecardErr } = await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'timecard',
          content: {
            date: tcDate,
            project_name: tcProjectName.trim(),
            address: tcAddress.trim(),
            entries: validEntries,
            grand_total_hours: Math.round(grandTotal * 100) / 100,
          },
          is_pinned: false,
        })
        if (timecardErr) {
          console.error('[AddPostPanel] Timecard insert failed:', timecardErr)
          throw timecardErr
        }

        setTcDate(new Date().toISOString().split('T')[0])
        setTcEntries([])
        setMode('text')
      }

      onPosted()
    } catch (err: unknown) {
      console.error('[AddPostPanel] Submit failed:', err)
      let msg = 'Failed to post'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-none bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] safe-bottom">

      {/* Error toast */}
      {error && (
        <div className="px-4 pt-3">
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for photo uploads — always in DOM so it can be triggered immediately */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* ── Photo upload thumbnail strip ────────────────────────────────────── */}
      {mode === 'photo' && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Photos</p>
            <button onClick={cancelMode} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {photoPreviews.map((url, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100"
              >
                {photoFiles[i] && isPdf(photoFiles[i]) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                    <FileTextIcon className="w-5 h-5 text-red-400" />
                    <span className="text-[10px] text-red-400 font-medium mt-0.5">PDF</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-amber-400 hover:text-amber-500 transition"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Add</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Daily report expanded form ──────────────────────────────────────── */}
      {mode === 'daily_report' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Daily Report</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Header */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Header</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={rProjectName} onChange={(e) => setRProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 overflow-hidden">
                <div className="min-w-0 w-1/2 sm:w-full">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={`${inputCls} min-w-0 max-w-full`} style={{ maxWidth: '100%' }} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={rAddress} onChange={(e) => setRAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* Crew */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Crew</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Reported By</label>
                <input type="text" value={rReportedBy} onChange={(e) => setRReportedBy(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Project Foreman</label>
                <input type="text" value={rForeman} onChange={(e) => setRForeman(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <div className="relative">
                  <input type="text" value={rWeather} onChange={(e) => setRWeather(e.target.value)} placeholder={rWeatherLoading ? 'Fetching weather...' : 'e.g. 72°F, Partly Cloudy, Wind 8 mph'} className={inputCls} />
                  {rWeatherLoading && (
                    <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Progress</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Progress</label>
                <textarea rows={3} value={rProgress} onChange={(e) => setRProgress(e.target.value)} placeholder="Describe work completed today..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Delays</label>
                <textarea rows={2} value={rDelays} onChange={(e) => setRDelays(e.target.value)} placeholder="Any delays or issues..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Safety</label>
                <textarea rows={2} value={rSafety} onChange={(e) => setRSafety(e.target.value)} placeholder="Safety observations, incidents, PPE notes..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Materials Used</label>
                <textarea rows={2} value={rMaterials} onChange={(e) => setRMaterials(e.target.value)} placeholder="Epoxy products, quantities, other materials..." className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Employees</label>
                <div className="flex flex-wrap gap-2">
                  {employeeProfiles.map((emp) => {
                    const isSelected = rSelectedEmployees.includes(emp.name)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => rToggleEmployee(emp.name)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {emp.name}
                      </button>
                    )
                  })}
                  {rSelectedEmployees
                    .filter((name) => !employeeProfiles.some((emp) => emp.name === name))
                    .map((name) => (
                      <button
                        key={`custom-${name}`}
                        type="button"
                        onClick={() => rToggleEmployee(name)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors bg-gray-900 text-white border-gray-900"
                      >
                        {name}
                      </button>
                    ))}
                  {rShowCustomEmployeeInput ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={rCustomEmployeeName}
                        onChange={(e) => setRCustomEmployeeName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') rAddCustomEmployee(); if (e.key === 'Escape') { setRShowCustomEmployeeInput(false); setRCustomEmployeeName('') } }}
                        placeholder="Name"
                        className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button type="button" onClick={rAddCustomEmployee} className="text-green-600 hover:text-green-700 p-0.5">
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { setRShowCustomEmployeeInput(false); setRCustomEmployeeName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRShowCustomEmployeeInput(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Employee
                    </button>
                  )}
                  {employeeProfiles.length === 0 && !rShowCustomEmployeeInput && employeeProfilesLoaded && (
                    <p className="text-xs text-gray-400">No employees found. Add employees in Employee Management.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Photos */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
            <div
              onClick={() => reportPhotoInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
            >
              <CameraIcon className="w-4 h-4 text-gray-400 mx-auto mb-1" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-amber-600">Add photos or PDFs</span> to this report
              </p>
              <input
                ref={reportPhotoInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                className="hidden"
                onChange={handleReportPhotoChange}
              />
            </div>

            {rPreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {rPreviews.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    {rFiles[i] && isPdf(rFiles[i]) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                        <FileTextIcon className="w-6 h-6 text-red-400" />
                        <span className="text-[10px] text-red-400 font-medium mt-0.5">PDF</span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeReportPhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Daily Report'}
            </button>
          </div>
        </div>
      )}

      {/* ── Task creation form ────────────────────────────────────────────────── */}
      {mode === 'task' && (
        <div className="px-4 pt-3 pb-2 max-h-[52vh] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">New Task</p>
            <button onClick={cancelMode} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Title */}
          <div>
            <label className={labelCls}>Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title..."
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              rows={3}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Task details..."
              className={textareaCls}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Assign To */}
            <div>
              <label className={labelCls}>Assign To</label>
              <select
                value={taskAssignedTo}
                onChange={(e) => setTaskAssignedTo(e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="min-w-0 w-1/2 sm:w-full">
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className={`${inputCls} min-w-0`}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTaskStatus(opt.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition ${
                    taskStatus === opt.value ? opt.activeColor : opt.color
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div>
            <label className={labelCls}>Photo</label>
            <input
              ref={taskPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleTaskPhotoChange}
            />
            {taskPhotoPreview ? (
              <div className="relative inline-block">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={taskPhotoPreview} alt="" className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={removeTaskPhoto}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => taskPhotoInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
              >
                <CameraIcon className="w-4 h-4" />
                Add photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── JSA Report expanded form ─────────────────────────────────────────── */}
      {mode === 'jsa_report' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">JSA Report</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Base Section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Info</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={jsaProjectName} onChange={(e) => setJsaProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="min-w-0 w-1/2 sm:w-full">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={jsaDate} onChange={(e) => setJsaDate(e.target.value)} className={`${inputCls} min-w-0`} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={jsaAddress} onChange={(e) => setJsaAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Weather</label>
                <div className="relative">
                  <input
                    type="text"
                    value={jsaWeather}
                    onChange={(e) => setJsaWeather(e.target.value)}
                    placeholder={jsaWeatherLoading ? 'Fetching weather...' : 'e.g. 72°F, Partly Cloudy, Wind 8 mph'}
                    className={inputCls}
                  />
                  {jsaWeatherLoading && (
                    <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personnel */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Personnel</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Prepared By</label>
                <input type="text" value={jsaPreparedBy} onChange={(e) => setJsaPreparedBy(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Site Supervisor</label>
                <input type="text" value={jsaSiteSupervisor} onChange={(e) => setJsaSiteSupervisor(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Competent Person</label>
                <input type="text" value={jsaCompetentPerson} onChange={(e) => setJsaCompetentPerson(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Task Checkboxes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tasks</p>
              <button
                type="button"
                onClick={() => setShowTemplateManager(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition"
              >
                <SettingsIcon className="w-3 h-3" />
                Manage Tasks
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {jsaTemplates.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                    jsaSelectedTasks[t.id]
                      ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!jsaSelectedTasks[t.id]}
                    onChange={() => toggleJsaTask(t)}
                    className="sr-only"
                  />
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    jsaSelectedTasks[t.id] ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                  }`}>
                    {jsaSelectedTasks[t.id] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          {/* Dynamic Task Sections */}
          {jsaTemplates.filter((t) => jsaSelectedTasks[t.id]).map((t) => (
            <div key={t.id} className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
              <p className="text-sm font-bold text-amber-800">{t.name}</p>
              <div>
                <label className={labelCls}>Hazards</label>
                <textarea
                  rows={3}
                  value={jsaSelectedTasks[t.id]?.hazards ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'hazards', e.target.value)}
                  placeholder="Identified hazards..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>Precautions</label>
                <textarea
                  rows={3}
                  value={jsaSelectedTasks[t.id]?.precautions ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'precautions', e.target.value)}
                  placeholder="Safety precautions..."
                  className={textareaCls}
                />
              </div>
              <div>
                <label className={labelCls}>PPE Required</label>
                <textarea
                  rows={2}
                  value={jsaSelectedTasks[t.id]?.ppe ?? ''}
                  onChange={(e) => updateJsaTask(t.id, 'ppe', e.target.value)}
                  placeholder="Required PPE..."
                  className={textareaCls}
                />
              </div>
            </div>
          ))}

          {/* Employee Acknowledgment & Signatures */}
          <JsaSignatureSection onChange={setJsaSignatures} />

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit JSA Report'}
            </button>
          </div>
        </div>
      )}

      {/* ── Timecard form ────────────────────────────────────────────────────── */}
      {mode === 'timecard' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Timecard</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Header info */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Project Info</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Project Name</label>
                <input type="text" value={tcProjectName} onChange={(e) => setTcProjectName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 overflow-hidden">
                <div className="min-w-0 w-1/2 sm:w-full">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={tcDate} onChange={(e) => setTcDate(e.target.value)} className={`${inputCls} min-w-0 max-w-full`} style={{ maxWidth: '100%' }} />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input type="text" value={tcAddress} onChange={(e) => setTcAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* Employee pill selector */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Employees</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {employeeProfiles.map((emp) => {
                const isSelected = tcEntries.some((e) => e.employee_name === emp.name)
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => tcToggleEmployee(emp.name)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {emp.name}
                  </button>
                )
              })}
              {tcEntries
                .filter((e) => !employeeProfiles.some((emp) => emp.name === e.employee_name))
                .map((e) => (
                  <button
                    key={`custom-${e.employee_name}`}
                    type="button"
                    onClick={() => tcToggleEmployee(e.employee_name)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors bg-gray-900 text-white border-gray-900"
                  >
                    {e.employee_name}
                  </button>
                ))}
              {tcShowCustomInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={tcCustomName}
                    onChange={(e) => setTcCustomName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') tcAddCustomEmployee(); if (e.key === 'Escape') { setTcShowCustomInput(false); setTcCustomName('') } }}
                    placeholder="Name"
                    className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={tcAddCustomEmployee} className="text-green-600 hover:text-green-700 p-0.5">
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => { setTcShowCustomInput(false); setTcCustomName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setTcShowCustomInput(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  <PlusIcon className="w-3 h-3" />
                  Employee
                </button>
              )}
              {employeeProfiles.length === 0 && !tcShowCustomInput && employeeProfilesLoaded && (
                <p className="text-xs text-gray-400">No employees found. Add employees in Employee Management.</p>
              )}
            </div>
            <div className="space-y-2">
              {tcEntries.map((entry, idx) => (
                <div key={entry.employee_name} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => tcRemoveEntry(idx)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-gray-900">{entry.employee_name}</span>
                    {entry.total_hours > 0 && (
                      <span className="text-xs font-bold text-blue-700 tabular-nums">{entry.total_hours.toFixed(2)} hrs</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-3 gap-1.5 sm:gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time In</label>
                      <input
                        type="time"
                        value={entry.time_in}
                        onChange={(e) => tcUpdateEntry(idx, 'time_in', e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-1.5 sm:px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Time Out</label>
                      <input
                        type="time"
                        value={entry.time_out}
                        onChange={(e) => tcUpdateEntry(idx, 'time_out', e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-1.5 sm:px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="min-w-[5rem]">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Lunch</label>
                      <select
                        value={entry.lunch_minutes}
                        onChange={(e) => tcUpdateEntry(idx, 'lunch_minutes', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-md px-1.5 sm:px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {LUNCH_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m} min</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-800">Grand Total</span>
            <span className="text-lg font-bold text-blue-900 tabular-nums">{tcGrandTotal().toFixed(2)} hrs</span>
          </div>

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Timecard'}
            </button>
          </div>
        </div>
      )}

      {showTemplateManager && (
        <JsaTemplateManagerModal
          onClose={() => {
            setShowTemplateManager(false)
            // Reload templates
            setJsaTemplatesLoaded(false)
          }}
        />
      )}

      {/* ── Receipt form ────────────────────────────────────────────────────── */}
      {mode === 'receipt' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Receipt</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Receipt Photo */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Photo <span className="normal-case font-medium">(optional)</span></p>
            <input
              ref={rcptPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleRcptPhotoChange}
            />
            {rcptPhotoPreview ? (
              <div className="relative inline-block">
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={rcptPhotoPreview} alt="" className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={removeRcptPhoto}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => rcptPhotoInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
              >
                <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-amber-600">Take photo or upload</span> receipt image
                </p>
              </div>
            )}
          </div>

          {/* Receipt Details */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Vendor / Store Name</label>
                <input type="text" value={rcptVendor} onChange={(e) => setRcptVendor(e.target.value)} placeholder="e.g. Home Depot, Shell, Sunbelt Rentals" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 overflow-hidden">
                <div className="min-w-0 w-1/2 sm:w-full">
                  <label className={labelCls}>Date on Receipt</label>
                  <input type="date" value={rcptDate} onChange={(e) => setRcptDate(e.target.value)} className={`${inputCls} min-w-0 max-w-full`} style={{ maxWidth: '100%' }} />
                </div>
                <div>
                  <label className={labelCls}>Total Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rcptAmount}
                      onChange={(e) => setRcptAmount(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select
                  value={rcptCategory}
                  onChange={(e) => setRcptCategory(e.target.value as ReceiptCategory | '')}
                  className={inputCls}
                >
                  <option value="">Select a category...</option>
                  {RECEIPT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Expense'}
            </button>
          </div>
        </div>
      )}

      {/* ── Expense form ────────────────────────────────────────────────────── */}
      {mode === 'expense' && (
        <div
          className="fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-white w-full max-w-full overflow-x-hidden overscroll-none lg:static lg:z-auto lg:block lg:overscroll-auto"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Expense</h2>
            <button onClick={cancelMode} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 space-y-5 lg:flex-none lg:max-h-[52vh] lg:pt-3 lg:pb-2">

          {/* Attachment (Photo/PDF) */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photo / PDF <span className="normal-case font-medium">(optional)</span></p>
            <input
              ref={expAttachmentInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="hidden"
              onChange={handleExpAttachmentChange}
            />
            {expAttachmentFile ? (
              <div className="relative inline-block">
                {expAttachmentPreview ? (
                  <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={expAttachmentPreview} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{expAttachmentFile.name}</span>
                  </div>
                )}
                <button
                  onClick={removeExpAttachment}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => expAttachmentInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
              >
                <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-amber-600">Upload photo or PDF</span>
                </p>
              </div>
            )}
          </div>

          {/* Expense Details */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Expense Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Description *</label>
                <input type="text" value={expDescription} onChange={(e) => setExpDescription(e.target.value)} placeholder="e.g. Concrete sealer for warehouse floor" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 overflow-hidden">
                <div>
                  <label className={labelCls}>Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as ExpenseCategory | '')}
                    className={inputCls}
                  >
                    <option value="">Select a category...</option>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="min-w-0 w-1/2 sm:w-full">
                <label className={labelCls}>Date *</label>
                <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={`${inputCls} min-w-0 max-w-full`} style={{ maxWidth: '100%' }} />
              </div>
              <div>
                <label className={labelCls}>Notes <span className="normal-case font-medium">(optional)</span></label>
                <textarea rows={3} value={expNotes} onChange={(e) => setExpNotes(e.target.value)} placeholder="Additional details..." className={textareaCls} />
              </div>
            </div>
          </div>

          </div>
          {/* Mobile submit footer */}
          <div className="flex-none border-t border-gray-200 px-4 py-3 safe-bottom bg-white lg:hidden">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {loading ? <LoaderIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for PDF uploads — always in DOM so it can be triggered immediately */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setPdfFile(file)
          e.target.value = ''
        }}
      />

      {/* ── PDF upload strip (matches photo strip pattern) ─────────────────── */}
      {mode === 'pdf' && pdfFile && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">PDF Upload</p>
            <button onClick={cancelMode} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate flex-1">{pdfFile.name}</span>
            <button
              onClick={() => { setPdfFile(null); setPdfCaption(''); if (pdfInputRef.current) pdfInputRef.current.value = '' }}
              className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Composer bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">

        {/* + menu button */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              showMenu
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <PlusIcon className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-20 w-44">
                {canCreate('photos') && (
                  <button
                    onClick={() => {
                      selectMode('photo')
                      // Immediately open native file picker — no intermediate step
                      setTimeout(() => photoInputRef.current?.click(), 0)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'photo'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <CameraIcon className="w-4 h-4 flex-shrink-0" />
                    Upload Photos
                  </button>
                )}
                {canCreate('daily_reports') && (
                  <button
                    onClick={() => selectMode('daily_report')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'daily_report'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ClipboardListIcon className="w-4 h-4 flex-shrink-0" />
                    Daily Report
                  </button>
                )}
                {canCreate('jsa_reports') && (
                  <button
                    onClick={() => selectMode('jsa_report')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'jsa_report'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShieldIcon className="w-4 h-4 flex-shrink-0" />
                    JSA Report
                  </button>
                )}
                {canCreate('receipts') && (
                  <button
                    onClick={() => selectMode('receipt')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'receipt'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ReceiptIcon className="w-4 h-4 flex-shrink-0" />
                    Receipt
                  </button>
                )}
                {canCreate('receipts') && (
                  <button
                    onClick={() => selectMode('expense')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'expense'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <DollarSignIcon className="w-4 h-4 flex-shrink-0" />
                    Expense
                  </button>
                )}
                {canCreate('timesheets') && (
                  <button
                    onClick={() => selectMode('timecard')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'timecard'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ClockIcon className="w-4 h-4 flex-shrink-0" />
                    Timecard
                  </button>
                )}
                {canCreate('tasks') && (
                  <button
                    onClick={() => selectMode('task')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      mode === 'task'
                        ? 'text-amber-600 bg-amber-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <CheckSquareIcon className="w-4 h-4 flex-shrink-0" />
                    Task
                  </button>
                )}
                <button
                  onClick={() => {
                    selectMode('pdf')
                    // Immediately open native file picker — no intermediate step
                    setTimeout(() => pdfInputRef.current?.click(), 0)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    mode === 'pdf'
                      ? 'text-amber-600 bg-amber-50 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FileTextIcon className="w-4 h-4 flex-shrink-0" />
                  PDF
                </button>
              </div>
            </>
          )}
        </div>

        {/* Input area */}
        {mode === 'text' && (
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Write a message..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
          />
        )}

        {mode === 'photo' && (
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption... (optional)"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
          />
        )}

        {mode === 'daily_report' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <ClipboardListIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              Daily Report — {rDate}
            </span>
          </div>
        )}

        {mode === 'task' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <CheckSquareIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              New Task{taskTitle ? ` — ${taskTitle}` : ''}
            </span>
          </div>
        )}

        {mode === 'pdf' && (
          <input
            type="text"
            value={pdfCaption}
            onChange={(e) => setPdfCaption(e.target.value)}
            placeholder="Add a caption... (optional)"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
          />
        )}

        {mode === 'jsa_report' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <ShieldIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              JSA Report — {jsaDate}
            </span>
          </div>
        )}

        {mode === 'receipt' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-200">
            <ReceiptIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-green-700 font-medium truncate">
              Receipt{rcptVendor ? ` — ${rcptVendor}` : ''}{rcptAmount ? ` — $${rcptAmount}` : ''}
            </span>
          </div>
        )}

        {mode === 'expense' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
            <DollarSignIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700 font-medium truncate">
              Expense{expDescription ? ` — ${expDescription}` : ''}{expAmount ? ` — $${expAmount}` : ''}
            </span>
          </div>
        )}

        {mode === 'timecard' && (
          <div className="flex-1 flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full border border-blue-200">
            <ClockIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-700 font-medium truncate">
              Timecard — {tcDate}{tcGrandTotal() > 0 ? ` — ${tcGrandTotal().toFixed(2)} hrs` : ''}
            </span>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white flex items-center justify-center transition"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
