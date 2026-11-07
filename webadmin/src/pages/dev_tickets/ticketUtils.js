import toast from 'react-hot-toast'

export const STATUS_STYLE = {
  open: 'bg-surface-hover text-text-secondary',
  in_progress: 'bg-info-bg text-info',
  need_info: 'bg-warning-bg text-warning',
  done_dev: 'bg-[#efe9fd] text-[#6d4ad6] dark:bg-[#2b2547] dark:text-[#b9a6f7]',
  deployed: 'bg-success-bg text-success',
  closed: 'bg-surface-hover text-text-tertiary',
  reopen: 'bg-danger-bg text-danger',
}

export const STATUS_DOT = {
  open: 'bg-text-tertiary',
  in_progress: 'bg-info',
  need_info: 'bg-warning',
  done_dev: 'bg-[#6d4ad6] dark:bg-[#9c84ee]',
  deployed: 'bg-success',
  closed: 'bg-surface-border-hover',
  reopen: 'bg-danger',
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

export const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In Progress',
  need_info: 'Need Info',
  done_dev: 'Done Dev',
  deployed: 'Deployed',
  closed: 'Closed',
  reopen: 'Re Open',
}

export const ticketNo = (n) => `#${n}`


// The prompt a developer pastes into Claude Code. It carries the summary so
// it works on its own, and the CLI commands so Claude can fetch screenshots
// and report back to this ticket.
export function buildPrompt(t) {
  const lines = [
    `Kerjakan tiket QC #${t.number}.`,
    '',
    `Detail lengkap + lampiran: \`cd backend && go run ./cmd/ticket show ${t.number}\``,
    '',
    `- Platform: ${t.platform} · Role: ${t.role || '—'} · Modul: ${t.module}`,
    `- Priority: ${t.priority} · Category: ${t.category} · Status: ${STATUS_LABEL[t.status] || t.status}`,
    '',
    'Issue:',
    t.issue,
  ]
  if (t.steps) lines.push('', 'Langkah reproduksi:', t.steps)
  if (t.expected) lines.push('', 'Hasil yang diharapkan:', t.expected)
  if (t.status === 'reopen' && t.dev_note) lines.push('', 'Catatan perbaikan sebelumnya (QC membuka ulang):', t.dev_note)
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

// "14/10/2026" or "14/10/2026 09:30" → "2026-10-14" / "2026-10-14 09:30"; ISO stays as is.
const toISO = (raw) => {
  const s = (raw || '').trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/)
  if (!m) return s
  const day = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return m[4] ? `${day} ${m[4].padStart(2, '0')}:${m[5]}` : day
}

// Matches a sheet cell ("Open", "Re Open", "in_progress"...) to a status value;
// empty = open, unknown = '' (reported as invalid).
const statusKey = (v) => String(v).toLowerCase().replace(/[\s_-]/g, '')
function statusFromCell(statuses, raw) {
  const k = statusKey(raw || 'open')
  return statuses.find((s) => statusKey(s.value) === k || statusKey(s.label) === k)?.value || ''
}

// Columns in the QC sheet's order: Date, Platform, Role, Modul, Issue,
// Priority, Category, Status (optional, default Open). A header row is skipped.
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
        status: statusFromCell(meta.statuses, c[7]),
      }
      const errors = []
      if (row.reported_on && !/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$/.test(row.reported_on)) errors.push('tanggal')
      const platforms = splitPlatforms(row.platform)
      if (!platforms.length || platforms.some((p) => !meta.platforms.includes(p))) errors.push('platform')
      if (row.role && !meta.roles.includes(row.role)) errors.push('role')
      if (!row.module) errors.push('modul')
      if (!row.issue) errors.push('issue')
      if (!meta.priorities.includes(row.priority)) errors.push('priority')
      if (!meta.categories.includes(row.category)) errors.push('category')
      if (!row.status) errors.push('status')
      return { row, errors }
    })
}
