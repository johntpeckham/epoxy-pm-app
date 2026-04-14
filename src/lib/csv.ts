// Lightweight CSV parsing & serialization utilities.
// Supports RFC 4180-ish quoting + tab-separated fallback.

export function parseCsv(text: string, delimiter?: string): string[][] {
  if (!text) return []
  // Remove BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const delim = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delim) {
      cur.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      // handle CRLF as one row terminator
      if (text[i + 1] === '\n') i += 1
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      i += 1
      continue
    }
    if (ch === '\n') {
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  // Flush last field/row (only if non-empty)
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }

  // Drop trailing all-empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop()
  }
  return rows
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000)
  const tabs = (sample.match(/\t/g) ?? []).length
  const commas = (sample.match(/,/g) ?? []).length
  return tabs > commas ? '\t' : ','
}

// Serialize a 2D array to CSV. Fields that contain the delimiter, quote, or
// newline are double-quoted with embedded quotes doubled.
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return rows.map((r) => r.map(escape).join(',')).join('\n')
}

// Trigger a browser download of the given CSV text.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Normalize a name for fuzzy comparison: lowercase, remove punctuation,
// collapse whitespace, and strip common corporate suffixes.
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"&]/g, '')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|llc|ltd|limited|lp|llp|plc|pc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein distance — for short strings.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[a.length][b.length]
}

// Returns a similarity score in [0, 1]. Considers equality after normalization,
// substring containment, and Levenshtein ratio on normalized names.
export function companyNameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length)
    const longer = Math.max(na.length, nb.length)
    return 0.85 + 0.15 * (shorter / longer)
  }
  const dist = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return 1 - dist / maxLen
}

// Find potential duplicate matches for an incoming name among a list of
// existing names. Returns entries above a threshold, highest first.
export function findSimilarNames<T extends { id: string; name: string }>(
  incoming: string,
  candidates: T[],
  threshold = 0.82
): Array<T & { score: number }> {
  const out: Array<T & { score: number }> = []
  for (const c of candidates) {
    const score = companyNameSimilarity(incoming, c.name)
    if (score >= threshold) out.push({ ...c, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
