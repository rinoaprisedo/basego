import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Copy, KeyRound, Trash2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { createApiToken, deleteApiToken, getApiTokens } from '../../api/devTickets'
import { apiOrigin } from '../../utils/url'
import { copyText } from './ticketUtils'

function Code({ children }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-md bg-[#1e1e2e] px-3 py-2.5 font-mono text-xs leading-relaxed text-[#e4e4ef]">{children}</pre>
      <button
        type="button"
        onClick={() => copyText(children)}
        className="absolute right-1.5 top-1.5 rounded p-1 text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
        aria-label="Salin"
      >
        <Copy size={13} />
      </button>
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {children}
      </div>
    </div>
  )
}

function ClaudeAccessModal({ open, onClose, canEdit }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [created, setCreated] = useState(null)

  const { data } = useQuery({ queryKey: ['dev-api-tokens'], queryFn: getApiTokens, enabled: open })
  const tokens = data?.data || []

  const create = useMutation({
    mutationFn: () => createApiToken(name),
    onSuccess: (res) => {
      setCreated(res.data.token)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['dev-api-tokens'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal membuat token'),
  })
  const revoke = useMutation({
    mutationFn: (uuid) => deleteApiToken(uuid),
    onSuccess: () => {
      toast.success('Token dicabut')
      queryClient.invalidateQueries({ queryKey: ['dev-api-tokens'] })
    },
  })

  const close = () => {
    setCreated(null)
    onClose()
  }

  const envFile = `BASEGO_TICKET_API=${apiOrigin}/api/v1\nBASEGO_TICKET_TOKEN=${created || 'basego_dev_…'}`

  return (
    <Modal open={open} onClose={close} title="Akses Claude Code" size="lg">
      <div className="space-y-6">
        <p className="text-sm text-text-secondary">
          Claude Code membaca tiket, mengunduh screenshot, lalu menandai tiket <b>In Progress</b> → <b>Done by Claude</b> beserta catatan perbaikannya, lewat
          token di bawah. Status <b>Done</b> tetap diputuskan setelah QC retest.
        </p>

        <Step n={1} title="Buat token untuk mesin developer">
          {canEdit ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) create.mutate()
              }}
            >
              <div className="flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. MacBook Rino" maxLength={100} />
              </div>
              <Button type="submit" disabled={!name.trim() || create.isPending} className="h-[42px]">
                <KeyRound size={15} /> Buat token
              </Button>
            </form>
          ) : (
            <p className="text-xs text-text-tertiary">Butuh izin edit pada menu Tiket.</p>
          )}
          {created && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">Token hanya ditampilkan sekali — salin sekarang ke langkah 2.</p>
          )}
        </Step>

        <Step n={2} title={<>Simpan di <code className="font-mono text-xs">.ticket.env</code> di root repo (sudah di-gitignore)</>}>
          <Code>{envFile}</Code>
        </Step>

        <Step n={3} title="Minta Claude mengerjakan">
          <Code>{'kerjakan tiket 12'}</Code>
          <p className="text-xs text-text-tertiary">
            Atau <span className="font-mono">kerjakan semua tiket High yang masih To Do</span>. Claude memakai{' '}
            <span className="font-mono">go run ./cmd/ticket list|show|start|done|ask</span> (lihat CLAUDE.md → Tiket QC).
          </p>
        </Step>

        {tokens.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[.05em] text-text-tertiary">Token aktif</p>
            <div className="divide-y divide-surface-border rounded-lg border border-surface-border">
              {tokens.map((t) => (
                <div key={t.uuid} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <KeyRound size={14} className="text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">{t.name}</p>
                    <p className="text-[11px] text-text-tertiary">
                      <span className="font-mono">{t.prefix}…</span> · dibuat {t.created_by} {format(new Date(t.created_at), 'dd/MM/yyyy')} ·{' '}
                      {t.last_used_at ? `terakhir dipakai ${format(new Date(t.last_used_at), 'dd/MM/yyyy HH:mm')}` : 'belum dipakai'}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => revoke.mutate(t.uuid)}
                      className="rounded p-1.5 text-text-tertiary hover:bg-danger-bg hover:text-danger"
                      aria-label="Cabut token"
                      title="Cabut token"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default ClaudeAccessModal
