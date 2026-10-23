import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Textarea from '../../components/ui/Textarea'
import { importTickets } from '../../api/devTickets'
import { rowsFromSheet } from './ticketUtils'
import { CategoryBadge, PriorityBadge } from './TicketBits'

function ImportModal({ open, onClose, meta }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const parsed = useMemo(() => (meta && text.trim() ? rowsFromSheet(text, meta) : []), [text, meta])
  const invalid = parsed.filter((p) => p.errors.length).length

  const close = () => {
    setText('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () => importTickets(parsed.map((p) => p.row)),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['dev-tickets'] })
      queryClient.invalidateQueries({ queryKey: ['dev-ticket-meta'] })
      close()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal mengimpor'),
  })

  return (
    <Modal open={open} onClose={close} title="Import dari spreadsheet QC" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Di Google Sheets, blok baris tiket (boleh termasuk header) lalu salin dan tempel di bawah. Urutan kolom:{' '}
          <span className="font-medium text-text-primary">Date · Platform · Role · Modul · Issue · Priority · Category · QC Status</span>.
        </p>
        {!meta && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">
            Daftar opsi tiket gagal dimuat dari server, jadi baris belum bisa dibaca. Pastikan backend sudah di-restart (menjalankan versi terbaru), lalu muat ulang halaman.
          </p>
        )}
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tempel di sini (Ctrl/⌘ V)…"
          className="font-mono text-xs"
        />
        {parsed.length > 0 && (
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-surface-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-bg text-text-tertiary">
                <tr>
                  {['Tanggal', 'Platform', 'Role', 'Modul', 'Issue', 'Priority', 'Category', 'QC'].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {parsed.map(({ row, errors }, i) => (
                  <tr key={i} className={errors.length ? 'bg-danger-bg/60' : ''} title={errors.length ? `Tidak valid: ${errors.join(', ')}` : ''}>
                    <td className="whitespace-nowrap px-3 py-2">{row.reported_on}</td>
                    <td className="px-3 py-2">{row.platform}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.role}</td>
                    <td className="px-3 py-2">{row.module}</td>
                    <td className="px-3 py-2">
                      <span className="line-clamp-2 max-w-sm">{row.issue}</span>
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={row.priority} />
                    </td>
                    <td className="px-3 py-2">
                      <CategoryBadge category={row.category} />
                    </td>
                    <td className="px-3 py-2">{row.qc_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-surface-border pt-4">
          <p className="text-xs text-text-tertiary">
            {parsed.length > 0 &&
              (invalid ? (
                <span className="text-danger">{invalid} baris belum valid (arahkan kursor ke baris merah untuk detail)</span>
              ) : (
                `${parsed.length} tiket siap diimpor`
              ))}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Batal
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!parsed.length || invalid > 0 || mutation.isPending}>
              {mutation.isPending ? 'Mengimpor…' : `Import ${parsed.length || ''} tiket`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default ImportModal
