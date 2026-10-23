import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ImagePlus, Loader2, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Textarea from '../../components/ui/Textarea'
import Thumb from '../../components/ui/Thumb'
import { createTicket, updateTicket, uploadTicketAttachment } from '../../api/devTickets'
import { dateOnly, splitPlatforms } from './ticketUtils'
import { cn } from '../../utils/cn'

const today = () => new Date().toLocaleDateString('sv-SE')

const blank = () => ({
  reported_on: today(),
  platform: 'Android',
  role: 'User',
  module: '',
  issue: '',
  steps: '',
  expected: '',
  priority: 'Medium',
  category: 'Bug',
  qc_status: 'Open',
  dev_status: 'todo',
  attachments: [],
})

function Chips({ label, options, isOn, onPick }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[.05em] text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={isOn(p)}
            onClick={() => onPick(p)}
            className={cn(
              'h-[34px] rounded-full border-[1.5px] px-3.5 text-sm transition-colors duration-100',
              isOn(p)
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-surface-border text-text-secondary hover:bg-surface-hover',
            )}
          >
            {p}
          </button>
        ))}
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
    setForm(ticket ? { ...blank(), ...ticket, reported_on: dateOnly(ticket.reported_on), attachments: ticket.attachments || [] } : blank())
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
    mutation.mutate(form)
  }

  if (!meta) return null

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit tiket #${ticket.number}` : 'Tiket baru'} size="lg">
      <form onSubmit={submit} onPaste={onPaste} className="space-y-4">
        <Chips label="Platform" options={meta.platforms} isOn={(p) => picked.includes(p)} onPick={togglePlatform} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Chips label="Priority" options={meta.priorities} isOn={(p) => form.priority === p} onPick={(p) => setForm((f) => ({ ...f, priority: p }))} />
          <Chips label="Category" options={meta.categories} isOn={(p) => form.category === p} onPick={(p) => setForm((f) => ({ ...f, category: p }))} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Tanggal" type="date" value={form.reported_on} onChange={set('reported_on')} />
          <Select label="Role" value={form.role} onChange={set('role')}>
            {meta.roles.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          <div className="col-span-2 sm:col-span-1">
            <Input label="Modul" list="dev-ticket-modules" value={form.module} onChange={set('module')} placeholder="mis. Profil" required />
            <datalist id="dev-ticket-modules">
              {meta.modules.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        <Textarea
          label="Issue"
          rows={4}
          value={form.issue}
          onChange={set('issue')}
          placeholder="Apa yang salah / apa yang diminta. Tulis jelas: di layar mana, apa yang terjadi."
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea
            label="Langkah reproduksi (opsional)"
            rows={3}
            value={form.steps}
            onChange={set('steps')}
            placeholder={'1. Login sebagai ikhwan\n2. Buka Profil\n3. …'}
          />
          <Textarea label="Hasil yang diharapkan (opsional)" rows={3} value={form.expected} onChange={set('expected')} />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[.05em] text-text-secondary">Screenshot</p>
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

        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="QC status" value={form.qc_status} onChange={set('qc_status')}>
              {meta.qc_statuses.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
            <Select label="Status development" value={form.dev_status} onChange={set('dev_status')}>
              {meta.dev_statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
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
