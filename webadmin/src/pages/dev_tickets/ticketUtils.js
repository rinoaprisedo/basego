import toast from 'react-hot-toast'

export const DEV_STATUS_STYLE = {
  todo: 'bg-surface-hover text-text-secondary',
  in_progress: 'bg-info-bg text-info',
  need_info: 'bg-warning-bg text-warning',
  done_by_claude: 'bg-[#efe9fd] text-[#6d4ad6] dark:bg-[#2b2547] dark:text-[#b9a6f7]',
  done: 'bg-success-bg text-success',
  wont_fix: 'bg-surface-hover text-text-tertiary line-through',
}

export const DEV_STATUS_DOT = {
  todo: 'bg-text-tertiary',
  in_progress: 'bg-info',
  need_info: 'bg-warning',
  done_by_claude: 'bg-[#6d4ad6] dark:bg-[#9c84ee]',
  done: 'bg-success',
  wont_fix: 'bg-surface-border-hover',
}

export const PRIORITY_STYLE = {
  Critical: 'bg-danger text-white',
  High: 'bg-danger-bg text-danger',
  Medium: 'bg-warning-bg text-warning',
  Low: 'bg-surface-hover text-text-secondary',
}

export const CATEGORY_STYLE = {
  Bug: 'border-danger/30 text-danger',
  Request: 'border-info/30 text-info',
  Improvement: 'border-success/30 text-success',
}

export const QC_STYLE = {
  Open: 'text-warning',
  Reopen: 'text-danger',
  Closed: 'text-success',
}

export const DEV_STATUS_LABEL = {
  todo: 'To Do',
  in_progress: 'In Progress',
  need_info: 'Butuh Info',
  done_by_claude: 'Done by Claude',
  done: 'Done',
  wont_fix: "Won't Fix",
}

export const ticketNo = (n) => `#${n}`

export const dateOnly = (iso) => (iso ? iso.slice(0, 10) : '')

// The prompt a developer pastes into Claude Code. It carries the summary so
// it works on its own, and the CLI commands so Claude can fetch screenshots
// and report back to this ticket.
export function buildPrompt(t) {
  const lines = [
    `Kerjakan tiket QC #${t.number}.`,
    '',
    `Detail lengkap + lampiran: \`cd backend && go run ./cmd/ticket show ${t.number}\``,
    '',
    `- Platform: ${t.platform} · Role: ${t.role} · Modul: ${t.module}`,
    `- Priority: ${t.priority} · Category: ${t.category} · QC: ${t.qc_status}`,
    '',
    'Issue:',
    t.issue,
  ]
  if (t.steps) lines.push('', 'Langkah reproduksi:', t.steps)
  if (t.expected) lines.push('', 'Hasil yang diharapkan:', t.expected)
  if (t.qc_status === 'Reopen' && t.dev_note) lines.push('', 'Catatan perbaikan sebelumnya (QC membuka ulang):', t.dev_note)
  lines.push(
    '',
    `Mulai: \`go run ./cmd/ticket start ${t.number}\`. Setelah selesai dan build bersih: \`go run ./cmd/ticket done ${t.number} "<apa yang diubah, file, cara QC mengetes>"\`. Kalau butuh info dari QC: \`go run ./cmd/ticket ask ${t.number} "<pertanyaan>"\`.`,
  )
  return lines.join('\n')
}

export async function copyText(text, message = 'Disalin') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('Gagal menyalin ke clipboard')
  }
}

// Splits text pasted from Google Sheets / Excel: tab-separated, and cells with
// newlines or quotes come wrapped in double quotes ("" = a literal quote).
export function parseTSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export const splitPlatforms = (value) =>
  String(value || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

const pick = (options, raw) => {
  const v = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return options.find((o) => o.toLowerCase() === v) || (raw || '').trim()
}

// "14/10/2026" → "2026-10-14"; ISO stays as is.
const toISO = (raw) => {
  const s = (raw || '').trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s
}

// Columns in the QC sheet's order: Date, Platform, Role, Modul, Issue,
// Priority, Category, QC Status. A header row is skipped.
export function rowsFromSheet(text, meta) {
  return parseTSV(text)
    .filter((cells) => cells[0]?.trim().toLowerCase() !== 'date')
    .map((c) => {
      const row = {
        reported_on: toISO(c[0]),
        platform: splitPlatforms(c[1]).map((p) => pick(meta.platforms, p)).join(', '),
        role: pick(meta.roles, c[2]),
        module: (c[3] || '').trim(),
        issue: (c[4] || '').trim(),
        priority: pick(meta.priorities, c[5]),
        category: pick(meta.categories, c[6]),
        qc_status: pick(meta.qc_statuses, c[7] || 'Open'),
      }
      const errors = []
      if (row.reported_on && !/^\d{4}-\d{2}-\d{2}$/.test(row.reported_on)) errors.push('tanggal')
      const platforms = splitPlatforms(row.platform)
      if (!platforms.length || platforms.some((p) => !meta.platforms.includes(p))) errors.push('platform')
      if (!meta.roles.includes(row.role)) errors.push('role')
      if (!row.module) errors.push('modul')
      if (!row.issue) errors.push('issue')
      if (!meta.priorities.includes(row.priority)) errors.push('priority')
      if (!meta.categories.includes(row.category)) errors.push('category')
      if (!meta.qc_statuses.includes(row.qc_status)) errors.push('QC status')
      return { row, errors }
    })
}
