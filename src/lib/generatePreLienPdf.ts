import { jsPDF } from 'jspdf'

/** Fetch an image URL and return a base64 data URL, format, and natural dimensions. */
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

// ── Block format types (matches WarrantyTemplateEditor) ─────────────────────
interface TemplateBlock {
  id: string
  type: 'header' | 'sub_header' | 'body' | 'divider' | 'signature' | 'spacer'
  content: string
  color: string
  height?: number
  signatureData?: string
  signatureName?: string
  signatureTitle?: string
}

interface HeaderDividerSettings {
  enabled: boolean
  color: string
}

/** Convert hex color string (#RRGGBB or RRGGBB) to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
}

// Black and white palette — matches existing report branding
const DARK: [number, number, number] = [17, 24, 39]          // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]    // gray-600
const MED: [number, number, number] = [107, 114, 128]        // gray-500


/** Render block-format body into the jsPDF document */
async function renderBlockBody(
  doc: jsPDF,
  blocks: TemplateBlock[],
  M: number,
  CW: number,
  getY: () => number,
  setY: (v: number) => void,
  checkPage: (needed?: number) => void
) {
  for (const block of blocks) {
    switch (block.type) {
      case 'header': {
        const rgb = hexToRgb(block.color)
        checkPage(14)
        setY(getY() + 3)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...rgb)
        const text = block.content.toUpperCase()
        const lines = doc.splitTextToSize(text, CW) as string[]
        for (const line of lines) {
          checkPage(8)
          doc.text(line, M, getY())
          setY(getY() + 6)
        }
        setY(getY() + 1)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...DARK)
        break
      }
      case 'sub_header': {
        const rgb = hexToRgb(block.color)
        checkPage(12)
        setY(getY() + 2)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(...rgb)
        const lines = doc.splitTextToSize(block.content, CW) as string[]
        for (const line of lines) {
          checkPage(7)
          doc.text(line, M, getY())
          setY(getY() + 5)
        }
        setY(getY() + 2)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...DARK)
        break
      }
      case 'body': {
        const rgb = hexToRgb(block.color)
        checkPage(8)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...rgb)
        const textLines = block.content.split('\n')
        for (const textLine of textLines) {
          const trimmed = textLine.trim()
          if (!trimmed) {
            setY(getY() + 4)
            continue
          }
          const lines = doc.splitTextToSize(trimmed, CW) as string[]
          for (const line of lines) {
            checkPage(8)
            doc.text(line, M, getY())
            setY(getY() + 5)
          }
        }
        setY(getY() + 2)
        doc.setTextColor(...DARK)
        break
      }
      case 'divider': {
        const rgb = hexToRgb(block.color)
        checkPage(6)
        setY(getY() + 3)
        doc.setDrawColor(...rgb)
        doc.setLineWidth(0.3)
        doc.line(M, getY(), M + CW, getY())
        setY(getY() + 3)
        break
      }
      case 'signature': {
        checkPage(40)
        setY(getY() + 8)
        // Signature line
        const SIG_LINE_W = 60
        doc.setDrawColor(...DARK)
        doc.setLineWidth(0.3)
        doc.line(M, getY(), M + SIG_LINE_W, getY())
        setY(getY() + 2)
        // Signature image
        if (block.signatureData) {
          try {
            const SIG_W = 50
            const SIG_H = 25
            doc.addImage(block.signatureData, 'PNG', M, getY(), SIG_W, SIG_H)
            setY(getY() + SIG_H + 2)
          } catch {
            // skip image if it fails
            setY(getY() + 4)
          }
        } else {
          setY(getY() + 4)
        }
        // Signature name
        if (block.signatureName) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(...DARK)
          doc.text(block.signatureName, M, getY())
          setY(getY() + 5)
        }
        // Signature title
        if (block.signatureTitle) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(...LABEL_GRAY)
          doc.text(block.signatureTitle, M, getY())
          setY(getY() + 5)
        }
        doc.setTextColor(...DARK)
        break
      }
      case 'spacer': {
        // Convert px height to mm (roughly 1px ≈ 0.3mm)
        const spaceMm = Math.max(1, Math.round((block.height ?? 20) * 0.3))
        checkPage(spaceMm)
        setY(getY() + spaceMm)
        break
      }
    }
  }
  // Reset text color
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
}

