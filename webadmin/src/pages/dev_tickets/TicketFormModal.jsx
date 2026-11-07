import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bug, Check, ImagePlus, Loader2, MessageSquarePlus, Monitor, Ticket, TrendingUp, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Thumb from '../../components/ui/Thumb'
import { createTicket, updateTicket, uploadTicketAttachment } from '../../api/devTickets'
import { splitPlatforms } from './ticketUtils'
import { PLATFORM_ICON } from './TicketBits'
import { cn } from '../../utils/cn'

// <input type=datetime-local> works with "yyyy-MM-ddTHH:mm" in local time.
const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm"
const nowLocal = () => format(new Date(), LOCAL_FMT)

const blank = () => ({
  reported_on: nowLocal(),
  platform: 'Android',
  role: '',
  module: '',
  issue: '',
  steps: '',
  expected: '',
  priority: 'Medium',
  category: 'Bug',
  status: 'open',
  attachments: [],
})

const label_cls = 'text-xs font-medium uppercase tracking-[.05em] text-text-secondary'

// Multi-select tiles with a platform icon and a check box.
function PlatformPicker({ options, isOn, onPick }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label_cls}>Platform</span>
      <div className="flex flex-wrap gap-2">
        {options.map((p) => {
          const Icon = PLATFORM_ICON[p] || Monitor
          const on = isOn(p)
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={cn(
                'flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border-[1.5px] px-3 text-[13px] transition-colors duration-100',
                on
                  ? 'border-primary bg-primary font-medium text-white'
                  : 'border-surface-border text-text-secondary hover:bg-surface-hover',
              )}
            >
              <Icon size={15} className="shrink-0" />
              {p}
              {on && <Check size={14} strokeWidth={3} className="shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const PRIORITY_COLOR = {
  Low: { on: 'bg-slate-500 text-white', dot: 'bg-slate-400' },
  Medium: { on: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  High: { on: 'bg-orange-600 text-white', dot: 'bg-orange-600' },
  Critical: { on: 'bg-danger text-white', dot: 'bg-danger' },
}

// Single-select severity scale: one joined bar, each level in its own color.
function PriorityPicker({ options, value, onPick }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label_cls}>Priority</span>
      <div className="flex overflow-hidden rounded-lg border-[1.5px] border-surface-border">
        {options.map((p, i) => {
          const on = value === p
          const c = PRIORITY_COLOR[p] || PRIORITY_COLOR.Low
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] transition-colors duration-100',
                i > 0 && 'border-l border-surface-border',
                on ? cn('font-semibold', c.on) : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              {!on && <span className={cn('h-2 w-2 rounded-full', c.dot)} />}
              {p}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const CATEGORY_UI = {
  Bug: { icon: Bug, on: 'border-danger bg-danger-bg text-danger' },
  Request: { icon: MessageSquarePlus, on: 'border-info bg-info-bg text-info' },
  Improvement: { icon: TrendingUp, on: 'border-success bg-success-bg text-success' },
}

// Single-select cards, icon above the label.
function CategoryPicker({ options, value, onPick }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={label_cls}>Category</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((p) => {
          const ui = CATEGORY_UI[p] || CATEGORY_UI.Bug
          const Icon = ui.icon
          const on = value === p
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border-[1.5px] px-2 py-2 text-[13px] transition-colors duration-100',
                on ? cn('font-semibold', ui.on) : 'border-surface-border text-text-secondary hover:bg-surface-hover',
              )}
            >
              <Icon size={18} />
              {p}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TicketFormModal({ open, onClose, ticket, meta, onSaved }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(blank)
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)
  const editing = !!ticket

  useEffect(() => {
    if (!open) return
    setForm(ticket ? { ...blank(), ...ticket, reported_on: format(new Date(ticket.reported_on), LOCAL_FMT), attachments: ticket.attachments || [] } : blank())
  }, [open, ticket])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const picked = splitPlatforms(form.platform)
  const togglePlatform = (p) =>
    setForm((f) => {
      const cur = splitPlatforms(f.platform)
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]
      return { ...f, platform: meta.platforms.filter((x) => next.includes(x)).join(', ') }
    })

  const upload = async (files) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setUploading((n) => n + images.length)
    for (const file of images) {
      try {
        const res = await uploadTicketAttachment(file)
        setForm((f) => ({ ...f, attachments: [...f.attachments, res.data.path] }))
      } catch (err) {
        toast.error(err.response?.data?.message || `Gagal upload ${file.name}`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  // Screenshots are usually on the clipboard (prnt.sc, Cmd+Shift+4), so a
  // plain paste anywhere in the form attaches them.
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile())
    if (files.length) {
      e.preventDefault()
      upload(files)
    }
  }

  const mutation = useMutation({
    mutationFn: (data) => (editing ? updateTicket(ticket.number, data) : createTicket(data)),
    onSuccess: (res) => {
      toast.success(editing ? 'Tiket disimpan' : `Tiket #${res.data.number} dibuat`)
      queryClient.invalidateQueries({ queryKey: ['dev-tickets'] })
      queryClient.invalidateQueries({ queryKey: ['dev-ticket-meta'] })
      queryClient.invalidateQueries({ queryKey: ['dev-ticket', res.data.number] })
      onSaved?.(res.data)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menyimpan tiket'),
  })

  const submit = (e) => {
    e.preventDefault()
    if (!picked.length) {
      toast.error('Pilih minimal satu platform')
      return
    }
    mutation.mutate({ ...form, reported_on: new Date(form.reported_on || Date.now()).toISOString() })
  }

  if (!meta) return null

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit tiket #${ticket.number}` : 'Tiket baru'}
      description="Catat bug atau tugas untuk tim development."
      icon={Ticket}
      size="xl"
    >
      <form onSubmit={submit} onPaste={onPaste} className="space-y-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-text-tertiary">Detail masalah</p>
            <Textarea
              label="Issue"
              wrapperClassName="grow"
              rows={8}
              value={form.issue}
              onChange={set('issue')}
              placeholder="Apa yang salah / apa yang diminta. Tulis jelas: di layar mana, apa yang terjadi."
              required
            />
            <Textarea
              label="Langkah reproduksi (opsional)"
              wrapperClassName="grow"
              rows={5}
              value={form.steps}
              onChange={set('steps')}
              placeholder={'1. Login sebagai ikhwan\n2. Buka Profil\n3. …'}
            />
            <Textarea label="Hasil yang diharapkan (opsional)" wrapperClassName="grow" rows={4} value={form.expected} onChange={set('expected')} />
          </div>

          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-text-tertiary">Klasifikasi</p>
            <PlatformPicker options={meta.platforms} isOn={(p) => picked.includes(p)} onPick={togglePlatform} />
            <PriorityPicker options={meta.priorities} value={form.priority} onPick={(p) => setForm((f) => ({ ...f, priority: p }))} />
            <CategoryPicker options={meta.categories} value={form.category} onPick={(p) => setForm((f) => ({ ...f, category: p }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tanggal & jam" type="datetime-local" value={form.reported_on} onChange={set('reported_on')} />
              <Select label="Role (opsional)" value={form.role} onChange={set('role')}>
                <option value="">—</option>
                {meta.roles.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="Modul" list="dev-ticket-modules" value={form.module} onChange={set('module')} placeholder="mis. Profil" required />
                <datalist id="dev-ticket-modules">
                  {meta.modules.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              {editing && (
                <Select label="Status" value={form.status} onChange={set('status')}>
                  {meta.statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[.05em] text-text-secondary">Screenshot (opsional)</p>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  upload(e.dataTransfer.files)
                }}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-lg border-[1.5px] border-dashed p-3 transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-surface-border',
                )}
              >
                {form.attachments.map((p) => (
                  <div key={p} className="group relative">
                    <Thumb path={p} isPrivate thumb className="h-16 w-16" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((x) => x !== p) }))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-text-primary p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Hapus lampiran"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <div key={i} className="flex h-16 w-16 items-center justify-center rounded bg-surface-hover">
                    <Loader2 size={16} className="animate-spin text-text-tertiary" />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-16 items-center gap-2 rounded px-3 text-xs text-text-secondary hover:bg-surface-hover"
                >
                  <ImagePlus size={18} />
                  <span className="text-left">
                    Pilih, drag &amp; drop,
                    <br />
                    atau <kbd className="rounded border border-surface-border px-1">Ctrl/⌘ V</kbd> screenshot
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    upload(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

          </div>
        </div>

        <div className="modal-footer -mx-[26px] mt-2 flex justify-end gap-2 border-t border-surface-border bg-surface-hover/40 px-[26px] py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={mutation.isPending || uploading > 0}>
            {mutation.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Buat tiket'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default TicketFormModal
