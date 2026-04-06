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
const AMBER: [number, number, number] = [180, 83, 9]         // amber-700
const AMBER_LIGHT: [number, number, number] = [254, 243, 199] // amber-100

/** Strip HTML tags and decode basic entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[12]>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** Parse simple HTML into blocks for PDF rendering */
interface HtmlBlock {
  type: 'p' | 'h1' | 'h2' | 'li' | 'br'
  segments: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }>
}

function parseHtmlToBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = []

  // Split into block-level elements
  // Match block tags: p, h1, h2, ul, li
  const blockRegex = /<(p|h1|h2|li|ul|\/ul)(?:\s[^>]*)?>(([\s\S]*?))<\/\1>|<br\s*\/?>/gi
  let match: RegExpExecArray | null

  // Simple approach: split by block-level tags
  const cleaned = html
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '')
    .trim()

  // Match block elements
  const tagRegex = /<(p|h1|h2|li)(?:\s[^>]*)?>(([\s\S]*?))<\/\1>/gi

  while ((match = tagRegex.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase() as 'p' | 'h1' | 'h2' | 'li'
    const inner = match[2]
    const segments = parseInlineStyles(inner)
    if (segments.length > 0) {
      blocks.push({ type: tag, segments })
    }
  }

  // If no blocks found, treat as plain text
  if (blocks.length === 0 && html.trim()) {
    const text = stripHtml(html).trim()
    if (text) {
      blocks.push({
        type: 'p',
        segments: [{ text, bold: false, italic: false, underline: false }],
      })
    }
  }

  return blocks
}

/** Parse inline styles (bold, italic, underline) into text segments */
function parseInlineStyles(
  html: string
): Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }> {
  const segments: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }> = []

  // Replace <br> with newline
  let processed = html.replace(/<br\s*\/?>/gi, '\n')

  // Simple recursive parser using regex
  function extract(
    str: string,
    bold: boolean,
    italic: boolean,
    underline: boolean
  ) {
    // Find the next inline tag
    const tagMatch = /<(strong|b|em|i|u)(?:\s[^>]*)?>(([\s\S]*?))<\/\1>/i.exec(str)

    if (!tagMatch) {
      // No more tags — add plain text
      const text = str.replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
      if (text) {
        segments.push({ text, bold, italic, underline })
      }
      return
    }

    // Text before the tag
    const before = str.slice(0, tagMatch.index)
    if (before) {
      const text = before.replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
      if (text) {
        segments.push({ text, bold, italic, underline })
      }
    }

    // The tagged content
    const tag = tagMatch[1].toLowerCase()
    const inner = tagMatch[2]
    const newBold = bold || tag === 'strong' || tag === 'b'
    const newItalic = italic || tag === 'em' || tag === 'i'
    const newUnderline = underline || tag === 'u'
    extract(inner, newBold, newItalic, newUnderline)

    // Text after the tag
    const after = str.slice(tagMatch.index + tagMatch[0].length)
    if (after) {
      extract(after, bold, italic, underline)
    }
  }

  extract(processed, false, false, false)
  return segments
}