interface CompanyInfo {
  dba?: string | null
  legal_name?: string | null
  company_address?: string | null
  phone?: string | null
  email?: string | null
  cslb_licenses?: { number: string; classification: string }[] | null
}

export interface PreLienFormData {
  // Owner
  owner_name: string
  owner_address: string
  // Direct Contractor (optional)
  direct_contractor_name: string
  direct_contractor_address: string
  // Construction Lender (optional)
  construction_lender_name: string
  construction_lender_address: string
  // Claimant (company)
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  cslb_license: string
  // Hiring Party
  hiring_party_name: string
  hiring_party_address: string
  hiring_party_relationship: string
  // Project
  project_name: string
  project_address: string
  description_of_work: string
  estimated_total_price: string
  // Date & Signature
  date: string
  signature_name: string
  signature_title: string
}

/** Replace pre-lien merge fields in a string with form data */
function applyPreLienMergeFields(text: string, formData: PreLienFormData): string {
  const orEmpty = (v: string) => (v && v.trim() ? v : 'N/A')
  const orBlank = (v: string) => v || ''
  return text
    .replace(/\{\{company_name\}\}/g, orBlank(formData.company_name))
    .replace(/\{\{company_address\}\}/g, orBlank(formData.company_address))
    .replace(/\{\{company_phone\}\}/g, orBlank(formData.company_phone))
    .replace(/\{\{company_email\}\}/g, orBlank(formData.company_email))
    .replace(/\{\{cslb_license\}\}/g, orBlank(formData.cslb_license))
    .replace(/\{\{project_name\}\}/g, orBlank(formData.project_name))
    .replace(/\{\{project_address\}\}/g, orBlank(formData.project_address))
    .replace(/\{\{owner_name\}\}/g, orBlank(formData.owner_name))
    .replace(/\{\{owner_address\}\}/g, orBlank(formData.owner_address))
    .replace(/\{\{direct_contractor_name\}\}/g, orEmpty(formData.direct_contractor_name))
    .replace(/\{\{direct_contractor_address\}\}/g, orEmpty(formData.direct_contractor_address))
    .replace(/\{\{construction_lender_name\}\}/g, orEmpty(formData.construction_lender_name))
    .replace(/\{\{construction_lender_address\}\}/g, orEmpty(formData.construction_lender_address))
    .replace(/\{\{hiring_party_name\}\}/g, orBlank(formData.hiring_party_name))
    .replace(/\{\{hiring_party_address\}\}/g, orBlank(formData.hiring_party_address))
    .replace(/\{\{hiring_party_relationship\}\}/g, orBlank(formData.hiring_party_relationship))
    .replace(/\{\{description_of_work\}\}/g, orBlank(formData.description_of_work))
    .replace(/\{\{estimated_total_price\}\}/g, orBlank(formData.estimated_total_price))
    .replace(/\{\{date\}\}/g, orBlank(formData.date))
}

