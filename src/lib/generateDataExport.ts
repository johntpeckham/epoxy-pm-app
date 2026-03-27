import { jsPDF } from 'jspdf'
import {
  DailyReportContent,
  TimecardContent,
  ReceiptContent,
  ExpenseContent,
  JsaReportContent,
  FeedPost,
  Project,
  ProjectReportData,
  DynamicFieldEntry,
} from '@/types'
import { groupDynamicFieldsBySection } from '@/lib/formFieldMaps'

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function loadImage(url: string): Promise<{
  data: string
  format: 'JPEG' | 'PNG'
  width: number
  height: number
}> {
  const res = await fetch(url)
  const blob = await res.blob()
  const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  const img = document.createElement('img')
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = data
  })
  return { data, format, width: img.naturalWidth, height: img.naturalHeight }
}

// Color palettes matching existing PDF generators
const AMBER: [number, number, number] = [180, 83, 9]
const AMBER_LIGHT: [number, number, number] = [254, 243, 199]
const BLUE: [number, number, number] = [37, 99, 235]
const BLUE_DARK: [number, number, number] = [30, 64, 175]
const BLUE_LIGHT: [number, number, number] = [219, 234, 254]
const GREEN: [number, number, number] = [22, 101, 52]
const GREEN_LIGHT: [number, number, number] = [220, 252, 231]
const DARK: [number, number, number] = [17, 24, 39]
const LABEL_GRAY: [number, number, number] = [75, 85, 99]
const MED: [number, number, number] = [107, 114, 128]

interface PdfHelpers {
  doc: jsPDF
  y: number
  PW: number
  PH: number
  M: number
  CW: number
}

function createDoc(): PdfHelpers {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 20
  const CW = PW - M * 2
  return { doc, y: M, PW, PH, M, CW }
}

function checkPage(h: PdfHelpers, needed = 20): void {
  if (h.y + needed > h.PH - h.M) {
    h.doc.addPage()
    h.y = h.M
  }
}

function addHeader(
  h: PdfHelpers,
  title: string,
  subtitle: string,
  themeColor: [number, number, number],
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null
): void {
  const headerStartY = h.y
  let logoBottomY = headerStartY
  if (logoData) {
    const LOGO_MAX_W = 40
    const LOGO_MAX_H = 20
    const ratio = Math.min(LOGO_MAX_W / logoData.width, LOGO_MAX_H / logoData.height)
    const drawW = logoData.width * ratio
    const drawH = logoData.height * ratio
    h.doc.addImage(logoData.data, logoData.format, h.PW - h.M - drawW, headerStartY, drawW, drawH)
    logoBottomY = headerStartY + drawH
  }
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(16)
  h.doc.setTextColor(...DARK)
  h.doc.text(title, h.M, headerStartY + 8)
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(10)
  h.doc.setTextColor(...MED)
  h.doc.text(subtitle, h.M, headerStartY + 14)
  const textBottomY = headerStartY + 16
  h.y = Math.max(logoBottomY, textBottomY) + 4
  h.doc.setDrawColor(...themeColor)
  h.doc.setLineWidth(0.5)
  h.doc.line(h.M, h.y, h.M + h.CW, h.y)
  h.y += 4
}

function addSectionTitle(
  h: PdfHelpers,
  title: string,
  color: [number, number, number],
  borderColor: [number, number, number]
): void {
  checkPage(h, 14)
  h.y += 5
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(8)
  h.doc.setTextColor(...color)
  h.doc.text(title, h.M, h.y)
  h.y += 2.5
  h.doc.setDrawColor(...borderColor)
  h.doc.setLineWidth(0.4)
  h.doc.line(h.M, h.y, h.M + h.CW, h.y)
  h.y += 5
}

function addFieldRow(h: PdfHelpers, label: string, value: string): void {
  if (!value) return
  checkPage(h, 10)
  const LABEL_W = 50
  const VALUE_X = h.M + LABEL_W + 4
  const VALUE_W = h.CW - LABEL_W - 6
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(8)
  h.doc.setTextColor(...LABEL_GRAY)
  h.doc.text(label, h.M, h.y)
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9.5)
  h.doc.setTextColor(...DARK)
  const lines = h.doc.splitTextToSize(value, VALUE_W)
  lines.forEach((line: string, i: number) => {
    if (i > 0) checkPage(h, 5)
    h.doc.text(line, VALUE_X, h.y)
    if (i < lines.length - 1) h.y += 4.5
  })
  h.y += 6
}