/** Render parsed HTML blocks into the jsPDF document */
function renderHtmlBody(
  doc: jsPDF,
  html: string,
  M: number,
  CW: number,
  getY: () => number,
  setY: (v: number) => void,
  checkPage: (needed?: number) => void
) {
  const blocks = parseHtmlToBlocks(html)

  for (const block of blocks) {
    if (block.type === 'h1') {
      checkPage(14)
      setY(getY() + 3)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(...AMBER)
      const text = block.segments.map((s) => s.text).join('')
      const lines = doc.splitTextToSize(text, CW) as string[]
      for (const line of lines) {
        checkPage(8)
        doc.text(line, M, getY())
        setY(getY() + 6)
      }
      doc.setDrawColor(...AMBER_LIGHT)
      doc.setLineWidth(0.3)
      doc.line(M, getY(), M + CW, getY())
      setY(getY() + 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
    } else if (block.type === 'h2') {
      checkPage(12)
      setY(getY() + 2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...AMBER)
      const text = block.segments.map((s) => s.text).join('')
      const lines = doc.splitTextToSize(text, CW) as string[]
      for (const line of lines) {
        checkPage(7)
        doc.text(line, M, getY())
        setY(getY() + 5.5)
      }
      setY(getY() + 2)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
    } else if (block.type === 'li') {
      checkPage(8)
      // Bullet point
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
      doc.text('•', M, getY())
      renderSegments(doc, block.segments, M + 5, CW - 5, getY, setY, checkPage)
      setY(getY() + 2)
    } else {
      // Paragraph
      checkPage(8)
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
      renderSegments(doc, block.segments, M, CW, getY, setY, checkPage)
      setY(getY() + 2)
    }
  }
}

/** Render inline-styled text segments with word wrapping */
function renderSegments(
  doc: jsPDF,
  segments: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }>,
  x: number,
  maxW: number,
  getY: () => number,
  setY: (v: number) => void,
  checkPage: (needed?: number) => void
) {
  // If all segments have the same style, use simple rendering
  if (segments.length === 1) {
    const seg = segments[0]
    const style = seg.bold && seg.italic ? 'bolditalic' : seg.bold ? 'bold' : seg.italic ? 'italic' : 'normal'
    doc.setFont('helvetica', style)
    const textLines = seg.text.split('\n')
    for (const textLine of textLines) {
      const lines = doc.splitTextToSize(textLine, maxW) as string[]
      for (const line of lines) {
        checkPage(8)
        doc.text(line, x, getY())
        if (seg.underline) {
          const tw = doc.getTextWidth(line)
          doc.setDrawColor(...DARK)
          doc.setLineWidth(0.2)
          doc.line(x, getY() + 0.5, x + tw, getY() + 0.5)
        }
        setY(getY() + 5)
      }
    }
    doc.setFont('helvetica', 'normal')
    return
  }

  // For mixed-style segments, concatenate and render line by line
  // This is a simplified approach that handles most common cases
  const fullText = segments.map((s) => s.text).join('')
  const lines = doc.splitTextToSize(fullText, maxW) as string[]

  // Build a style map: for each character position, what style applies
  let pos = 0
  const styleMap: Array<{ bold: boolean; italic: boolean; underline: boolean }> = []
  for (const seg of segments) {
    for (let i = 0; i < seg.text.length; i++) {
      styleMap[pos++] = { bold: seg.bold, italic: seg.italic, underline: seg.underline }
    }
  }

  // Render each line, switching fonts as needed
  let charIdx = 0
  for (const line of lines) {
    checkPage(8)
    let lineX = x
    let runStart = charIdx
    let runStyle = styleMap[charIdx] || { bold: false, italic: false, underline: false }

    for (let i = 0; i < line.length; i++) {
      const ci = charIdx + i
      const cs = styleMap[ci] || { bold: false, italic: false, underline: false }
      if (cs.bold !== runStyle.bold || cs.italic !== runStyle.italic || cs.underline !== runStyle.underline) {
        // Flush the current run
        const runText = line.slice(runStart - charIdx, i)
        if (runText) {
          const style = runStyle.bold && runStyle.italic ? 'bolditalic' : runStyle.bold ? 'bold' : runStyle.italic ? 'italic' : 'normal'
          doc.setFont('helvetica', style)
          doc.text(runText, lineX, getY())
          if (runStyle.underline) {
            const tw = doc.getTextWidth(runText)
            doc.setDrawColor(...DARK)
            doc.setLineWidth(0.2)
            doc.line(lineX, getY() + 0.5, lineX + tw, getY() + 0.5)
          }
          lineX += doc.getTextWidth(runText)
        }
        runStart = charIdx + i
        runStyle = cs
      }
    }

    // Flush remaining run
    const runText = line.slice(runStart - charIdx)
    if (runText) {
      const style = runStyle.bold && runStyle.italic ? 'bolditalic' : runStyle.bold ? 'bold' : runStyle.italic ? 'italic' : 'normal'
      doc.setFont('helvetica', style)
      doc.text(runText, lineX, getY())
      if (runStyle.underline) {
        const tw = doc.getTextWidth(runText)
        doc.setDrawColor(...DARK)
        doc.setLineWidth(0.2)
        doc.line(lineX, getY() + 0.5, lineX + tw, getY() + 0.5)
      }
    }

    charIdx += line.length
    // Skip whitespace that was consumed by word wrapping
    while (charIdx < styleMap.length && fullText[charIdx] === ' ' && !line.endsWith(fullText[charIdx - 1])) {
      charIdx++
      break
    }

    setY(getY() + 5)
  }

  doc.setFont('helvetica', 'normal')
}

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