export async function generatePreLienPdf(
  title: string,
  templateBody: string,
  formData: PreLienFormData,
  logoUrl?: string | null,
  companyInfo?: CompanyInfo | null
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()   // 215.9
  const PH = doc.internal.pageSize.getHeight()  // 279.4
  const M = 20
  const CW = PW - M * 2
  let y = M

  function checkPage(needed = 20) {
    if (y + needed > PH - M) {
      doc.addPage()
      y = M
    }
  }

  // ─── Header ──────────────────────────────────────────────────────────────

  // Company logo — top right (same pattern as generateReportPdf)
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const LOGO_MAX_W = 40
      const LOGO_MAX_H = 20
      const ratio = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height)
      const drawW = logo.width * ratio
      const drawH = logo.height * ratio
      doc.addImage(logo.data, logo.format, PW - M - drawW, y, drawW, drawH)
    } catch {
      // skip logo if it fails
    }
  }

  // ── Company info header ───────────────────────────────────────────────────
  const ci = companyInfo ?? {}

  // Line 1: Company identity — "[Legal Name] DBA [DBA Name]"
  let companyIdentity: string
  if (ci.legal_name && ci.dba && ci.legal_name.toLowerCase() !== ci.dba.toLowerCase()) {
    companyIdentity = `${ci.legal_name} DBA ${ci.dba}`
  } else {
    companyIdentity = ci.dba || ci.legal_name || 'Peckham Coatings'
  }

  // Line 2: Address (own line)
  const addressLine = ci.company_address ? ci.company_address.replace(/\n/g, ', ') : null

  // Line 3: Phone | Email (own line)
  const contactParts: string[] = []
  if (ci.phone) contactParts.push(ci.phone)
  if (ci.email) contactParts.push(ci.email)
  const contactLine = contactParts.length > 0 ? contactParts.join(' | ') : null

  // Line 3: CSLB licenses
  let cslbLine: string | null = null
  if (ci.cslb_licenses && ci.cslb_licenses.length > 0) {
    const parts = ci.cslb_licenses.map((l) => {
      const code = l.classification.includes(' - ') ? l.classification.split(' - ')[0].trim() : l.classification.trim()
      return `#${l.number} (${code})`
    })
    cslbLine = `CSLB Lic. ${parts.join(', ')}`
  }

  // Line 1: Company identity — bold 14pt
  let headerY = y + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK)
  doc.text(companyIdentity, M, headerY)
  headerY += 5

  // Line 2: Address — 9pt gray
  if (addressLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(addressLine, M, headerY)
    headerY += 3.5
  }

  // Line 3: Phone | Email — 9pt gray
  if (contactLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(contactLine, M, headerY)
    headerY += 3.5
  }

  // Line 4: CSLB licenses — 7pt lighter gray
  if (cslbLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(cslbLine, M, headerY)
    headerY += 3.5
  }

  // Warranty title — left-aligned document heading
  headerY += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(title, M, headerY)
  headerY += 5

  y = headerY

  // ─── Header Divider ──────────────────────────────────────────────────────

  // Detect format early to get headerDivider settings
  let parsedBlocks: TemplateBlock[] = []
  let headerDividerSettings: HeaderDividerSettings = { enabled: true, color: '#000000' }
  try {
    const parsed = JSON.parse(templateBody)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.blocks) {
      parsedBlocks = parsed.blocks as TemplateBlock[]
      headerDividerSettings = parsed.headerDivider ?? headerDividerSettings
    } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      parsedBlocks = parsed as TemplateBlock[]
    }
  } catch {
    // Pre-lien templates are always JSON block format — fail gracefully
  }

  // Apply merge fields to block contents and inject signature name/title
  parsedBlocks = parsedBlocks.map((b) => {
    if (b.type === 'signature') {
      return {
        ...b,
        signatureName: formData.signature_name || b.signatureName || '',
        signatureTitle: formData.signature_title || b.signatureTitle || '',
      }
    }
    return { ...b, content: applyPreLienMergeFields(b.content, formData) }
  })

  // Draw header divider line if enabled
  if (headerDividerSettings.enabled) {
    const dividerRgb = hexToRgb(headerDividerSettings.color)
    doc.setDrawColor(...dividerRgb)
    doc.setLineWidth(0.5)
    doc.line(M, y, M + CW, y)
  }
  y += 10

  // ─── Body Text ───────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)

  await renderBlockBody(doc, parsedBlocks, M, CW, () => y, (val: number) => { y = val }, checkPage)

  // ─── Footer ──────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(
      `${companyIdentity} — ${title}`,
      M,
      PH - 10
    )
    doc.text(
      `Page ${i} of ${pageCount}`,
      PW - M,
      PH - 10,
      { align: 'right' }
    )
  }

  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)
  const filename = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
  return { blob: doc.output('blob'), filename }
}
