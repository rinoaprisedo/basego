import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, UserPlus, UserCog, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { cn } from '../../utils/cn'
import { downloadUserImportTemplate, validateUserImport, getUserImportJob, commitUserImport } from '../../api/users'

const FIELDS = [
  { key: 'name', label: 'Nama' },
  { key: 'password', label: 'Password' },
  { key: 'status', label: 'Status' },
  { key: 'role', label: 'Role' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ProgressBar({ label, value, detail }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-tertiary">{detail}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn('h-full rounded-full bg-primary transition-[width] duration-300', value == null && 'w-1/3 animate-pulse')}
          style={value == null ? undefined : { width: `${Math.max(2, Math.round(value * 100))}%` }}
        />
      </div>
    </div>
  )
}

function ModeCard({ icon: Icon, title, desc, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-start gap-3 rounded-xl border-[1.5px] p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-primary bg-primary/5' : 'border-surface-border hover:bg-surface-hover',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-white' : 'bg-surface-hover text-text-secondary')}>
        <Icon size={17} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="block text-xs text-text-secondary">{desc}</span>
      </span>
    </button>
  )
}

// phases: setup → running (upload / validating / importing) → invalid | done
function UserImportModal({ open, onClose, canInsert, canUpdate }) {
  const queryClient = useQueryClient()
  const fileRef = useRef(null)
  const cancelled = useRef(false)
  const [mode, setMode] = useState('insert')
  const [fields, setFields] = useState([])
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState('setup')
  const [stage, setStage] = useState('upload') // upload | validating | importing
  const [upload, setUpload] = useState(0)
  const [job, setJob] = useState(null)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    if (!open) return
    cancelled.current = false
    setMode(canInsert ? 'insert' : 'update')
    setFields([])
    setFile(null)
    setPhase('setup')
    setJob(null)
    setFailure('')
    return () => {
      cancelled.current = true
    }
  }, [open, canInsert])

  const pickFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) return toast.error('File harus berformat .xlsx')
    setFile(f)
  }

  const toggleField = (k) => setFields((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  const allSelected = fields.length === FIELDS.length

  const poll = async (token, until) => {
    for (;;) {
      if (cancelled.current) return null
      const j = await getUserImportJob(token)
      setJob(j)
      if (until(j)) return j
      await sleep(350)
    }
  }

  const run = async () => {
    setPhase('running')
    setStage('upload')
    setUpload(0)
    setJob(null)
    setFailure('')
    try {
      const started = await validateUserImport(mode, file, fields, (e) => e.total && setUpload(e.loaded / e.total))
      setStage('validating')
      const checked = await poll(started.token, (j) => j.status !== 'validating')
      if (!checked) return
      if (checked.status === 'invalid') return setPhase('invalid')
      if (checked.status !== 'valid') throw new Error(checked.message || 'Pemeriksaan gagal')

      setStage('importing')
      await commitUserImport(mode, started.token)
      const done = await poll(started.token, (j) => j.status === 'done' || j.status === 'failed')
      if (!done) return
      if (done.status === 'failed') throw new Error(done.message || 'Import gagal')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setPhase('done')
    } catch (err) {
      setFailure(err.response?.data?.message || err.message || 'Import gagal')
      setPhase('failed')
    }
  }

  const reset = () => {
    setPhase('setup')
    setJob(null)
    setFailure('')
  }

  const canRun = file && (mode === 'insert' || fields.length > 0)
  const running = phase === 'running'

  let progress = null
  if (running) {
    if (stage === 'upload') progress = { label: 'Mengunggah file…', value: upload, detail: `${Math.round(upload * 100)}%` }
    else if (stage === 'validating')
      progress = {
        label: 'Memeriksa kesesuaian data…',
        value: job?.total ? job.checked / job.total : null,
        detail: job ? `${job.checked} / ${job.total} baris` : '',
      }
    else
      progress = {
        label: 'Menyimpan data…',
        value: job?.total && job.processed ? job.processed / job.total : null,
        detail: job ? `${job.total} baris` : '',
      }
  }

  return (
    <Modal
      open={open}
      onClose={running ? () => {} : onClose}
      title="Import Users"
      description="Tambah atau perbarui banyak user sekaligus dari file Excel."
      icon={Upload}
      size="lg"
    >
      <div className="space-y-5">
        {(phase === 'setup' || running) && (
          <>
            <button
              type="button"
              onClick={() => downloadUserImportTemplate().catch(() => toast.error('Gagal mengunduh template'))}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Download size={16} /> Download Template
            </button>

            <div className="flex flex-col gap-3 sm:flex-row">
              <ModeCard icon={UserPlus} title="Insert" desc="Tambah user baru" active={mode === 'insert'} disabled={!canInsert || running} onClick={() => setMode('insert')} />
              <ModeCard icon={UserCog} title="Update" desc="Perbarui user yang emailnya sama" active={mode === 'update'} disabled={!canUpdate || running} onClick={() => setMode('update')} />
            </div>

            {mode === 'update' && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[.05em] text-text-secondary">
                    Kolom yang diperbarui ({fields.length} dipilih)
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={allSelected}
                      disabled={running}
                      onChange={() => setFields(allSelected ? [] : FIELDS.map((f) => f.key))}
                    />
                    Pilih semua
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl border-[1.5px] border-surface-border p-3 sm:grid-cols-4">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={fields.includes(f.key)}
                        disabled={running}
                        onChange={() => toggleField(f.key)}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-text-tertiary">
                  Baris dicocokkan lewat kolom Email. Hanya kolom yang dicentang yang diubah — kolom lain di file diabaikan. Name, Password dan Status
                  yang dicentang wajib terisi; Role dikosongkan untuk menghapus role user. Gunakan file hasil Export sebagai dasar.
                </p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[.05em] text-text-secondary">File (.xlsx)</p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !running && fileRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && !running && fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  if (!running) pickFile(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-4 py-4 transition-colors hover:border-primary/60 hover:bg-primary/5',
                  dragging ? 'border-primary bg-primary/5' : 'border-surface-border',
                )}
              >
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {file ? <FileSpreadsheet size={22} /> : <Upload size={22} />}
                </span>
                {file ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
                    <p className="text-xs text-text-tertiary">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-text-primary">
                      <span className="font-medium text-primary">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-text-tertiary">Isi data memakai template di atas · maks 2000 baris, 5 MB</p>
                  </div>
                )}
                {file && !running && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                    }}
                    className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                    aria-label="Hapus file"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {progress && (
              <div className="rounded-xl border border-surface-border bg-surface-hover/40 p-4">
                <ProgressBar {...progress} />
              </div>
            )}
          </>
        )}

        {phase === 'invalid' && job && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-bg p-4">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-semibold text-danger">Data belum sesuai — tidak ada yang diproses</p>
                <p className="text-[13px] text-text-secondary">
                  {job.error_count} masalah ditemukan dari {job.total} baris. Perbaiki file lalu unggah ulang.
                </p>
              </div>
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-surface-border">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-bg text-xs text-text-tertiary">
                  <tr>
                    <th className="w-16 px-3 py-2 font-medium">Baris</th>
                    <th className="w-28 px-3 py-2 font-medium">Kolom</th>
                    <th className="px-3 py-2 font-medium">Masalah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {job.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono font-semibold text-danger">{e.row}</td>
                      <td className="px-3 py-2 text-text-secondary">{e.field}</td>
                      <td className="px-3 py-2 text-text-primary">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {job.error_count > job.errors.length && (
              <p className="text-xs text-text-tertiary">Menampilkan {job.errors.length} dari {job.error_count} masalah pertama.</p>
            )}
          </>
        )}

        {phase === 'done' && job && (
          <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-bg p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" />
            <div>
              <p className="text-sm font-semibold text-success">Import berhasil</p>
              <p className="text-[13px] text-text-secondary">
                {job.mode === 'insert' ? `${job.created} user ditambahkan.` : `${job.updated} user diperbarui.`} Semua {job.total} baris sesuai.
              </p>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-bg p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">Import gagal</p>
              <p className="text-[13px] text-text-secondary">{failure} Tidak ada data yang tersimpan.</p>
            </div>
          </div>
        )}

        <div className="modal-footer -mx-[26px] mt-2 flex justify-end gap-2 border-t border-surface-border bg-surface-hover/40 px-[26px] py-4">
          {(phase === 'invalid' || phase === 'failed') && (
            <Button type="button" variant="secondary" onClick={reset}>
              Pilih file lain
            </Button>
          )}
          {phase !== 'done' && (
            <Button type="button" variant="secondary" onClick={onClose} disabled={running}>
              Cancel
            </Button>
          )}
          {(phase === 'setup' || running) && (
            <Button type="button" onClick={run} disabled={!canRun || running}>
              {running ? 'Memproses…' : 'Import'}
            </Button>
          )}
          {phase === 'done' && (
            <Button type="button" onClick={onClose}>
              Selesai
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default UserImportModal
