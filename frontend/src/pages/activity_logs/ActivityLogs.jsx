import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import ActivityLogDetailModal from './ActivityLogDetailModal'
import { getActivityLogs } from '../../api/activityLogs'

const actionVariant = { create: 'success', update: 'primary', delete: 'danger', login: 'success', logout: 'neutral', view: 'neutral' }

function ActivityLogs() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', { page, limit, search, module, action, dateFrom, dateTo }],
    queryFn: () =>
      getActivityLogs({
        page,
        limit,
        search,
        module: module || undefined,
        action: action || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  })

  const columns = [
    {
      key: 'created_at',
      label: 'Time',
      render: (row) => (row.created_at ? format(new Date(row.created_at), 'PP p') : '-'),
    },
    { key: 'user', label: 'User', render: (row) => row.user?.name || 'System' },
    {
      key: 'action',
      label: 'Action',
      render: (row) => <Badge variant={actionVariant[row.action] || 'neutral'}>{row.action}</Badge>,
    },
    { key: 'module', label: 'Module' },
    { key: 'record_id', label: 'Record ID', render: (row) => row.record_id || '-' },
    { key: 'ip_address', label: 'IP' },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Activity Logs</h1>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-surface-border bg-surface-card p-4 sm:grid-cols-4">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All</option>
          {['create', 'update', 'delete', 'login', 'logout', 'view'].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input label="Module" value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. users" />
        <Input label="Date From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="Date To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <Table
        columns={columns}
        data={data?.data || []}
        loading={isLoading}
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        page={page}
        limit={limit}
        total={data?.meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l)
          setPage(1)
        }}
        onRowClick={(row) => setSelected(row)}
      />

      <ActivityLogDetailModal open={!!selected} onClose={() => setSelected(null)} log={selected} />
    </div>
  )
}

export default ActivityLogs