export async function generateWarrantyPdf(
  title: string,
  bodyText: string,
  signatureName: string | null,
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

  // Line 2: Contact info — "[Address] | [Phone] | [Email]"
  const infoParts: string[] = []
  if (ci.company_address) infoParts.push(ci.company_address.replace(/\n/g, ', '))
  if (ci.phone) infoParts.push(ci.phone)
  if (ci.email) infoParts.push(ci.email)
  const infoLine = infoParts.length > 0 ? infoParts.join(' | ') : null

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

  // Line 2: Contact info — 8pt gray single line
  if (infoLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(infoLine, M, headerY)
    headerY += 3.5
  }

  // Line 3: CSLB licenses — 7pt lighter gray
  if (cslbLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(cslbLine, M, headerY)
    headerY += 3.5
  }

  // Warranty title — centered document heading
  headerY += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(title, PW / 2, headerY, { align: 'center' })
  headerY += 5

  y = headerY

  // ─── Header Divider ──────────────────────────────────────────────────────

  // Detect format early to get headerDivider settings
  let parsedBlocks: TemplateBlock[] | null = null
  let headerDividerSettings: HeaderDividerSettings = { enabled: true, color: '#B45309' }
  try {
    const parsed = JSON.parse(bodyText)
    // New object format: { blocks: [...], headerDivider: {...} }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.blocks) {
      parsedBlocks = parsed.blocks as TemplateBlock[]
      headerDividerSettings = parsed.headerDivider ?? headerDividerSettings
    }
    // Old array format
    else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      parsedBlocks = parsed as TemplateBlock[]
    }
  } catch {
    // not JSON — fall through to legacy rendering
  }

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

  if (parsedBlocks) {
    // New block format rendering
    await renderBlockBody(doc, parsedBlocks, M, CW, () => y, (val: number) => { y = val }, checkPage)
  } else {
    // Legacy: HTML or plain text
    const isHtml = /<[a-z][\s\S]*>/i.test(bodyText)

    if (isHtml) {
      renderHtmlBody(doc, bodyText, M, CW, () => y, (val: number) => { y = val }, checkPage)
    } else {
      // Legacy plain text rendering
      const paragraphs = bodyText.split('\n')
      for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim()

        if (!trimmed) {
          y += 4
          continue
        }

        // Check if this looks like a section header (ALL CAPS or ends with :)
        const isHeader = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !/\d{4}/.test(trimmed)

        if (isHeader) {
          checkPage(14)
          y += 3
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.setTextColor(...AMBER)
          doc.text(trimmed, M, y)
          y += 2
          doc.setDrawColor(...AMBER_LIGHT)
          doc.setLineWidth(0.3)
          doc.line(M, y, M + CW, y)
          y += 5
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...DARK)
          continue
        }

        // Regular paragraph — word wrap
        const lines = doc.splitTextToSize(trimmed, CW) as string[]
        for (const line of lines) {
          checkPage(8)
          doc.text(line, M, y)
          y += 5
        }
        y += 2
      }
    }
  }

  // ─── Signature (legacy only — block format has signatures in blocks) ───

  if (signatureName && !parsedBlocks) {
    checkPage(35)
    y += 15

    // Signature line
    const SIG_LINE_W = 80
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.3)
    doc.line(M, y, M + SIG_LINE_W, y)
    y += 2

    // Signature in cursive style — use helvetica italic as approximation
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(16)
    doc.setTextColor(...DARK)
    doc.text(signatureName, M, y + 6)
    y += 10

    // Typed name below
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(signatureName, M, y)
    y += 5

    // Date
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    doc.text(`Date: ${today}`, M, y)
  }

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
