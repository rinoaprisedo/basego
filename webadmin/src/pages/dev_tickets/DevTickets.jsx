import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Bot, Copy, FileSpreadsheet, Filter, Paperclip, Plus } from 'lucide-react'
import Table from '../../components/ui/Table'
import Select from '../../components/ui/Select'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FilterPanel from '../../components/ui/FilterPanel'
import { Menubar, MenubarAction, MenubarLabel, MenubarMenu, MenubarSeparator } from '../../components/ui/Menubar'
import usePageActions from '../../hooks/usePageActions'
import usePermission from '../../hooks/usePermission'
import useFilters, { compact } from '../../hooks/useFilters'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { deleteTicket, getTicketMeta, getTickets } from '../../api/devTickets'
import { DEV_STATUS_DOT, buildPrompt, copyText, dateOnly } from './ticketUtils'
import { CategoryBadge, DevStatusBadge, Platform, PriorityBadge, QCStatus } from './TicketBits'
import TicketFormModal from './TicketFormModal'
import TicketDetailModal from './TicketDetailModal'
import ImportModal from './ImportModal'
import ClaudeAccessModal from './ClaudeAccessModal'
import { cn } from '../../utils/cn'

const MENU = 'dev-tickets'
const INITIAL_FILTERS = { platform: '', role: '', priority: '', category: '', qc_status: '', module: '' }

// "Aktif" = everything still waiting on development.
const TABS = [
  { key: '', label: 'Semua' },
  { key: 'todo,in_progress,need_info', label: 'Aktif' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'need_info', label: 'Butuh Info' },
  { key: 'done_by_claude', label: 'Done by Claude' },
  { key: 'done', label: 'Done' },
  { key: 'wont_fix', label: "Won't Fix" },
]