function addParagraphBlock(h: PdfHelpers, label: string, value: string): void {
  if (!value) return
  checkPage(h, 14)
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(8.5)
  h.doc.setTextColor(...DARK)
  h.doc.text(label, h.M, h.y)
  h.y += 5
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9.5)
  h.doc.setTextColor(...DARK)
  const lines = h.doc.splitTextToSize(value, h.CW)
  lines.forEach((line: string) => {
    checkPage(h, 5)
    h.doc.text(line, h.M, h.y)
    h.y += 4.5
  })
  h.y += 4
}

function addFooter(h: PdfHelpers, borderColor: [number, number, number]): void {
  const totalPages = h.doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    h.doc.setPage(p)
    const footerY = h.PH - 10
    h.doc.setDrawColor(...borderColor)
    h.doc.setLineWidth(0.4)
    h.doc.line(h.M, footerY - 4, h.PW - h.M, footerY - 4)
    h.doc.setFont('helvetica', 'italic')
    h.doc.setFontSize(7)
    h.doc.setTextColor(...MED)
    h.doc.text(
      `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      h.M,
      footerY
    )
    if (totalPages > 1) {
      h.doc.text(`Page ${p} of ${totalPages}`, h.PW - h.M, footerY, { align: 'right' })
    }
  }
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function renderDynamicFields(
  h: PdfHelpers,
  dynamicFields: DynamicFieldEntry[] | undefined,
  handledSections: string[],
  color: [number, number, number],
  borderColor: [number, number, number]
): void {
  const sectionGroups = groupDynamicFieldsBySection(dynamicFields)
  for (const [section, fields] of sectionGroups.entries()) {
    if (handledSections.includes(section) || section === '') continue
    addSectionTitle(h, section.toUpperCase(), color, borderColor)
    for (const f of fields) {
      if (f.type === 'long_text') {
        addParagraphBlock(h, f.label, f.value)
      } else {
        addFieldRow(h, f.label, f.value)
      }
    }
  }
  for (const f of sectionGroups.get('') ?? []) {
    if (f.type === 'long_text') {
      addParagraphBlock(h, f.label, f.value)
    } else {
      addFieldRow(h, f.label, f.value)
    }
  }
}

// ─── PDF Generators (return ArrayBuffer) ─────────────────────────────────────

export async function generateDailyReportPdfBuffer(
  content: DailyReportContent,
  photoUrls: string[],
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null,
  dynamicFields?: DynamicFieldEntry[]
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Daily Field Report', content.project_name || '—', AMBER, logoData)

  const sectionGroups = groupDynamicFieldsBySection(dynamicFields)
  const renderSectionFields = (sectionLabel: string) => {
    const fields = sectionGroups.get(sectionLabel)
    if (!fields) return
    for (const f of fields) {
      if (f.type === 'long_text') addParagraphBlock(h, f.label, f.value)
      else addFieldRow(h, f.label, f.value)
    }
  }

  addSectionTitle(h, 'PROJECT DETAILS', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Date', content.date ? formatDisplayDate(content.date) : '—')
  addFieldRow(h, 'Project', content.project_name || '—')
  addFieldRow(h, 'Address', content.address || '—')
  renderSectionFields('Header')

  addSectionTitle(h, 'CREW', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Reported By', content.reported_by || '—')
  addFieldRow(h, 'Project Foreman', content.project_foreman || '—')
  addFieldRow(h, 'Weather', content.weather || '—')
  renderSectionFields('Crew')

  addSectionTitle(h, 'WORK SUMMARY', AMBER, AMBER_LIGHT)
  addParagraphBlock(h, 'Progress', content.progress || '')
  addParagraphBlock(h, 'Delays', content.delays || '')
  addParagraphBlock(h, 'Safety', content.safety || '')
  addParagraphBlock(h, 'Materials Used', content.materials_used || '')
  addParagraphBlock(h, 'Employees', content.employees || '')
  renderSectionFields('Progress')

  renderDynamicFields(h, dynamicFields, ['Header', 'Crew', 'Progress'], AMBER, AMBER_LIGHT)

  // Photos
  if (photoUrls.length > 0) {
    addSectionTitle(h, 'PHOTOS', AMBER, AMBER_LIGHT)
    const gap = 4
    const photoW = (h.CW - gap) / 2
    const photoH = photoW * 0.75
    let col = 0
    let rowY = h.y
    for (const url of photoUrls) {
      try {
        const { data, format } = await loadImage(url)
        const x = h.M + col * (photoW + gap)
        checkPage(h, photoH + 6)
        if (col === 0) rowY = h.y
        h.doc.addImage(data, format, x, rowY, photoW, photoH)
        col++
        if (col === 2) {
          col = 0
          h.y = rowY + photoH + gap
          rowY = h.y
        }
      } catch {
        // skip failed images
      }
    }
    if (col > 0) h.y = rowY + photoH + gap
  }

  addFooter(h, AMBER_LIGHT)
  return h.doc.output('arraybuffer')
}

export async function generateTimecardPdfBuffer(
  content: TimecardContent,
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null,
  dynamicFields?: DynamicFieldEntry[]
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Timecard', content.project_name || '—', BLUE, logoData)

  const sectionGroups = groupDynamicFieldsBySection(dynamicFields)
  const renderSectionFields = (sectionLabel: string) => {
    const fields = sectionGroups.get(sectionLabel)
    if (!fields) return
    for (const f of fields) addFieldRow(h, f.label, f.value)
  }

  addSectionTitle(h, 'TIMECARD DETAILS', BLUE, BLUE_LIGHT)
  addFieldRow(h, 'Project Name', content.project_name || '—')
  addFieldRow(h, 'Date', content.date ? formatDisplayDate(content.date) : '—')
  addFieldRow(h, 'Address', content.address || '—')
  addFieldRow(h, 'Employees', `${content.entries.length}`)
  addFieldRow(h, 'Grand Total', `${content.grand_total_hours.toFixed(2)} hours`)
  renderSectionFields('Project Info')

  // Employee table
  addSectionTitle(h, 'EMPLOYEE TIME LOG', BLUE, BLUE_LIGHT)
  const colX = [h.M, h.M + 55, h.M + 80, h.M + 105, h.M + 130]
  checkPage(h, 8)
  h.doc.setFillColor(...BLUE_LIGHT)
  h.doc.rect(h.M, h.y - 3, h.CW, 7, 'F')
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(7)
  h.doc.setTextColor(...BLUE_DARK)
  h.doc.text('EMPLOYEE', colX[0] + 2, h.y)
  h.doc.text('TIME IN', colX[1] + 2, h.y)
  h.doc.text('TIME OUT', colX[2] + 2, h.y)
  h.doc.text('LUNCH', colX[3] + 2, h.y)
  h.doc.text('HOURS', colX[4] + 2, h.y)
  h.y += 6

  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9)
  for (let i = 0; i < content.entries.length; i++) {
    checkPage(h, 8)
    const entry = content.entries[i]
    if (i % 2 === 0) {
      h.doc.setFillColor(248, 250, 252)
      h.doc.rect(h.M, h.y - 3.5, h.CW, 6.5, 'F')
    }
    h.doc.setTextColor(...DARK)
    h.doc.setFont('helvetica', 'normal')
    h.doc.text(entry.employee_name, colX[0] + 2, h.y)
    h.doc.setTextColor(...LABEL_GRAY)
    h.doc.text(entry.time_in, colX[1] + 2, h.y)
    h.doc.text(entry.time_out, colX[2] + 2, h.y)
    h.doc.text(`${entry.lunch_minutes} min`, colX[3] + 2, h.y)
    h.doc.setTextColor(...DARK)
    h.doc.setFont('helvetica', 'bold')
    h.doc.text(entry.total_hours.toFixed(2), colX[4] + 2, h.y)
    h.y += 6
  }

  // Grand total row
  checkPage(h, 10)
  h.y += 1
  h.doc.setDrawColor(...BLUE)
  h.doc.setLineWidth(0.4)
  h.doc.line(h.M, h.y - 3, h.M + h.CW, h.y - 3)
  h.doc.setFillColor(...BLUE_LIGHT)
  h.doc.rect(h.M, h.y - 2, h.CW, 8, 'F')
  h.doc.setFont('helvetica', 'bold')
  h.doc.setFontSize(10)
  h.doc.setTextColor(...BLUE_DARK)
  h.doc.text('GRAND TOTAL', colX[0] + 2, h.y + 2.5)
  h.doc.text(`${content.grand_total_hours.toFixed(2)} hours`, colX[4] + 2, h.y + 2.5)
  h.y += 10

  renderSectionFields('Employees')
  renderDynamicFields(h, dynamicFields, ['Project Info', 'Employees'], BLUE, BLUE_LIGHT)
  addFooter(h, BLUE_LIGHT)
  return h.doc.output('arraybuffer')
}

export async function generateExpensePdfBuffer(
  content: ReceiptContent,
  photoUrl: string | null,
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null,
  dynamicFields?: DynamicFieldEntry[]
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Expense', content.vendor_name || '—', GREEN, logoData)

  const sectionGroups = groupDynamicFieldsBySection(dynamicFields)

  addSectionTitle(h, 'EXPENSE DETAILS', GREEN, GREEN_LIGHT)
  addFieldRow(h, 'Vendor / Store', content.vendor_name || '—')
  addFieldRow(h, 'Date', content.receipt_date ? formatDisplayDate(content.receipt_date) : '—')
  addFieldRow(h, 'Total Amount', `$${content.total_amount.toFixed(2)}`)
  addFieldRow(h, 'Category', content.category || '—')

  for (const f of sectionGroups.get('Receipt Details') ?? []) {
    addFieldRow(h, f.label, f.value)
  }

  renderDynamicFields(h, dynamicFields, ['Receipt Photo', 'Receipt Details'], GREEN, GREEN_LIGHT)

  // Receipt photo
  if (photoUrl) {
    addSectionTitle(h, 'RECEIPT IMAGE', GREEN, GREEN_LIGHT)
    try {
      const { data, format, width, height } = await loadImage(photoUrl)
      const maxW = h.CW
      const maxH = 120
      const ratio = Math.min(maxW / width, maxH / height)
      const drawW = width * ratio
      const drawH = height * ratio
      checkPage(h, drawH + 6)
      h.doc.addImage(data, format, h.M, h.y, drawW, drawH)
      h.y += drawH + 6
    } catch {
      // skip failed image
    }
  }

  addFooter(h, GREEN_LIGHT)
  return h.doc.output('arraybuffer')
}

export async function generateJsaPdfBuffer(
  content: JsaReportContent,
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null,
  dynamicFields?: DynamicFieldEntry[]
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Job Safety Analysis', content.projectName || '—', AMBER, logoData)

  const sectionGroups = groupDynamicFieldsBySection(dynamicFields)
  const renderSectionFields = (sectionLabel: string) => {
    const fields = sectionGroups.get(sectionLabel)
    if (!fields) return
    for (const f of fields) {
      if (f.type === 'long_text') addParagraphBlock(h, f.label, f.value)
      else addFieldRow(h, f.label, f.value)
    }
  }

  addSectionTitle(h, 'PROJECT DETAILS', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Date', content.date ? formatDisplayDate(content.date) : '—')
  addFieldRow(h, 'Project', content.projectName || '—')
  addFieldRow(h, 'Address', content.address || '—')
  addFieldRow(h, 'Weather', content.weather || '—')
  renderSectionFields('Project Info')

  addSectionTitle(h, 'PERSONNEL', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Prepared By', content.preparedBy || '—')
  addFieldRow(h, 'Site Supervisor', content.siteSupervisor || '—')
  addFieldRow(h, 'Competent Person', content.competentPerson || '—')
  renderSectionFields('Personnel')

  if (content.tasks && content.tasks.length > 0) {
    for (const task of content.tasks) {
      addSectionTitle(h, `TASK: ${task.name.toUpperCase()}`, AMBER, AMBER_LIGHT)
      addParagraphBlock(h, 'Hazards', task.hazards || '')
      addParagraphBlock(h, 'Precautions', task.precautions || '')
      addParagraphBlock(h, 'PPE Required', task.ppe || '')
    }
  }
  renderSectionFields('Tasks')

  renderDynamicFields(h, dynamicFields, ['Project Info', 'Personnel', 'Tasks', 'Employee Acknowledgment & Signatures'], AMBER, AMBER_LIGHT)

  // Signatures
  checkPage(h, 50)
  h.y += 8
  addSectionTitle(h, 'EMPLOYEE ACKNOWLEDGMENT & SIGNATURES', AMBER, AMBER_LIGHT)
  h.doc.setFont('helvetica', 'normal')
  h.doc.setFontSize(9)
  h.doc.setTextColor(...DARK)
  h.doc.text(
    'I acknowledge that the Job Safety Analysis has been reviewed with me, I understand the hazards and required controls, and I agree to follow all safety procedures outlined.',
    h.M,
    h.y,
    { maxWidth: h.CW }
  )
  h.y += 14

  const filledSigs = (content.signatures ?? []).filter((s) => s.name || s.signature)
  if (filledSigs.length > 0) {
    const SIG_IMG_W = 60
    const SIG_IMG_H = 20
    for (const sig of filledSigs) {
      checkPage(h, SIG_IMG_H + 14)
      if (sig.signature) {
        try {
          h.doc.addImage(sig.signature, 'PNG', h.M, h.y, SIG_IMG_W, SIG_IMG_H)
        } catch {
          // skip
        }
      }
      h.doc.setDrawColor(...LABEL_GRAY)
      h.doc.setLineWidth(0.3)
      h.doc.line(h.M, h.y + SIG_IMG_H + 1, h.M + SIG_IMG_W, h.y + SIG_IMG_H + 1)
      h.doc.setFont('helvetica', 'normal')
      h.doc.setFontSize(8)
      h.doc.setTextColor(...DARK)
      h.doc.text(sig.name, h.M, h.y + SIG_IMG_H + 5.5)
      h.y += SIG_IMG_H + 12
    }
  }

  addFooter(h, AMBER_LIGHT)
  return h.doc.output('arraybuffer')
}

export async function generateFeedPdfBuffer(
  projectName: string,
  posts: FeedPost[],
  getPhotoUrl: (path: string) => string,
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Job Feed', projectName || '—', AMBER, logoData)

  const sorted = [...posts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  for (const post of sorted) {
    checkPage(h, 20)
    addSectionTitle(
      h,
      new Date(post.created_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      AMBER,
      AMBER_LIGHT
    )

    addFieldRow(h, 'Author', post.author_name || post.author_email || '—')
    addFieldRow(h, 'Type', post.post_type.replace(/_/g, ' '))

    const content = post.content as unknown as Record<string, unknown>
    if ('message' in content && content.message) {
      addParagraphBlock(h, 'Message', String(content.message))
    }
    if ('caption' in content && content.caption) {
      addParagraphBlock(h, 'Caption', String(content.caption))
    }
    if ('progress' in content && content.progress) {
      addParagraphBlock(h, 'Progress', String(content.progress))
    }
    if ('description' in content && content.description) {
      addParagraphBlock(h, 'Description', String(content.description))
    }

    // Embedded photos
    const photos: string[] = []
    if ('photos' in content && Array.isArray(content.photos)) {
      photos.push(...content.photos)
    }
    if ('receipt_photo' in content && content.receipt_photo) {
      photos.push(String(content.receipt_photo))
    }

    if (photos.length > 0) {
      const gap = 4
      const photoW = (h.CW - gap) / 2
      const photoH = photoW * 0.75
      let col = 0
      let rowY = h.y
      for (const p of photos) {
        try {
          const url = getPhotoUrl(p)
          const { data, format } = await loadImage(url)
          const x = h.M + col * (photoW + gap)
          checkPage(h, photoH + 6)
          if (col === 0) rowY = h.y
          h.doc.addImage(data, format, x, rowY, photoW, photoH)
          col++
          if (col === 2) {
            col = 0
            h.y = rowY + photoH + gap
            rowY = h.y
          }
        } catch {
          // skip failed images
        }
      }
      if (col > 0) h.y = rowY + photoH + gap
    }

    h.y += 2
  }

  addFooter(h, AMBER_LIGHT)
  return h.doc.output('arraybuffer')
}

export async function generateProjectReportPdfBuffer(
  projectName: string,
  data: ProjectReportData,
  logoData?: { data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null
): Promise<ArrayBuffer> {
  const h = createDoc()
  addHeader(h, 'Project Report', projectName || '—', AMBER, logoData)

  // ─── Project Details
  addSectionTitle(h, 'PROJECT DETAILS', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Project Name', data.project_name || '')
  addFieldRow(h, 'Estimate #', data.estimate_number || '')
  addFieldRow(h, 'Address', data.address || '')
  addFieldRow(h, 'Client', data.client_name || '')
  addFieldRow(h, 'Client Email', data.client_email || '')
  addFieldRow(h, 'Client Phone', data.client_phone || '')
  addFieldRow(h, 'Site Contact', data.site_contact || '')
  addFieldRow(h, 'Prevailing Wage', data.prevailing_wage || '')
  addFieldRow(h, 'Bonding / Insurance', data.bonding_insurance || '')
  addFieldRow(h, 'Bid Date', data.bid_date || '')
  addFieldRow(h, 'Bid Platform', data.bid_platform || '')
  if (data.project_details_notes) addParagraphBlock(h, 'Notes', data.project_details_notes)

  // ─── Project Durations
  addSectionTitle(h, 'PROJECT DURATIONS', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Start Date', data.start_date || '')
  addFieldRow(h, 'Finish Date', data.finish_date || '')
  addFieldRow(h, 'Mobilizations', data.num_mobilizations || '')
  addFieldRow(h, 'Working Hours', data.working_hours || '')
  if (data.durations_notes) addParagraphBlock(h, 'Notes', data.durations_notes)

  // ─── Scope Of Work
  addSectionTitle(h, 'SCOPE OF WORK', AMBER, AMBER_LIGHT)
  if (data.scope_description) addParagraphBlock(h, 'Description', data.scope_description)
  addFieldRow(h, 'Rooms / Sections', data.num_rooms_sections || '')
  addFieldRow(h, 'Square Footages', data.square_footages || '')
  addFieldRow(h, 'Linear Footage', data.linear_footage || '')
  addFieldRow(h, 'Cove / Curb Height', data.cove_curb_height || '')
  addFieldRow(h, 'Room Numbers / Names', data.room_numbers_names || '')
  addFieldRow(h, 'Open Areas / Machines', data.open_areas_machines || '')
  if (data.scope_notes) addParagraphBlock(h, 'Notes', data.scope_notes)

  // ─── Site Information
  addSectionTitle(h, 'SITE INFORMATION', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Power Supplied', data.power_supplied || '')
  addFieldRow(h, 'Lighting Requirements', data.lighting_requirements || '')
  addFieldRow(h, 'Heating / Cooling', data.heating_cooling_requirements || '')
  addFieldRow(h, 'Rental Requirements', data.rental_requirements || '')
  addFieldRow(h, 'Rental Location', data.rental_location || '')
  addFieldRow(h, 'Rental Duration', data.rental_duration || '')
  if (data.site_notes) addParagraphBlock(h, 'Notes', data.site_notes)

  // ─── Travel Information
  addSectionTitle(h, 'TRAVEL INFORMATION', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Hotel Name', data.hotel_name || '')
  addFieldRow(h, 'Hotel Location', data.hotel_location || '')
  addFieldRow(h, 'Reservation #', data.reservation_number || '')
  addFieldRow(h, 'Reservation Contact', data.reservation_contact || '')
  addFieldRow(h, 'Credit Card Auth', data.credit_card_auth || '')
  addFieldRow(h, 'Drive Time', data.drive_time || '')
  addFieldRow(h, 'Per Diem', data.per_diem || '')
  addFieldRow(h, 'Vehicles', data.vehicles || '')
  addFieldRow(h, 'Trailers', data.trailers || '')
  if (data.travel_notes) addParagraphBlock(h, 'Notes', data.travel_notes)

  // ─── Prep
  addSectionTitle(h, 'PREP', AMBER, AMBER_LIGHT)
  addFieldRow(h, 'Prep Method', data.prep_method || '')
  addFieldRow(h, 'Prep Removal', data.prep_removal || '')
  addFieldRow(h, 'Patching Materials', data.patching_materials || '')
  addFieldRow(h, 'Joint Requirements', data.joint_requirements || '')
  addFieldRow(h, 'Sloping Requirements', data.sloping_requirements || '')
  addFieldRow(h, 'Backfill / Patching', data.backfill_patching || '')
  addFieldRow(h, 'Wet Area', data.wet_area || '')
  addFieldRow(h, 'Climate Concerns', data.climate_concerns || '')
  addFieldRow(h, 'Cooling / Heating', data.cooling_heating_constraints || '')
  if (data.prep_notes) addParagraphBlock(h, 'Notes', data.prep_notes)

  addFooter(h, AMBER_LIGHT)
  return h.doc.output('arraybuffer')
}

// ─── Export types ────────────────────────────────────────────────────────────

export interface ExportOptions {
  startDate: string
  endDate: string
  projectIds: string[]
  includeDaily: boolean
  includeTimesheets: boolean
  includeExpenses: boolean
  includeJsa: boolean
  includeFeed: boolean
  includePhotos: boolean
  includePlans: boolean
  includeProjectReport: boolean
}

export interface ExportProgress {
  step: string
  current: number
  total: number
}

export type { FeedPost, Project }
