import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Bot, Copy, Pencil, Send, Trash2, ArrowRightLeft, Terminal } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Thumb from '../../components/ui/Thumb'
import { getTicket, setTicketStatus, addTicketComment } from '../../api/devTickets'
import { buildPrompt, copyText, dateOnly } from './ticketUtils'
import { CategoryBadge, DevStatusBadge, Linkified, Platform, PriorityBadge, QCStatus } from './TicketBits'
import { cn } from '../../utils/cn'

const fmt = (iso) => format(new Date(iso), 'dd/MM/yyyy HH:mm')

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-[.05em] text-text-tertiary">{title}</p>
      {children}
    </div>
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
    <Modal open={!!number} onClose={onClose} title={t ? `Tiket #${t.number}` : 'Tiket'} size="xl">
      {isLoading || !t ? (
        <div className="py-16 text-center text-sm text-text-tertiary">Memuat…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={t.priority} />
                <CategoryBadge category={t.category} />
                <DevStatusBadge status={t.dev_status} />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">{t.module}</h2>
            </div>

            <Linkified text={t.issue} className="rounded-lg border border-surface-border bg-surface-bg/60 px-4 py-3 text-sm leading-relaxed text-text-primary" />

            {(t.steps || t.expected) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {t.steps && (
                  <Section title="Langkah reproduksi">
                    <Linkified text={t.steps} className="text-sm text-text-secondary" />
                  </Section>
                )}
                {t.expected && (
                  <Section title="Hasil yang diharapkan">
                    <Linkified text={t.expected} className="text-sm text-text-secondary" />
                  </Section>
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
              <ol className="relative space-y-3 border-l border-surface-border pl-4">
                <li className="text-xs text-text-tertiary">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-surface-border-hover" />
                  {fmt(t.created_at)} · Dilaporkan oleh {t.reporter || '—'}
                </li>
                {comments.map((c) => (
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
              </ol>
              {canEdit && (
                <div className="mt-4 flex items-end gap-2">
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
                  <Button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending} aria-label="Kirim">
                    <Send size={15} />
                  </Button>
                </div>
              )}
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
                  label="Status development"
                  value={t.dev_status}
                  disabled={status.isPending}
                  onChange={(e) => status.mutate({ dev_status: e.target.value })}
                >
                  {meta.dev_statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="QC status"
                  value={t.qc_status}
                  disabled={status.isPending}
                  onChange={(e) => status.mutate({ qc_status: e.target.value })}
                >
                  {meta.qc_statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </div>
            )}

            <div className="divide-y divide-surface-border rounded-lg border border-surface-border px-3">
              <Row label="Tanggal">{dateOnly(t.reported_on).split('-').reverse().join('/')}</Row>
              <Row label="Platform">
                <Platform platform={t.platform} />
              </Row>
              <Row label="Role">{t.role}</Row>
              <Row label="QC">
                <QCStatus status={t.qc_status} />
              </Row>
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
