import { useState } from 'react'
import { formatDateTime } from '../../utils/date'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bot, Copy, Pencil, Ticket, AlertCircle, CheckCircle2, ListOrdered, Send, Trash2, ArrowRightLeft, Terminal } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Thumb from '../../components/ui/Thumb'
import { getTicket, setTicketStatus, addTicketComment } from '../../api/devTickets'
import { buildPrompt, copyText } from './ticketUtils'
import { CategoryBadge, Linkified, Platform, PriorityBadge, StatusBadge } from './TicketBits'
import { cn } from '../../utils/cn'

const fmt = formatDateTime

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-[.05em] text-text-tertiary">{title}</p>
      {children}
    </div>
  )
}

const TONES = {
  danger: { bar: 'border-l-danger', icon: 'bg-danger-bg text-danger' },
  info: { bar: 'border-l-info', icon: 'bg-info-bg text-info' },
  success: { bar: 'border-l-success', icon: 'bg-success-bg text-success' },
}

// Titled card with a colored left edge and an icon chip.
function DetailCard({ icon: Icon, title, tone, children }) {
  const t = TONES[tone]
  return (
    <div className={cn('min-w-0 rounded-lg border border-l-4 border-surface-border bg-surface-card p-4', t.bar)}>
      <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.05em] text-text-secondary">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', t.icon)}>
          <Icon size={14} />
        </span>
        {title}
      </p>
      {children}
    </div>
  )
}

// "1. login\n2. buka users" → numbered steps; the typed numbering is replaced by the badges.
function Steps({ text }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <ol className="space-y-2">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info-bg text-[11px] font-bold text-info">
            {i + 1}
          </span>
          <Linkified text={line.replace(/^\d+[.)]\s*/, '')} className="text-sm text-text-primary" />
        </li>
      ))}
    </ol>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-right text-text-primary">{children}</span>
    </div>
  )
}