function DevTickets() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [sortBy, setSortBy] = useState('number')
  const [sortDir, setSortDir] = useState('desc')
  const [tab, setTab] = useState('todo,in_progress,need_info')
  const { filters, active, field, apply, reset } = useFilters(INITIAL_FILTERS)
  const [form, setForm] = useState(null) // null | {} (new) | ticket
  const [importing, setImporting] = useState(false)
  const [access, setAccess] = useState(false)
  const [deleting, setDeleting] = useState(null)

  // ?t=12 opens a ticket directly, so a ticket link can be shared.
  const openNumber = Number(params.get('t')) || null
  const openTicket = (n) => setParams(n ? { t: String(n) } : {}, { replace: !n })

  useEffect(() => setPage(1), [debouncedSearch, tab, filters])

  const { data: metaRes } = useQuery({ queryKey: ['dev-ticket-meta'], queryFn: getTicketMeta })
  const meta = metaRes?.data
  const counts = meta?.counts

  const { data, isLoading } = useQuery({
    queryKey: ['dev-tickets', { page, limit, debouncedSearch, sortBy, sortDir, tab, filters }],
    queryFn: () =>
      getTickets(compact({ page, limit, search: debouncedSearch, sort_by: sortBy, sort_dir: sortDir, dev_status: tab, ...filters })),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (n) => deleteTicket(n),
    onSuccess: () => {
      toast.success('Tiket dihapus')
      queryClient.invalidateQueries({ queryKey: ['dev-tickets'] })
      queryClient.invalidateQueries({ queryKey: ['dev-ticket-meta'] })
      setDeleting(null)
      openTicket(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menghapus'),
  })

  const tabCount = (key) => {
    if (!counts) return null
    if (!key) return counts.total
    return key.split(',').reduce((n, k) => n + (counts.dev_status[k] || 0), 0)
  }

  const columns = [
    {
      key: 'number',
      label: 'No',
      sortable: true,
      render: (row) => <span className="font-mono text-xs font-semibold text-text-secondary">#{row.number}</span>,
    },
    {
      key: 'reported_on',
      label: 'Tanggal',
      sortable: true,
      render: (row) => <span className="whitespace-nowrap text-text-secondary">{dateOnly(row.reported_on).split('-').reverse().join('/')}</span>,
    },
    { key: 'platform', label: 'Platform', render: (row) => <Platform platform={row.platform} /> },
    { key: 'role', label: 'Role', render: (row) => <span className="whitespace-nowrap text-text-secondary">{row.role}</span> },
    { key: 'module', label: 'Modul', sortable: true, render: (row) => <span className="font-medium">{row.module}</span> },
    {
      key: 'issue',
      label: 'Issue',
      render: (row) => (
        <div className="flex max-w-md items-start gap-1.5">
          <span className="line-clamp-2 text-text-secondary">{row.issue}</span>
          {row.attachments?.length > 0 && (
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[11px] text-text-tertiary">
              <Paperclip size={11} />
              {row.attachments.length}
            </span>
          )}
        </div>
      ),
    },
    { key: 'priority', label: 'Priority', sortable: true, render: (row) => <PriorityBadge priority={row.priority} /> },
    { key: 'category', label: 'Category', render: (row) => <CategoryBadge category={row.category} /> },
    { key: 'qc_status', label: 'QC', render: (row) => <QCStatus status={row.qc_status} /> },
    { key: 'dev_status', label: 'Development', render: (row) => <DevStatusBadge status={row.dev_status} /> },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <button
          type="button"
          title="Salin prompt Claude"
          onClick={(e) => {
            e.stopPropagation()
            copyText(buildPrompt(row), `Prompt tiket #${row.number} disalin`)
          }}
          className="rounded p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-primary"
        >
          <Copy size={15} />
        </button>
      ),
    },
  ]

  usePageActions(
    useMemo(
      () => (
        <Menubar>
          <MenubarLabel>Tiket</MenubarLabel>
          <MenubarSeparator />
          {canCreate(MENU) && <MenubarAction label="Tiket baru" icon={Plus} onClick={() => setForm({})} />}
          {canCreate(MENU) && <MenubarAction label="Import" icon={FileSpreadsheet} onClick={() => setImporting(true)} />}
          <MenubarMenu id="filter" label="Filter" icon={Filter} align="sheet" active={active}>
            {(close) =>
              meta && (
                <FilterPanel close={close} onApply={apply} onReset={reset}>
                  {[
                    ['platform', 'Platform', meta.platforms],
                    ['role', 'Role', meta.roles],
                    ['priority', 'Priority', meta.priorities],
                    ['category', 'Category', meta.categories],
                    ['qc_status', 'QC status', meta.qc_statuses],
                    ['module', 'Modul', meta.modules],
                  ].map(([key, label, options]) => (
                    <Select key={key} label={label} {...field(key)}>
                      <option value="">Semua</option>
                      {options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  ))}
                </FilterPanel>
              )
            }
          </MenubarMenu>
          <MenubarSeparator />
          <MenubarAction label="Akses Claude" icon={Bot} onClick={() => setAccess(true)} />
        </Menubar>
      ),
      [canCreate, meta, active, field, apply, reset],
    ),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-surface-border bg-surface-card p-1 [scrollbar-width:none]">
          {TABS.map((t) => {
            const n = tabCount(t.key)
            const single = t.key && !t.key.includes(',')
            return (
              <button
                key={t.key || 'all'}
                onClick={() => setTab(t.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  tab === t.key ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover',
                )}
              >
                {single && <span className={cn('h-1.5 w-1.5 rounded-full', tab === t.key ? 'bg-white' : DEV_STATUS_DOT[t.key])} />}
                {t.label}
                {n != null && (
                  <span className={cn('rounded-full px-1.5 text-[11px]', tab === t.key ? 'bg-white/20' : 'bg-surface-hover text-text-tertiary')}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
        {counts?.open_high > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger">
            <AlertTriangle size={13} /> {counts.open_high} tiket High/Critical belum selesai
          </span>
        )}
        {counts?.qc_status?.Reopen > 0 && (
          <span className="inline-flex items-center rounded-md bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning">
            {counts.qc_status.Reopen} dibuka ulang QC
          </span>
        )}
      </div>

      <Table
        columns={columns}
        data={data?.data || []}
        loading={isLoading}
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortBy(key)
          setSortDir(dir)
        }}
        page={page}
        limit={limit}
        total={data?.meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l)
          setPage(1)
        }}
        onRowClick={(row) => openTicket(row.number)}
      />

      <TicketDetailModal
        number={openNumber}
        onClose={() => openTicket(null)}
        meta={meta}
        canEdit={canEdit(MENU)}
        canDelete={canDelete(MENU)}
        onEdit={(t) => setForm(t)}
        onDelete={(t) => setDeleting(t)}
      />
      <TicketFormModal
        open={!!form}
        onClose={() => setForm(null)}
        ticket={form?.number ? form : null}
        meta={meta}
        onSaved={(t) => !form?.number && openTicket(t.number)}
      />
      <ImportModal open={importing} onClose={() => setImporting(false)} meta={meta} />
      <ClaudeAccessModal open={access} onClose={() => setAccess(false)} canEdit={canEdit(MENU)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting.number)}
        title={deleting ? `Hapus tiket #${deleting.number}?` : ''}
        message="Tiket dan timeline-nya akan dihapus."
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

export default DevTickets
