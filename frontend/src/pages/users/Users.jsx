import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react'
import { format } from 'date-fns'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import UserFormModal from './UserFormModal'
import UserSessionsModal from './UserSessionsModal'
import { getUsers, createUser, updateUser, deleteUser } from '../../api/users'
import { getRoles } from '../../api/roles'
import usePermission from '../../hooks/usePermission'

const statusVariant = { active: 'success', inactive: 'neutral', suspended: 'danger' }

function Users() {
  const { canCreate, canEdit, canDelete } = usePermission()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [sessionsUser, setSessionsUser] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, limit, search, sortBy, sortDir }],
    queryFn: () => getUsers({ page, limit, search, sort_by: sortBy, sort_dir: sortDir }),
  })

  const { data: rolesData } = useQuery({ queryKey: ['roles', 'all'], queryFn: () => getRoles({ limit: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? updateUser(editing.uuid, payload) : createUser(payload)),
    onSuccess: () => {
      toast.success(editing ? 'User updated' : 'User created')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (uuid) => deleteUser(uuid),
    onSuccess: () => {
      toast.success('User deleted')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeleting(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {row.avatar ? (
              <img src={row.avatar} alt={row.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              row.name?.charAt(0).toUpperCase()
            )}
          </div>
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge variant={statusVariant[row.status] || 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'roles',
      label: 'Roles',
      render: (row) => (row.roles || []).map((r) => r.name).join(', ') || '-',
    },
    {
      key: 'last_login_at',
      label: 'Last Login',
      sortable: true,
      render: (row) => (row.last_login_at ? format(new Date(row.last_login_at), 'PP p') : 'Never'),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => setSessionsUser(row)} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700" title="Sessions">
            <KeyRound size={16} />
          </button>
          {canEdit('users') && (
            <button
              onClick={() => {
                setEditing(row)
                setFormOpen(true)
              }}
              className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Edit"
            >
              <Pencil size={16} />
            </button>
          )}
          {canDelete('users') && (
            <button onClick={() => setDeleting(row)} className="rounded p-1.5 text-danger hover:bg-danger/10" title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary dark:text-slate-100">Users</h1>
        {canCreate('users') && (
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} /> Add User
          </Button>
        )}
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
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(k, d) => {
          setSortBy(k)
          setSortDir(d)
        }}
        page={page}
        limit={limit}
        total={data?.meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(l) => {
          setLimit(l)
          setPage(1)
        }}
      />

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => saveMutation.mutate(values)}
        initialData={editing}
        roles={rolesData?.data || []}
        loading={saveMutation.isPending}
      />

      <UserSessionsModal open={!!sessionsUser} onClose={() => setSessionsUser(null)} user={sessionsUser} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting.uuid)}
        loading={deleteMutation.isPending}
        message={`Delete user "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}

export default Users