function TicketDetailModal({ number, onClose, meta, canEdit, canDelete, onEdit, onDelete }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['dev-ticket', number],
    queryFn: () => getTicket(number),
    enabled: !!number,
  })
  const t = data?.data?.ticket
  const comments = data?.data?.comments || []

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dev-ticket', number] })
    queryClient.invalidateQueries({ queryKey: ['dev-tickets'] })
    queryClient.invalidateQueries({ queryKey: ['dev-ticket-meta'] })
  }

  const status = useMutation({
    mutationFn: (body) => setTicketStatus(number, body),
    onSuccess: () => {
      toast.success('Status diubah')
      refresh()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal mengubah status'),
  })

  const addComment = useMutation({
    mutationFn: () => addTicketComment(number, comment),
    onSuccess: () => {
      setComment('')
      refresh()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal mengirim komentar'),
  })

  const gallery = (t?.attachments || []).map((p, i) => ({ path: p, label: `Screenshot ${i + 1}` }))
  const claudeNote = t?.dev_by?.startsWith('Claude')

  return (
    <Modal open={!!number} onClose={onClose} title={t ? `Tiket #${t.number}` : 'Tiket'} icon={Ticket} size="xl">
      {isLoading || !t ? (
        <div className="py-16 text-center text-sm text-text-tertiary">Memuat…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={t.priority} />
                <CategoryBadge category={t.category} />
                <StatusBadge status={t.status} />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">{t.module}</h2>
            </div>

            <DetailCard icon={AlertCircle} title="Issue" tone="danger">
              <Linkified text={t.issue} className="text-sm leading-relaxed text-text-primary" />
            </DetailCard>

            {(t.steps || t.expected) && (
              <div className="grid items-stretch gap-4 sm:grid-cols-2">
                {t.steps && (
                  <DetailCard icon={ListOrdered} title="Langkah reproduksi" tone="info">
                    <Steps text={t.steps} />
                  </DetailCard>
                )}
                {t.expected && (
                  <DetailCard icon={CheckCircle2} title="Hasil yang diharapkan" tone="success">
                    <Linkified text={t.expected} className="text-sm leading-relaxed text-text-primary" />
                  </DetailCard>
                )}
              </div>
            )}

            {gallery.length > 0 && (
              <Section title={`Screenshot (${gallery.length})`}>
                <div className="flex flex-wrap gap-2">
                  {gallery.map((g) => (
                    <Thumb key={g.path} path={g.path} isPrivate thumb gallery={gallery} alt={g.label} className="h-24 w-24" />
                  ))}
                </div>
              </Section>
            )}

            {t.dev_note && (
              <div className={cn('rounded-lg border px-4 py-3', claudeNote ? 'border-[#d9cdfa] bg-[#f7f4fe] dark:border-[#4a3f7a] dark:bg-[#26213d]' : 'border-surface-border')}>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#6d4ad6] dark:text-[#b9a6f7]">
                  {claudeNote && <Bot size={14} />} Catatan development · {t.dev_by}
                </p>
                <Linkified text={t.dev_note} className="text-sm text-text-primary" />
              </div>
            )}

            <Section title="Timeline">
              {canEdit && (
                <div className="mb-4 flex items-stretch gap-2">
                  <div className="flex-1">
                    <Textarea
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Tulis komentar… (mis. hasil retest QC)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && comment.trim()) addComment.mutate()
                      }}
                    />
                  </div>
                  <Button className="!h-auto" onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending} aria-label="Kirim">
                    <Send size={15} />
                  </Button>
                </div>
              )}
              <ol className="relative space-y-3 border-l border-surface-border pl-4">
                {[...comments].reverse().map((c) => (
                  <li key={c.uuid}>
                    <span
                      className={cn(
                        'absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full',
                        c.is_claude ? 'bg-[#6d4ad6] dark:bg-[#9c84ee]' : c.kind === 'status' ? 'bg-info' : 'bg-primary',
                      )}
                    />
                    <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                      {c.is_claude && <Bot size={12} className="text-[#6d4ad6] dark:text-[#b9a6f7]" />}
                      {c.kind === 'status' && <ArrowRightLeft size={12} />}
                      <span className="font-medium text-text-secondary">{c.author}</span> · {fmt(c.created_at)}
                    </p>
                    <Linkified
                      text={c.body}
                      className={cn('mt-0.5 text-sm', c.kind === 'status' ? 'text-text-secondary' : 'text-text-primary')}
                    />
                  </li>
                ))}
                <li className="text-xs text-text-tertiary">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-surface-border-hover" />
                  {fmt(t.created_at)} · Dilaporkan oleh {t.reporter || '—'}
                </li>
              </ol>
            </Section>
          </div>

          <aside className="space-y-4 lg:border-l lg:border-surface-border lg:pl-6">
            <Button className="w-full" onClick={() => copyText(buildPrompt(t), 'Prompt disalin — tempel ke Claude Code')}>
              <Copy size={15} /> Salin prompt Claude
            </Button>
            <button
              type="button"
              onClick={() => copyText(`kerjakan tiket ${t.number}`, 'Disalin')}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-surface-border px-3 py-2 text-left font-mono text-xs text-text-secondary hover:bg-surface-hover"
              title="Versi pendek — Claude mengambil detail sendiri lewat CLI"
            >
              <Terminal size={13} className="shrink-0" />
              kerjakan tiket {t.number}
            </button>

            {canEdit && meta && (
              <div className="space-y-3">
                <Select
                  label="Status"
                  value={t.status}
                  disabled={status.isPending}
                  onChange={(e) => status.mutate({ status: e.target.value })}
                >
                  {meta.statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="divide-y divide-surface-border rounded-lg border border-surface-border px-3">
              <Row label="Tanggal">{fmt(t.reported_on)}</Row>
              <Row label="Platform">
                <Platform platform={t.platform} />
              </Row>
              <Row label="Role">{t.role || '—'}</Row>
              <Row label="Pelapor">{t.reporter || '—'}</Row>
              {t.dev_at && <Row label="Dev update">{fmt(t.dev_at)}</Row>}
            </div>

            {(canEdit || canDelete) && (
              <div className="flex gap-2">
                {canEdit && (
                  <Button variant="secondary" className="flex-1" onClick={() => onEdit(t)}>
                    <Pencil size={14} /> Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="secondary" className="text-danger" onClick={() => onDelete(t)} aria-label="Hapus">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  )
}

export default TicketDetailModal
